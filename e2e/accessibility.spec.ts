import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { confirmation, contrast, fill, phone, rgb, submitButton, worstContrastUnderText } from './helpers.js';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const audit = (page: Page) => new AxeBuilder({ page }).withTags(WCAG).analyze();

test.describe('axe (WCAG 2.2 A and AA)', () => {
  test('the form, with and without errors', async ({ page }) => {
    await page.goto('/');
    expect((await audit(page)).violations).toEqual([]);
    await submitButton(page).click();
    expect((await audit(page)).violations).toEqual([]);
  });

  test('a failure and the confirmation', async ({ page }, testInfo) => {
    await page.goto('/');
    await fill(page, phone(testInfo), { optIn: true });
    await page.route('/api/responses', (route) => route.abort('internetdisconnected'));
    await submitButton(page).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    expect((await audit(page)).violations).toEqual([]);

    await page.unroute('/api/responses');
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    expect((await audit(page)).violations).toEqual([]);
  });

  test('the privacy notice', async ({ page }) => {
    await page.goto('/privacidade');
    expect((await audit(page)).violations).toEqual([]);
  });
});

test.describe('contrast', () => {
  test('field borders, in every state, stand out from the page (3:1)', async ({ page }) => {
    await page.goto('/');
    const surface = rgb(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor));
    const border = () => page.getByLabel('seu WhatsApp').evaluate((el) => getComputedStyle(el).borderTopColor);

    expect(contrast(rgb(await border()), surface)).toBeGreaterThanOrEqual(3); // empty
    await page.getByLabel('seu WhatsApp').fill('31');
    await page.getByLabel('seu WhatsApp').focus();
    expect(contrast(rgb(await border()), surface)).toBeGreaterThanOrEqual(3); // focused
    await page.getByLabel('como a gente pode te chamar?').focus();
    expect(contrast(rgb(await border()), surface)).toBeGreaterThanOrEqual(3); // filled
    await submitButton(page).click();
    await page.getByLabel('como a gente pode te chamar?').focus();
    expect(contrast(rgb(await border()), surface)).toBeGreaterThanOrEqual(3); // error
  });

  test('the button label is large text above 3:1 at every width', async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const style = await submitButton(page).evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, background: s.backgroundColor, size: parseFloat(s.fontSize), weight: Number(s.fontWeight) };
      });
      expect(style.weight).toBeGreaterThanOrEqual(700);
      expect(style.size).toBeGreaterThanOrEqual(18.66); // 14pt bold
      expect(contrast(rgb(style.color), rgb(style.background))).toBeGreaterThanOrEqual(3);
    }
  });

  test('text over the light masses stays above 4.5:1, at rest and at the end of the drift', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 1100 }); // whole panel in view
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const texts =
      testInfo.project.name === 'desktop'
        ? ['.opening__rubric', '.opening__proposal', '.opening__context', '.opening__epilogue']
        : ['.opening__name', '.opening__year', '.opening__proposal', '.opening__context'];
    for (const time of [0, 14_000]) {
      await page.evaluate((t) => document.getAnimations().forEach((a) => ((a.currentTime = t), a.pause())), time);
      for (const selector of texts) {
        const worst = await worstContrastUnderText(page, page.locator(selector));
        expect(worst, `${selector} at ${time}ms`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

test('errors, sending and the result are announced', async ({ page }, testInfo) => {
  await page.goto('/');
  await submitButton(page).click();
  // Focus goes to the first problem, which carries its message as description.
  await expect(page.getByRole('radio', { name: 'sim, eu toparia' })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'sim, eu toparia' })).toHaveAccessibleDescription('escolha uma das opções.');
  await expect(page.getByRole('group', { name: 'quando o clube começar, você teria vontade de participar?' })).toBeVisible();

  await fill(page, phone(testInfo));
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('/api/responses', async (route) => {
    await held;
    await route.continue();
  });
  await submitButton(page).click();
  await expect(page.getByRole('status')).toHaveText('enviando sua resposta...');
  release();
  await expect(confirmation(page)).toBeFocused();
  await expect(page.getByRole('status')).toHaveCount(0); // its view is hidden with the form
});
