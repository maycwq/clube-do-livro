import { expect, test, type Page } from '@playwright/test';
import { confirmation, fill, optInNote, phone, stored, submitButton } from './helpers.js';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the test invite starts unchecked and every answer is empty', async ({ page }) => {
  await expect(page.getByLabel('sim, me chama pra testar também')).not.toBeChecked();
  for (const radio of await page.getByRole('radio').all()) await expect(radio).not.toBeChecked();
  await expect(page.getByLabel('como a gente pode te chamar?')).toHaveValue('');
});

test.describe('validation', () => {
  test('nothing is flagged before the first attempt to send', async ({ page }) => {
    await page.getByLabel('seu WhatsApp').fill('9999');
    await page.getByLabel('seu WhatsApp').blur();
    await page.getByLabel('como a gente pode te chamar?').fill('   ');
    await page.getByLabel('como a gente pode te chamar?').blur();
    await expect(page.locator('.error:visible')).toHaveCount(0);
  });

  test('an empty form explains every field, focuses the first one and stores nothing', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await submitButton(page).click();

    await expect(page.getByText('escolha uma das opções.')).toHaveCount(2);
    await expect(page.getByText('informe como a gente pode te chamar.')).toBeVisible();
    await expect(page.getByText('informe seu WhatsApp com DDD.')).toBeVisible();
    await expect(page.getByLabel('sim, eu toparia')).toBeFocused();
    await expect(page.getByLabel('sim, eu toparia')).toHaveAccessibleDescription('escolha uma das opções.');
    await expect(page.getByLabel('seu WhatsApp')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('seu WhatsApp')).toHaveAccessibleDescription(
      /^informe seu WhatsApp com DDD\. com DDD\. quando tivermos novidades/,
    );
    expect(await stored(page, typed)).toEqual({ responses: [], changeRequests: [] });
  });

  test('a name made of spaces counts as empty', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo), { name: '    ' });
    await submitButton(page).click();
    await expect(page.getByText('informe como a gente pode te chamar.')).toBeVisible();
    await expect(page.getByLabel('como a gente pode te chamar?')).toBeFocused();
  });

  test('a WhatsApp that is there but malformed gets its own message', async ({ page }) => {
    await fill(page, '9999-9999');
    await submitButton(page).click();
    await expect(page.getByText('confira o DDD e o número do WhatsApp.')).toBeVisible();
    await expect(page.getByText('informe seu WhatsApp com DDD.')).toBeHidden();
    await expect(page.getByLabel('seu WhatsApp')).toBeFocused();
    await expect(page.getByLabel('seu WhatsApp')).toHaveValue('9999-9999');
  });

  test('after an attempt, errors clear as fields are fixed and come back only when leaving them', async ({ page }, testInfo) => {
    await submitButton(page).click();

    await page.getByLabel('talvez, depende de como funcionar').check();
    await expect(page.locator('#interest-error')).toBeHidden();
    await expect(page.locator('#format-error')).toBeVisible();

    const whatsapp = page.getByLabel('seu WhatsApp');
    await whatsapp.fill(phone(testInfo));
    await expect(page.locator('#whatsapp-error')).toBeHidden();
    await expect(whatsapp).not.toHaveAttribute('aria-invalid', 'true');

    // Breaking it again while typing doesn't bring the message back...
    await whatsapp.fill('(31) 9');
    await expect(page.locator('#whatsapp-error')).toBeHidden();
    // ...leaving the field does, with the message for what's there now.
    await whatsapp.blur();
    await expect(page.locator('#whatsapp-error')).toHaveText('confira o DDD e o número do WhatsApp.');

    await whatsapp.fill('');
    await whatsapp.blur();
    await expect(page.locator('#whatsapp-error')).toHaveText('informe seu WhatsApp com DDD.');
    await expect(page.locator('#name-error')).toBeVisible();
  });

  test('the name field stops at 80 characters, and a longer name from the server is explained', async ({ page }, testInfo) => {
    await expect(page.getByLabel('como a gente pode te chamar?')).toHaveAttribute('maxlength', '80');
    await fill(page, phone(testInfo));
    await page.route('/api/responses', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json', body: '{"error":"invalid","fields":{"name":"too_long"}}' }),
    );
    await submitButton(page).click();
    await expect(page.getByText('use até 80 caracteres no nome ou apelido.')).toBeVisible();
    await expect(page.getByLabel('como a gente pode te chamar?')).toBeFocused();
  });
});

