import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Each test uses its own number, since both projects share one database.
let sequence = 0;
function phone(testInfo: TestInfo) {
  const project = testInfo.project.name === 'mobile' ? '1' : '2';
  sequence += 1;
  const suffix = String(Date.now() % 10000).padStart(4, '0');
  return { typed: `(31) 9${project}${String(sequence).padStart(3, '0')}-${suffix}` };
}

type Stored = { name: string; whatsapp: string; interest: string; format: string; test_invite: boolean };

async function stored(page: Page, typed: string): Promise<Stored | undefined> {
  const digits = typed.replace(/\D/g, '');
  const rows = (await (await page.request.get('/api/responses')).json()) as Stored[];
  return rows.find((row) => row.whatsapp === `+55${digits}`);
}

async function fill(page: Page, typed: string, options: { optIn?: boolean; interest?: string; format?: string } = {}) {
  await page.getByLabel(options.interest ?? 'sim, eu toparia').check();
  await page.getByLabel(options.format ?? 'presenciais em ipatinga').check();
  if (options.optIn) await page.getByLabel('sim, me chama pra testar também').check();
  await page.getByLabel('como a gente pode te chamar?').fill('Ana');
  await page.getByLabel('seu WhatsApp').fill(typed);
}

const submit = (page: Page) => page.getByRole('button', { name: 'quero acompanhar o clube' }).click();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the test invite starts unchecked and every answer is empty', async ({ page }) => {
  await expect(page.getByLabel('sim, me chama pra testar também')).not.toBeChecked();
  for (const radio of await page.getByRole('radio').all()) await expect(radio).not.toBeChecked();
  await expect(page.getByLabel('como a gente pode te chamar?')).toHaveValue('');
});

test('sending an empty form explains every field and stores nothing', async ({ page }) => {
  const before = ((await (await page.request.get('/api/responses')).json()) as unknown[]).length;
  await submit(page);

  await expect(page.getByText('escolha uma das opções.')).toHaveCount(2);
  await expect(page.getByText('informe como a gente pode te chamar.')).toBeVisible();
  await expect(page.getByText('informe seu WhatsApp com DDD.')).toBeVisible();
  await expect(page.getByLabel('sim, eu toparia')).toBeFocused();
  await expect(page.getByLabel('seu WhatsApp')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('seu WhatsApp')).toHaveAttribute('aria-describedby', /whatsapp-help/);
  await expect(page.getByLabel('seu WhatsApp')).toHaveAttribute('aria-describedby', /whatsapp-error/);
  expect(((await (await page.request.get('/api/responses')).json()) as unknown[]).length).toBe(before);
});

test('fixing a field clears only its own error', async ({ page }, testInfo) => {
  await submit(page);
  await page.getByLabel('talvez, depende de como funcionar').check();
  await expect(page.locator('#interest-error')).toBeHidden();
  await expect(page.locator('#format-error')).toBeVisible();

  await page.getByLabel('seu WhatsApp').fill('9999-9999');
  await page.getByLabel('seu WhatsApp').blur();
  await expect(page.locator('#whatsapp-error')).toBeVisible();
  await page.getByLabel('seu WhatsApp').fill(phone(testInfo).typed);
  await expect(page.locator('#whatsapp-error')).toBeHidden();
  await expect(page.getByLabel('seu WhatsApp')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#name-error')).toBeVisible();
});

test('a valid answer is stored and only then confirmed', async ({ page }, testInfo) => {
  const { typed } = phone(testInfo);
  await fill(page, typed.replace(/\D/g, ''), { interest: 'talvez, depende de como funcionar', format: 'dos dois formatos' });
  await submit(page);

  await expect(page.getByRole('heading', { level: 1, name: /anotado/ })).toBeFocused();
  await expect(page.getByText('também anotamos seu interesse em testar a experiência digital.')).toBeHidden();
  expect(await stored(page, typed)).toMatchObject({ name: 'Ana', interest: 'talvez', format: 'os-dois', test_invite: false });

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /anotado/ })).toBeVisible();
});

