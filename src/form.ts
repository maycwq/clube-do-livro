import {
  FIELD_ORDER,
  errorFields,
  formatWhatsapp,
  normalizeWhatsapp,
  validateSubmission,
  type FieldError,
  type FieldErrors,
  type FieldName,
} from '../shared/interest.js';
import { failureMessages, fieldMessages, sendingStatus, type FailureKind } from './messages.js';

const ENDPOINT = '/api/responses';
const TIMEOUT_MS = 15_000;
const DEFAULT_WAIT_SECONDS = 600;

// What the history entry keeps after a successful send, so a reload shows
// the confirmation again. Never any of the answers themselves.
type SentState = { sent: true; testInvite: boolean };

export function setupInterestForm(document: Document): void {
  const form = document.querySelector<HTMLFormElement>('#interesse')!;
  const formView = document.querySelector<HTMLElement>('#formulario')!;
  const doneView = document.querySelector<HTMLElement>('#confirmacao')!;
  const button = form.querySelector<HTMLButtonElement>('.button')!;
  const status = form.querySelector<HTMLElement>('.submit__status')!;
  const failure = form.querySelector<HTMLElement>('.failure')!;
  const whatsapp = form.querySelector<HTMLInputElement>('#whatsapp')!;

  let attempted = false;
  let inFlight = false;
  // One id per set of answers: sending the same answers again (a retry after
  // an unclear failure) reuses it, so the server records them only once.
  let current: { answers: string; id: string } | null = null;
  // After a 429, sending waits until the time the server asked for.
  let waitUntil = 0;
  let failureTimer: ReturnType<typeof setTimeout> | undefined;

  const state = history.state as Partial<SentState> | null;
  if (state?.sent) showConfirmation(Boolean(state.testInvite), false);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (inFlight) return;
    attempted = true;
    clearFailure();

    const payload = readForm();
    const result = validateSubmission(payload);
    if (!result.ok && Object.keys(result.errors).length > 0) {
      showErrors(result.errors);
      focusField(errorFields(result.errors)[0]!);
      return;
    }
    showErrors({});

    if (Date.now() < waitUntil) {
      showFailure('tooMany');
      return;
    }
    void send(payload);
  });

  // Errors only appear on submit. After that, fixing a field clears its
  // message while typing; a field is checked again (and its message updated)
  // only when the person leaves it or sends again.
  form.addEventListener('input', (event) => updateFieldFrom(event.target, false));
  form.addEventListener('change', (event) => updateFieldFrom(event.target, true));
  form.addEventListener('focusout', (event) => updateFieldFrom(event.target, true));

  whatsapp.addEventListener('blur', () => {
    const normalized = normalizeWhatsapp(whatsapp.value);
    if (normalized) whatsapp.value = formatWhatsapp(normalized);
  });

  function readForm() {
    const data = new FormData(form);
    const answers = {
      interest: data.get('interest'),
      format: data.get('format'),
      name: data.get('name'),
      whatsapp: data.get('whatsapp'),
      testInvite: data.get('testInvite') === 'sim',
    };
    return {
      ...answers,
      submissionId: submissionIdFor(JSON.stringify(answers)),
      consentVersion: form.dataset.consentVersion,
      trap: data.get('trap') ?? '',
    };
  }

  function submissionIdFor(answers: string): string {
    if (current?.answers !== answers) current = { answers, id: crypto.randomUUID() };
    return current.id;
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
      const body = (await response.json().catch(() => null)) as { ok?: unknown; error?: unknown; fields?: unknown } | null;

      if (response.ok && body?.ok === true) {
        history.replaceState({ sent: true, testInvite: payload.testInvite } satisfies SentState, '');
        showConfirmation(payload.testInvite, true);
        return;
      }

      if (response.status === 422 && body?.fields && typeof body.fields === 'object') {
        const errors = knownErrors(body.fields as Record<string, unknown>);
        if (Object.keys(errors).length > 0) {
          showErrors(errors);
          focusField(errorFields(errors)[0]!);
          return;
        }
      }

      if (response.status === 429) {
        waitUntil = Date.now() + retryAfterSeconds(response.headers.get('retry-after')) * 1000;
        showFailure('tooMany');
      } else if (response.status === 503 && body?.error === 'not_stored') {
        showFailure('notStored');
      } else if (response.status >= 500) {
        // A gateway timeout, a crash or anything else the server didn't
        // explain: the answers may have been stored.
        showFailure('unconfirmed');
      } else {
        showFailure('unexpected');
      }
    } catch {
      // No answer at all (offline, connection dropped, timeout).
      showFailure('unconfirmed');
    } finally {
      setSending(false);
    }
  }

  function setSending(on: boolean) {
    inFlight = on;
    button.textContent = on ? button.dataset.sendingLabel! : button.dataset.label!;
    if (on) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    status.textContent = on ? sendingStatus : '';
  }

  function showFailure(kind: FailureKind) {
    const { title, text } = failureMessages[kind];
    const heading = document.createElement('p');
    heading.className = 'failure__title';
    heading.textContent = title;
    const description = document.createElement('p');
    description.className = 'failure__text';
    description.textContent = text;
    // Emptied first and filled a moment later, so the alert is announced
    // again even when the same message repeats.
    clearFailure();
    failureTimer = setTimeout(() => failure.replaceChildren(heading, description), 50);
  }

  function clearFailure() {
    clearTimeout(failureTimer);
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
    const error = result.ok ? undefined : result.errors[field];
    if (!error || mayMarkInvalid) setFieldError(field, error);
  }

  function showErrors(errors: FieldErrors) {
    for (const field of FIELD_ORDER) setFieldError(field, errors[field]);
  }

  function setFieldError(field: FieldName, error: FieldError | undefined) {
    const container = form.querySelector<HTMLElement>(`[data-field="${field}"]`)!;
    const message = document.getElementById(`${field}-error`)!;
    message.textContent = error ? (fieldMessages[field][error] ?? fieldMessages[field].missing) : '';
    message.hidden = !error;
    container.toggleAttribute('data-invalid', Boolean(error));

    for (const input of container.querySelectorAll<HTMLInputElement>('input')) {
      // The error comes first, so it's heard before any help text.
      const others = (input.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== message.id);
      const described = error ? [message.id, ...others] : others;
      if (described.length > 0) input.setAttribute('aria-describedby', described.join(' '));
      else input.removeAttribute('aria-describedby');
      if (error) input.setAttribute('aria-invalid', 'true');
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

function knownErrors(fields: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of FIELD_ORDER) {
    const error = fields[field];
    if (error === 'missing' || error === 'invalid' || error === 'too_long') errors[field] = error;
  }
  return errors;
}

/** Retry-After in seconds or as an HTTP date; ten minutes when absent. */
function retryAfterSeconds(header: string | null): number {
  if (!header) return DEFAULT_WAIT_SECONDS;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  return Number.isNaN(date) ? DEFAULT_WAIT_SECONDS : Math.max(0, (date - Date.now()) / 1000);
}
