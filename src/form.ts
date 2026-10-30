import {
  FIELD_ORDER,
  formatWhatsapp,
  normalizeWhatsapp,
  validateSubmission,
  type FieldName,
} from '../shared/interest.js';

const ENDPOINT = '/api/responses';
const TIMEOUT_MS = 15_000;

// What the history entry keeps after a successful send, so a reload shows
// the confirmation again. Never any of the answers themselves.
type SentState = { sent: true; testInvite: boolean };

export function setupInterestForm(document: Document): void {
  const form = document.querySelector<HTMLFormElement>('#interesse')!;
  const formView = document.querySelector<HTMLElement>('#formulario')!;
  const doneView = document.querySelector<HTMLElement>('#confirmacao')!;
  const button = form.querySelector<HTMLButtonElement>('.button')!;
  const sending = form.querySelector<HTMLElement>('.submit__sending')!;
  const failure = form.querySelector<HTMLElement>('.failure')!;
  const whatsapp = form.querySelector<HTMLInputElement>('#whatsapp')!;

  let attempted = false;
  let inFlight = false;

  const state = history.state as Partial<SentState> | null;
  if (state?.sent) showConfirmation(Boolean(state.testInvite), false);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (inFlight) return;
    attempted = true;
    clearFailure();

    const payload = readForm();
    const result = validateSubmission(payload);
    if (!result.ok && result.fields.length > 0) {
      showErrors(result.fields);
      focusField(result.fields[0]!);
      return;
    }
    showErrors([]);
    void send(payload);
  });

  // After a first attempt, fixing a field clears its error right away; a
  // field only gets marked again when the person leaves it or sends again.
  form.addEventListener('input', (event) => updateFieldFrom(event.target, false));
  form.addEventListener('change', (event) => updateFieldFrom(event.target, true));
  form.addEventListener('focusout', (event) => updateFieldFrom(event.target, true));

  whatsapp.addEventListener('blur', () => {
    const normalized = normalizeWhatsapp(whatsapp.value);
    if (normalized) whatsapp.value = formatWhatsapp(normalized);
  });

  function readForm() {
    const data = new FormData(form);
    return {
      interest: data.get('interest'),
      format: data.get('format'),
      name: data.get('name'),
      whatsapp: data.get('whatsapp'),
      testInvite: data.get('testInvite') === 'sim',
      consentVersion: form.dataset.consentVersion,
      trap: data.get('trap') ?? '',
    };
  }

  async function send(payload: ReturnType<typeof readForm>) {
    setSending(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.ok) {
        history.replaceState({ sent: true, testInvite: payload.testInvite } satisfies SentState, '');
        showConfirmation(payload.testInvite, true);
        return;
      }

      if (response.status === 422) {
        const body = (await response.json().catch(() => null)) as { fields?: unknown } | null;
        const fields = Array.isArray(body?.fields)
          ? FIELD_ORDER.filter((field) => (body.fields as unknown[]).includes(field))
          : [];
        if (fields.length > 0) {
          showErrors(fields);
          focusField(fields[0]!);
          return;
        }
      }
      showFailure();
    } catch {
      showFailure();
    } finally {
      setSending(false);
    }
  }

  function setSending(on: boolean) {
    inFlight = on;
    button.textContent = on ? button.dataset.sendingLabel! : button.dataset.label!;
    if (on) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    sending.textContent = on ? sending.dataset.text! : '';
  }

  function showFailure() {
    failure.innerHTML =
      '<p class="failure__title">não conseguimos guardar sua resposta.</p>' +
      '<p class="failure__text">o que você preencheu continua aqui. confira a conexão e tente enviar de novo.</p>';
  }

  function clearFailure() {
    failure.replaceChildren();
  }

  function showConfirmation(testInvite: boolean, moveFocus: boolean) {
    formView.hidden = true;
    doneView.hidden = false;
    doneView.querySelector<HTMLElement>('.done__test-invite')!.hidden = !testInvite;
    if (moveFocus) {
      window.scrollTo(0, 0);
      doneView.querySelector<HTMLElement>('.done__title')!.focus({ preventScroll: true });
    }
  }

  function updateFieldFrom(target: EventTarget | null, mayMarkInvalid: boolean) {
    if (!attempted || !(target instanceof HTMLInputElement)) return;
    const field = FIELD_ORDER.find((name) => name === target.name);
    if (!field) return;
    const result = validateSubmission(readForm());
    const invalid = !result.ok && result.fields.includes(field);
    if (!invalid || mayMarkInvalid) setFieldError(field, invalid);
  }

  function showErrors(fields: FieldName[]) {
    for (const field of FIELD_ORDER) setFieldError(field, fields.includes(field));
  }

  function setFieldError(field: FieldName, invalid: boolean) {
    const container = form.querySelector<HTMLElement>(`[data-field="${field}"]`)!;
    const message = document.getElementById(`${field}-error`)!;
    message.hidden = !invalid;
    container.toggleAttribute('data-invalid', invalid);

    for (const input of container.querySelectorAll<HTMLInputElement>('input')) {
      const described = new Set((input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
      if (invalid) described.add(message.id);
      else described.delete(message.id);
      if (described.size > 0) input.setAttribute('aria-describedby', [...described].join(' '));
      else input.removeAttribute('aria-describedby');
      if (invalid) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function focusField(field: FieldName) {
    const container = form.querySelector<HTMLElement>(`[data-field="${field}"]`)!;
    const target =
      container.querySelector<HTMLInputElement>('input:checked') ?? container.querySelector<HTMLInputElement>('input')!;
    target.focus();
  }
}