test('the test invite is stored on its own, whatever the club answers', async ({ page }, testInfo) => {
  const { typed } = phone(testInfo);
  await fill(page, typed, {
    interest: 'quero acompanhar a ideia antes de decidir',
    format: 'ainda não sei',
    optIn: true,
  });
  await submit(page);

  await expect(page.getByText('também anotamos seu interesse em testar a experiência digital.')).toBeVisible();
  expect(await stored(page, typed)).toMatchObject({ interest: 'acompanhar', format: 'nao-sei', test_invite: true });
});

test('a failed send keeps everything filled in and can be retried', async ({ page }, testInfo) => {
  const { typed } = phone(testInfo);
  await fill(page, typed, { optIn: true });
  await page.route('/api/responses', (route) => route.abort('internetdisconnected'));
  await submit(page);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('não conseguimos guardar sua resposta.');
  await expect(alert).toContainText('o que você preencheu continua aqui. confira a conexão e tente enviar de novo.');
  await expect(page.getByLabel('sim, eu toparia')).toBeChecked();
  await expect(page.getByLabel('sim, me chama pra testar também')).toBeChecked();
  await expect(page.getByLabel('seu WhatsApp')).toHaveValue(typed);
  expect(await stored(page, typed)).toBeUndefined();

  await page.unroute('/api/responses');
  await page.getByRole('button', { name: 'quero acompanhar o clube' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /anotado/ })).toBeVisible();
  expect(await stored(page, typed)).toMatchObject({ test_invite: true });
});

test('a server error is a failure too, not a confirmation', async ({ page }, testInfo) => {
  await fill(page, phone(testInfo).typed);
  await page.route('/api/responses', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }),
  );
  await submit(page);

  await expect(page.getByRole('alert')).toContainText('não conseguimos guardar sua resposta.');
  await expect(page.locator('#confirmacao')).toBeHidden();
});

test('while sending, the button says so and extra clicks send nothing', async ({ page }, testInfo) => {
  await fill(page, phone(testInfo).typed);
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('/api/responses', async (route) => {
    requests += 1;
    await held;
    await route.continue();
  });

  const button = page.getByRole('button', { name: 'quero acompanhar o clube' });
  await button.click();
  const sending = page.getByRole('button', { name: 'enviando...' });
  await expect(sending).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('status')).toHaveText('a resposta está sendo processada. evite enviar novamente.');
  // force: Playwright would otherwise wait for aria-disabled to go away.
  await sending.click({ force: true });
  await page.getByLabel('seu WhatsApp').press('Enter');

  release();
  await expect(page.getByRole('heading', { level: 1, name: /anotado/ })).toBeVisible();
  expect(requests).toBe(1);
});

test('the whole form works from the keyboard', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'keyboard flow is checked on desktop');
  const { typed } = phone(testInfo);

  await page.keyboard.press('Tab');
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
  await expect(page.getByRole('button', { name: 'quero acompanhar o clube' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: /anotado/ })).toBeFocused();
  expect(await stored(page, typed)).toMatchObject({ interest: 'talvez', format: 'presencial', test_invite: true });
});

test('the WhatsApp number is tidied up when leaving the field', async ({ page }) => {
  await page.getByLabel('seu WhatsApp').fill('+55 31 987654321');
  await page.getByLabel('seu WhatsApp').blur();
  await expect(page.getByLabel('seu WhatsApp')).toHaveValue('(31) 98765-4321');
});

test('the light only moves when motion is welcome', async ({ page }) => {
  const animation = () => page.locator('.opening__light').evaluate((el) => getComputedStyle(el).animationName);
  expect(await animation()).toBe('light-drift');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await animation()).toBe('none');
});

test('personal data never reaches the address bar', async ({ page }, testInfo) => {
  const { typed } = phone(testInfo);
  await fill(page, typed);
  await submit(page);
  await expect(page.getByRole('heading', { level: 1, name: /anotado/ })).toBeVisible();
  const { pathname, search, hash } = new URL(page.url());
  expect(pathname + search + hash).toBe('/');
});
