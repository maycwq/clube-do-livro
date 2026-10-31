import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { confirmation, contrast, fill, holdLight, phone, rgb, settled, submitButton, worstContrastUnderText } from './helpers.js';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Audited as read: once what arrives has arrived (axe counts the opacity of
// text that is still fading in).
const audit = async (page: Page) => {
  await settled(page);
  return new AxeBuilder({ page }).withTags(WCAG).analyze();
};

test.describe('axe (WCAG 2.2 A and AA)', () => {
  test('the form, with and without errors', async ({ page }) => {
    await page.goto('/');
    expect((await audit(page)).violations).toEqual([]);
    // An error that shows while typing, with focus still in the field.
    await page.getByLabel('seu WhatsApp').pressSequentially('31 9876a');
    await expect(page.locator('#whatsapp-error')).toBeVisible();
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

  test('how the data is used, open over the form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'como usamos seus dados' }).click();
    await expect(page.getByRole('dialog', { name: 'como usamos seus dados' })).toBeVisible();
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

  // Every light animation stopped at the same point of its own cycle, from
  // rest to the other end. The panel is checked at the frame's height and
  // on a short window, where the epilogue sits over the light.
  const phases = [0, 0.25, 0.5, 0.75, 1];
  const large = 3;
  const normal = 4.5;

  async function expectReadableOverLight(page: Page, texts: [string, number][], label: string) {
    await page.evaluate(() => document.fonts.ready);
    for (const phase of phases) {
      await holdLight(page, phase);
      for (const [selector, minimum] of texts) {
        const worst = await worstContrastUnderText(page, page.locator(selector));
        expect(worst, `${selector}, ${label}, at ${phase} of the cycle`).toBeGreaterThanOrEqual(minimum);
      }
    }
  }

  test('text over the light stays readable through its whole cycle', async ({ page }, testInfo) => {
    test.slow(); // about 50 screenshots
    if (testInfo.project.name === 'desktop') {
      for (const height of [900, 720]) {
        await page.setViewportSize({ width: 1440, height });
        await page.goto('/');
        const texts: [string, number][] = [
          ['.opening__rubric', normal],
          ['.opening__headline', large],
          ['.opening__proposal', normal],
          ['.opening__context', normal],
          ['.opening__epilogue', normal],
        ];
        await expectReadableOverLight(page, texts, `1440 × ${height}`);
      }
    } else {
      await page.goto('/');
      const texts: [string, number][] = [
        ['.opening__name', normal],
        ['.opening__year', normal],
        ['.opening__headline', large],
        ['.opening__proposal', normal],
        ['.opening__context', normal],
      ];
      await expectReadableOverLight(page, texts, 'phone');
    }
  });

  test('the confirmation too', async ({ page }, testInfo) => {
    test.slow();
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await fill(page, phone(testInfo));
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    const done: [string, number][] = desktop
      ? [
          ['.done__identity', normal],
          ['.done__title', large],
          ['.done__closing', normal],
        ]
      : [
          ['.done__identity', normal],
          ['.done__meta', normal],
          ['.done__title', large],
        ];
    await expectReadableOverLight(page, done, 'confirmation');
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