test.describe('sending', () => {
  test('a valid answer is stored and only then confirmed', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await fill(page, typed.replace(/\D/g, ''), { interest: 'talvez, depende de como funcionar', format: 'dos dois formatos' });
    await submitButton(page).click();

    await expect(confirmation(page)).toBeFocused();
    await expect(page.getByText('valeu por responder.')).toBeVisible();
    await expect(page.getByText('isso ainda não é inscrição nem entrada em grupo. a decisão de participar fica pra depois.')).toBeVisible();
    await expect(optInNote(page)).toBeHidden();
    expect((await stored(page, typed)).responses).toEqual([
      expect.objectContaining({ name: 'Ana', interest: 'talvez', format: 'os-dois', test_invite: false }),
    ]);

    await page.reload();
    await expect(confirmation(page)).toBeVisible();
  });

  test('the test invite is stored on its own, whatever the club answers', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await fill(page, typed, { interest: 'quero acompanhar a ideia antes de decidir', format: 'ainda não sei', optIn: true });
    await submitButton(page).click();

    await expect(optInNote(page)).toBeVisible();
    expect((await stored(page, typed)).responses).toEqual([
      expect.objectContaining({ interest: 'acompanhar', format: 'nao-sei', test_invite: true }),
    ]);
  });

  test('while sending, the button says so, screen readers hear it, and extra clicks send nothing', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    let requests = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('/api/responses', async (route) => {
      requests += 1;
      await held;
      await route.continue();
    });

    await submitButton(page).click();
    const sending = page.getByRole('button', { name: 'enviando...' });
    await expect(sending).toHaveAttribute('aria-disabled', 'true');
    const status = page.getByRole('status');
    await expect(status).toHaveText('enviando sua resposta...');
    expect((await status.boundingBox())!.height).toBeLessThanOrEqual(1); // read, not shown
    await expect(page.getByText('evite enviar novamente')).toHaveCount(0);
    // force: Playwright would otherwise wait for aria-disabled to go away.
    await sending.click({ force: true });
    await page.getByLabel('seu WhatsApp').press('Enter');

    release();
    await expect(confirmation(page)).toBeVisible();
    expect(requests).toBe(1);
  });

  test('personal data never reaches the address bar', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    const { pathname, search, hash } = new URL(page.url());
    expect(pathname + search + hash).toBe('/');
  });

  test('the WhatsApp number is tidied up when leaving the field', async ({ page }) => {
    await page.getByLabel('seu WhatsApp').fill('+55 31 987654321');
    await page.getByLabel('seu WhatsApp').blur();
    await expect(page.getByLabel('seu WhatsApp')).toHaveValue('(31) 98765-4321');
  });
});

test.describe('failures', () => {
  async function expectAlert(page: Page, title: string, text: string) {
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(title);
    await expect(alert).toContainText(text);
    await expect(alert).not.toContainText(/\d{3}|neon|vercel|banco/i);
    await expect(page.locator('#confirmacao')).toBeHidden();
    await expect(submitButton(page)).toBeEnabled();
  }

  test('without a connection, it says the send was not confirmed and keeps everything filled in', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await fill(page, typed, { optIn: true });
    await page.route('/api/responses', (route) => route.abort('internetdisconnected'));
    await submitButton(page).click();

    await expectAlert(page, 'não conseguimos confirmar o envio.', 'sua resposta continua preenchida. tenta de novo.');
    await expect(page.getByLabel('sim, eu toparia')).toBeChecked();
    await expect(page.getByLabel('sim, me chama pra testar também')).toBeChecked();
    await expect(page.getByLabel('seu WhatsApp')).toHaveValue(typed);

    await page.unroute('/api/responses');
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    expect((await stored(page, typed)).responses).toEqual([expect.objectContaining({ test_invite: true })]);
  });

  test('a timeout is treated the same way', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    await page.route('/api/responses', (route) => route.abort('timedout'));
    await submitButton(page).click();
    await expectAlert(page, 'não conseguimos confirmar o envio.', 'sua resposta continua preenchida. tenta de novo.');
  });

  test('when the answer is lost after it was stored, trying again confirms without recording it twice', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await fill(page, typed, { optIn: true });
    await page.route('/api/responses', async (route) => {
      await route.fetch(); // reaches the server and is stored...
      await route.abort('connectionreset'); // ...but the page never hears back
    });
    await submitButton(page).click();
    await expectAlert(page, 'não conseguimos confirmar o envio.', 'sua resposta continua preenchida. tenta de novo.');
    expect((await stored(page, typed)).responses).toHaveLength(1);

    await page.unroute('/api/responses');
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    await expect(optInNote(page)).toBeVisible();
    expect(await stored(page, typed)).toEqual({
      responses: [expect.objectContaining({ test_invite: true })],
      changeRequests: [],
    });
  });

  test('when the server says nothing was stored, it says so', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    await page.route('/api/responses', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"not_stored"}' }),
    );
    await submitButton(page).click();
    await expectAlert(page, 'não conseguimos guardar sua resposta.', 'o que você preencheu continua aqui. tenta enviar de novo.');
  });

  test('a gateway error or crash is reported as unconfirmed', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    for (const status of [504, 500]) {
      await page.route('/api/responses', (route) => route.fulfill({ status, body: 'An error occurred' }));
      await submitButton(page).click();
      await expectAlert(page, 'não conseguimos confirmar o envio.', 'sua resposta continua preenchida. tenta de novo.');
      await page.unroute('/api/responses');
    }
  });

  test('anything else gets the general message', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    await page.route('/api/responses', (route) =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"forbidden"}' }),
    );
    await submitButton(page).click();
    await expectAlert(page, 'não deu pra enviar agora.', 'tenta novamente daqui a pouco.');
  });

  test('too many attempts: it waits the time the server asks before sending again', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo));
    let requests = 0;
    await page.route('/api/responses', (route) => {
      requests += 1;
      return route.fulfill({
        status: 429,
        headers: { 'retry-after': '2' },
        contentType: 'application/json',
        body: '{"error":"too_many_requests"}',
      });
    });

    await submitButton(page).click();
    await expectAlert(page, 'muitas tentativas por aqui.', 'espera alguns minutos e tenta enviar de novo.');
    expect(requests).toBe(1);

    await submitButton(page).click();
    await expectAlert(page, 'muitas tentativas por aqui.', 'espera alguns minutos e tenta enviar de novo.');
    expect(requests).toBe(1);

    await page.unroute('/api/responses');
    await page.waitForTimeout(2100);
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
  });
});

