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
  const nameField = (page: Page) => page.getByLabel('como a gente pode te chamar?');
  const whatsappField = (page: Page) => page.getByLabel('seu WhatsApp');
  const errorOf = (page: Page, field: string) => page.locator(`#${field}-error`);
  const characters = 'use apenas números e sinais de telefone, sem letras ou outros símbolos.';
  const checkNumber = 'confira o DDD e o número do WhatsApp.';

  test('typing a number and a name flags nothing on the way', async ({ page }) => {
    await whatsappField(page).focus();
    for (const key of '(31) 98765-4321') {
      await page.keyboard.type(key);
      await expect(errorOf(page, 'whatsapp')).toBeHidden();
      await expect(whatsappField(page)).not.toHaveAttribute('aria-invalid');
    }
    await nameField(page).focus();
    for (const key of 'Zoë') {
      await page.keyboard.type(key);
      await expect(errorOf(page, 'name')).toBeHidden();
    }
    await expect(whatsappField(page)).toHaveValue('(31) 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
  });

  test('passing through the fields and the choices without answering flags nothing', async ({ page }) => {
    await nameField(page).focus();
    await page.keyboard.press('Tab');
    await expect(whatsappField(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await page.mouse.wheel(0, -3000);
    await page.getByLabel('sim, eu toparia').focus();
    await page.keyboard.press('Tab');
    await page.mouse.wheel(0, 3000);
    await expect(page.locator('.error:visible')).toHaveCount(0);
    await expect(page.locator('[aria-invalid]')).toHaveCount(0);
  });

  test('leaving a field half done or emptied says what to fix, keeping what was typed', async ({ page }) => {
    await whatsappField(page).fill('(31) 9876');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await whatsappField(page).blur();
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber);
    await expect(whatsappField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(whatsappField(page)).toHaveValue('(31) 9876');

    await whatsappField(page).fill('98765-4321');
    await whatsappField(page).blur();
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber); // no area code

    await nameField(page).fill('Ana');
    await nameField(page).fill('');
    await nameField(page).blur();
    await expect(errorOf(page, 'name')).toHaveText('informe como a gente pode te chamar.');
  });

  test('letters in the WhatsApp are flagged while typing, kept as typed, and the message goes with them', async ({ page }) => {
    const input = whatsappField(page);
    await input.pressSequentially('31 9876');
    await input.press('a');
    await expect(errorOf(page, 'whatsapp')).toHaveText(characters);
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveValue('31 9876a');

    // Gone as soon as the letter is, although the number is still incomplete.
    await input.press('Backspace');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-invalid');
    await input.pressSequentially('5-4321');
    await input.blur();
    await expect(input).toHaveValue('(31) 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
  });

  test('a pasted number is taken as it is: tidied when it is one, explained and left alone when it is not', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const input = whatsappField(page);
    const paste = async (text: string) => {
      await page.evaluate((text) => navigator.clipboard.writeText(text), text);
      await input.press('ControlOrMeta+V');
    };

    await input.focus();
    await paste('+55 (31) 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await input.blur();
    await expect(input).toHaveValue('(31) 98765-4321');

    await input.fill('');
    await paste('WhatsApp: (31) 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toHaveText(characters);
    await input.blur();
    await expect(input).toHaveValue('WhatsApp: (31) 98765-4321');

    await input.focus();
    await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(0, 10));
    await input.press('Backspace');
    await expect(input).toHaveValue('(31) 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
  });

  test('a digit too many is flagged as soon as it is typed', async ({ page }) => {
    const input = whatsappField(page);
    await input.pressSequentially('(31) 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await input.press('1');
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber);
    await expect(input).toBeFocused();
    await input.press('Backspace');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();

    // With the country code there is room for two more.
    await input.fill('');
    await input.pressSequentially('+55 31 98765-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
  });

  test('editing in the middle of a number keeps the cursor in place and waits for the person to finish', async ({ page }) => {
    const input = whatsappField(page);
    const caret = () => input.evaluate((element: HTMLInputElement) => element.selectionStart);
    await input.fill('31987654321');
    await input.blur();
    await expect(input).toHaveValue('(31) 98765-4321');

    await input.focus();
    await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(10, 10));
    await input.press('Backspace');
    await expect(input).toHaveValue('(31) 9876-4321');
    expect(await caret()).toBe(9);
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await input.press('0');
    await expect(input).toHaveValue('(31) 98760-4321');
    expect(await caret()).toBe(10);

    // Selecting part of it and typing over it.
    await input.evaluate((element: HTMLInputElement) => element.setSelectionRange(1, 3));
    await input.pressSequentially('21');
    await expect(input).toHaveValue('(21) 98760-4321');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
  });

  test('a corrected error goes away at once, and re-editing does not bring it back early', async ({ page }) => {
    const input = whatsappField(page);
    await input.fill('(31) 9876');
    await input.blur();
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber);

    // Still the same problem while it's being completed...
    await input.focus();
    await input.press('End');
    await input.pressSequentially('5-432');
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber);
    // ...and gone with the last digit, without leaving the field.
    await input.press('1');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await expect(input).not.toHaveAttribute('aria-invalid');

    // Starting over on a number that was fine: nothing until it's finished.
    await input.press('ControlOrMeta+A');
    await input.pressSequentially('(31) 9');
    await expect(errorOf(page, 'whatsapp')).toBeHidden();
    await input.blur();
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber);
  });

  test('a name over 80 characters is kept whole and explained right away', async ({ page }) => {
    const input = nameField(page);
    await expect(input).not.toHaveAttribute('maxlength');
    const long = 'Maria Aparecida '.repeat(6);
    await input.fill(long);
    await expect(input).toHaveValue(long);
    await expect(errorOf(page, 'name')).toHaveText('use até 80 caracteres no nome ou apelido.');
    await expect(input).toBeFocused();
    await input.fill(long.slice(0, 80));
    await expect(errorOf(page, 'name')).toBeHidden();
  });

  test('a long number as a name is questioned when leaving the field; short numbers and unusual nicknames are fine', async ({ page }) => {
    const input = nameField(page);
    await input.fill('5625746785');
    await expect(errorOf(page, 'name')).toBeHidden();
    await input.blur();
    await expect(errorOf(page, 'name')).toHaveText('confira o nome ou apelido que você informou.');
    await input.fill('007');
    await expect(errorOf(page, 'name')).toBeHidden();
    for (const nickname of ['m4yco', 'ana_07', "Zoë-Ann D'Ávila", 'Ольга', '李小龙']) {
      await input.fill(nickname);
      await input.blur();
      await expect(errorOf(page, 'name'), nickname).toBeHidden();
    }
  });

  test('choices are only questioned on submit, the message goes with a choice, and changing it says nothing', async ({ page }) => {
    await page.getByLabel('sim, eu toparia').focus();
    await page.mouse.wheel(0, 1000);
    await expect(errorOf(page, 'interest')).toBeHidden();
    await submitButton(page).click();
    await expect(errorOf(page, 'interest')).toHaveText('escolha uma das opções.');

    await page.getByLabel('talvez, depende de como funcionar').check();
    await expect(errorOf(page, 'interest')).toBeHidden();
    await expect(page.getByLabel('talvez, depende de como funcionar')).not.toHaveAttribute('aria-invalid');
    await page.getByLabel('sim, eu toparia').check();
    await expect(errorOf(page, 'interest')).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('');
    await expect(errorOf(page, 'format')).toBeVisible();
  });

  test('the test invite is optional and never questioned', async ({ page }) => {
    const invite = page.getByLabel('sim, me chama pra testar também');
    await invite.check();
    await invite.uncheck();
    await submitButton(page).click();
    await expect(invite).not.toHaveAttribute('aria-invalid');
    await expect(page.locator('.interlude .error')).toHaveCount(0);
    await expect(page.locator('.error:visible')).toHaveCount(4);
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

  test('sending with problems left shows them all, focuses the first in page order and keeps the answers', async ({ page }) => {
    await page.getByLabel('sim, eu toparia').check();
    await nameField(page).fill('Ana');
    await whatsappField(page).fill('(31) 9876');
    await submitButton(page).click();

    await expect(errorOf(page, 'format')).toHaveText('escolha uma das opções.');
    await expect(errorOf(page, 'whatsapp')).toHaveText(checkNumber);
    await expect(errorOf(page, 'name')).toBeHidden();
    await expect(page.getByLabel('presenciais em ipatinga')).toBeFocused();
    await expect(page.getByLabel('sim, eu toparia')).toBeChecked();
    await expect(nameField(page)).toHaveValue('Ana');
    await expect(whatsappField(page)).toHaveValue('(31) 9876');
  });

  test('a name made of spaces counts as empty', async ({ page }, testInfo) => {
    await fill(page, phone(testInfo), { name: '    ' });
    await submitButton(page).click();
    await expect(errorOf(page, 'name')).toHaveText('informe como a gente pode te chamar.');
    await expect(page.getByLabel('como a gente pode te chamar?')).toBeFocused();
  });

  test('a WhatsApp that is there but malformed gets its own message', async ({ page }) => {
    await fill(page, '9999-9999');
    await submitButton(page).click();
    await expect(page.getByText(checkNumber)).toBeVisible();
    await expect(page.getByText('informe seu WhatsApp com DDD.')).toBeHidden();
    await expect(page.getByLabel('seu WhatsApp')).toBeFocused();
    await expect(page.getByLabel('seu WhatsApp')).toHaveValue('9999-9999');
  });

  test('screen readers hear a message once when it appears, not at every key, and it goes when fixed', async ({ page }) => {
    const status = page.getByRole('status');
    await page.evaluate(() => {
      const region = document.querySelector('.submit__status')!;
      const said: string[] = ((window as unknown as { said: string[] }).said = []);
      new MutationObserver(() => region.textContent && said.push(region.textContent)).observe(region, { childList: true, subtree: true, characterData: true });
    });
    const said = () => page.evaluate(() => (window as unknown as { said: string[] }).said);

    await whatsappField(page).pressSequentially('31 9876abc');
    await expect(status).toHaveText(characters);
    await whatsappField(page).pressSequentially('de');
    await nameField(page).focus();
    await expect(errorOf(page, 'whatsapp')).toHaveText(characters);
    expect(await said()).toEqual([characters]);
    await expect(whatsappField(page)).toHaveAccessibleDescription(new RegExp(`^${characters.replace(/[.,]/g, '\\$&')}`));

    await whatsappField(page).fill('(31) 98765-4321');
    await expect(status).toHaveText('');
    await expect(whatsappField(page)).toHaveAccessibleDescription(/^com DDD\./);
  });

  test('a stored name is the one typed, unusual as it may be', async ({ page }, testInfo) => {
    const typed = phone(testInfo);
    await fill(page, typed, { name: "  Zoë-Ann   D'Ávila " });
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    expect((await stored(page, typed)).responses).toEqual([expect.objectContaining({ name: "Zoë-Ann D'Ávila" })]);
  });

  test("errors the server finds are shown like the page's own", async ({ page }, testInfo) => {
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

test.describe('motion', () => {
  const lightProperties = (page: Page) =>
    page.evaluate(() =>
      document.getAnimations().flatMap((animation) => {
        const effect = animation.effect as KeyframeEffect;
        if (!effect.target?.closest('.light')) return [];
        return effect.getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)));
      }),
    );

  test('the light only moves when motion is welcome, and only with transform and opacity', async ({ page }) => {
    await page.goto('/');
    const properties = await lightProperties(page);
    expect(properties.length).toBeGreaterThan(0);
    expect(new Set(properties)).toEqual(new Set(['translate', 'transform', 'scale', 'rotate', 'opacity']));

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await lightProperties(page)).toEqual([]);
  });

  test('the page moves when it opens and when the answer is confirmed, then rests; only the light keeps going', async ({ page }, testInfo) => {
    const pageMotion = () =>
      page.evaluate(() =>
        document.getAnimations().filter((animation) => !(animation.effect as KeyframeEffect).target?.closest('.light')).length,
      );
    await page.goto('/');
    expect(await pageMotion()).toBeGreaterThan(0);
    await expect.poll(pageMotion, { timeout: 3000 }).toBe(0);

    // Nothing waits for the arrival: the form takes answers right away.
    await page.reload();
    await page.getByLabel('sim, eu toparia').check();
    await expect(page.getByLabel('sim, eu toparia')).toBeChecked();

    await fill(page, phone(testInfo));
    await submitButton(page).click();
    await expect(confirmation(page)).toBeFocused();
    expect(await pageMotion()).toBeGreaterThan(0);
    await expect.poll(pageMotion, { timeout: 3000 }).toBe(0);
  });

  test('with reduced motion, what arrives only fades in, briefly', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const arrivals = await page.evaluate(() =>
      document.getAnimations().map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        return {
          duration: Number(effect.getTiming().duration),
          properties: [...new Set(effect.getKeyframes().flatMap((frame) => Object.keys(frame)))].filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)),
        };
      }),
    );
    for (const arrival of arrivals) {
      expect(arrival.properties).toEqual(['opacity']);
      expect(arrival.duration).toBeLessThanOrEqual(200);
    }
  });

  test('the light stops when it is out of view and goes on when it is back', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'on wide screens the panel stays in view');
    await page.goto('/');
    const glow = page.locator('.opening__glow');
    await expect(glow).not.toHaveAttribute('data-paused');
    await page.getByRole('button', { name: 'quero acompanhar o clube' }).scrollIntoViewIfNeeded();
    await expect(glow).toHaveAttribute('data-paused', '');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(glow).not.toHaveAttribute('data-paused');
  });
});
