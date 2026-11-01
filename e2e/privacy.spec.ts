import { expect, test, type Page } from '@playwright/test';
import { fill, phone, settled } from './helpers.js';

const link = (page: Page) => page.getByRole('link', { name: 'como usamos seus dados' });
const drawer = (page: Page) => page.getByRole('dialog', { name: 'como usamos seus dados' });

test('the privacy line opens how the data is used over the form, which stays as it was', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('a gente usa seus dados só pra organizar o clube e entrar em contato sobre ele.')).toBeVisible();
  const typed = phone(testInfo);
  await fill(page, typed, { optIn: true });
  await link(page).scrollIntoViewIfNeeded();
  const scrolled = await page.evaluate(() => scrollY);

  await link(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole('heading', { level: 2, name: 'como usamos seus dados' })).toBeFocused();
  for (const section of ['quem organiza', 'por que pedimos seu nome e seu WhatsApp', 'o convite pro teste digital', 'por quanto tempo', 'pra parar, corrigir ou apagar']) {
    await expect(drawer(page).getByRole('heading', { level: 3, name: section })).toBeVisible();
  }
  // The page behind doesn't scroll while it's open.
  await page.mouse.wheel(0, -600);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);

  await drawer(page).getByRole('button', { name: 'fechar' }).click();
  await expect(drawer(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(link(page)).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await expect(page.getByLabel('sim, eu toparia')).toBeChecked();
  await expect(page.getByLabel('sim, me chama pra testar também')).toBeChecked();
  await expect(page.getByLabel('seu WhatsApp')).toHaveValue(typed);
});

test('it closes with Escape, the back button or a click beside it, always back on the link', async ({ page }) => {
  await page.goto('/');

  await link(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(link(page)).toBeFocused();
  await expect(page).toHaveURL(/\/$/);

  await link(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.goBack();
  await expect(drawer(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /a gente tá/ })).toBeVisible();

  await link(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.mouse.click(5, 300);
  await expect(drawer(page)).toBeHidden();
  await expect(link(page)).toBeFocused();
});

test('from the keyboard: the page behind is out of reach, and the content scrolls', async ({ page }) => {
  await page.goto('/');
  await link(page).focus();
  await page.keyboard.press('Enter');
  await expect(drawer(page)).toBeVisible();
  await settled(page);

  // Tab stays in the drawer: the close, then the content.
  const reached = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    reached.add(await page.evaluate(() => (document.activeElement?.closest('dialog') ? 'drawer' : (document.activeElement?.tagName ?? 'none'))));
  }
  expect([...reached].filter((where) => where !== 'drawer' && where !== 'BODY')).toEqual([]);

  const content = page.locator('.drawer__content');
  await content.focus();
  await page.keyboard.press('End');
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(drawer(page).getByRole('button', { name: 'fechar' })).toBeInViewport();
});

test('a link to /privacidade opens the form with it open; closing leaves the form', async ({ page }) => {
  await page.goto('/privacidade');
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'como usamos seus dados' })).toBeFocused();
  await expect(page).toHaveTitle('como usamos seus dados · clube do livro');

  await drawer(page).getByRole('button', { name: 'fechar' }).click();
  await expect(drawer(page)).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle('clube do livro');
  await expect(link(page)).toBeFocused();
});

test('who organizes, and the Instagram to ask about the data, in a new tab so the form stays', async ({ page, context }) => {
  await page.goto('/privacidade');
  await expect(drawer(page).getByText('o clube é organizado por maycon e luy.')).toBeVisible();

  const instagram = drawer(page).getByRole('link', { name: /^Instagram/ });
  await expect(instagram).toHaveAccessibleName('Instagram (abre em outra aba)');
  await expect(instagram).toHaveText('Instagram');
  await expect(instagram).toHaveAttribute('href', 'https://www.instagram.com/comolue/');
  await expect(instagram).toHaveAttribute('target', '_blank');
  await expect(instagram).toHaveAttribute('rel', 'noopener');
  await expect(instagram.locator('xpath=..')).toContainText('pra tirar dúvidas sobre seus dados, pedir pra corrigir ou apagar suas respostas ou deixar de receber mensagens');

  // Reached from the keyboard inside the drawer, and underlined like the
  // form's links.
  await instagram.focus();
  await expect(instagram).toBeFocused();
  expect(await instagram.evaluate((element) => getComputedStyle(element).textDecorationLine)).toBe('underline');

  // Opening it leaves the drawer and the form where they were. The new tab
  // is stopped before it leaves this machine.
  await context.route('https://www.instagram.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>instagram</title>' }));
  const [opened] = await Promise.all([context.waitForEvent('page'), instagram.click()]);
  await opened.waitForLoadState();
  expect(opened.url()).toBe('https://www.instagram.com/comolue/');
  expect(await opened.evaluate(() => window.opener)).toBeNull();
  await opened.close();
  await expect(drawer(page)).toBeVisible();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(drawer(page).locator('[data-pending], mark')).toHaveCount(0);
});

test('the drawer: the paper of the page, rounded on its left, wide enough to read, the whole screen on phones', async ({ page, isMobile }) => {
  await page.goto('/privacidade');
  await settled(page);
  const style = await drawer(page).evaluate((element) => {
    const s = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { background: s.backgroundColor, radius: [s.borderTopLeftRadius, s.borderBottomLeftRadius, s.borderTopRightRadius], right: box.right, width: box.width, height: box.height };
  });
  const viewport = page.viewportSize()!;
  expect(style.background).toBe('rgb(251, 249, 244)');
  expect(style.right).toBe(viewport.width);
  expect(style.height).toBe(viewport.height);
  if (isMobile) {
    expect(style.width).toBe(viewport.width);
    expect(style.radius).toEqual(['0px', '0px', '0px']);
  } else {
    expect(style.width).toBe(520);
    expect(style.radius).toEqual(['48px', '48px', '0px']);
  }
  // The header stays while the content scrolls under it.
  const header = await page.locator('.drawer__header').boundingBox();
  await page.locator('.drawer__content').evaluate((element) => (element.scrollTop = element.scrollHeight));
  expect(await page.locator('.drawer__header').boundingBox()).toEqual(header);
});

test('with reduced motion it only fades', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await link(page).click();
  const motion = await drawer(page).evaluate((element) =>
    element.getAnimations({ subtree: true }).map((animation) => ({
      duration: Number(animation.effect!.getTiming().duration),
      properties: [
        ...new Set((animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key)))),
      ],
    })),
  );
  for (const animation of motion) {
    expect(animation.properties).toEqual(['opacity']);
    expect(animation.duration).toBeLessThanOrEqual(160);
  }
});