test.describe('numbers already here', () => {
  async function sendAnswers(page: Page, typed: string, options: Parameters<typeof fill>[2]) {
    await page.goto('/');
    await page.evaluate(() => history.replaceState(null, ''));
    await page.reload();
    await fill(page, typed, options);
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
  }

  test("nobody can turn someone else's test invite off, or change their answers", async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await sendAnswers(page, typed, { name: 'Ana', optIn: true });
    await sendAnswers(page, typed, { name: 'Outra pessoa', format: 'online, se acontecerem', optIn: false });

    await expect(optInNote(page)).toBeHidden();
    expect(await stored(page, typed)).toEqual({
      responses: [expect.objectContaining({ name: 'Ana', format: 'presencial', test_invite: true })],
      changeRequests: [expect.objectContaining({ name: 'Outra pessoa', format: 'online', test_invite: false })],
    });
  });

  test("nobody can turn someone else's test invite on", async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await sendAnswers(page, typed, { optIn: false });
    await sendAnswers(page, typed, { optIn: true });

    // The request with the invite was recorded, so the note is true; the stored answer is untouched.
    await expect(optInNote(page)).toBeVisible();
    expect(await stored(page, typed)).toEqual({
      responses: [expect.objectContaining({ test_invite: false })],
      changeRequests: [expect.objectContaining({ test_invite: true })],
    });
  });

  test('the page looks the same whether the number was new or not', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await sendAnswers(page, typed, {});
    const first = await page.locator('#confirmacao').innerText();
    await sendAnswers(page, typed, { name: 'Outra pessoa' });
    expect(await page.locator('#confirmacao').innerText()).toBe(first);
  });

  test('sending the same answers again records nothing new', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await sendAnswers(page, typed, { optIn: true });
    await sendAnswers(page, typed, { optIn: true });
    expect(await stored(page, typed)).toEqual({
      responses: [expect.objectContaining({ test_invite: true })],
      changeRequests: [],
    });
  });
});

test('the whole form works from the keyboard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'keyboard flow is checked on desktop');
  const typed = phone(testInfo);

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('sim, eu toparia')).toBeFocused();
  // Sending too early from the keyboard lands on the first problem.
  await submitButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('sim, eu toparia')).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('talvez, depende de como funcionar')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('presenciais em ipatinga')).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('sim, me chama pra testar também')).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Ana');
  await page.keyboard.press('Tab');
  await page.keyboard.type(typed);
  await page.keyboard.press('Tab');
  await expect(submitButton(page)).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(confirmation(page)).toBeFocused();
  expect((await stored(page, typed)).responses).toEqual([
    expect.objectContaining({ interest: 'talvez', format: 'presencial', test_invite: true }),
  ]);
});

test('the light only moves when motion is welcome, and only with transform and opacity', async ({ page }) => {
  await page.goto('/');
  const animated = () =>
    page.evaluate(() =>
      document.getAnimations().flatMap((animation) => {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        return frames.flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)));
      }),
    );
  const properties = await animated();
  expect(properties.length).toBeGreaterThan(0);
  expect(new Set(properties)).toEqual(new Set(['opacity', 'transform']));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animated()).toEqual([]);
});
