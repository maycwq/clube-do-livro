import { expect, test, type Locator, type Page } from '@playwright/test';
import { confirmation, fill, phone, settled, submitButton } from './helpers.js';

test.describe('reference widths', () => {
  for (const width of [320, 390, 768, 1440]) {
    test(`${width}px: no sideways scroll, and the composition of that width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/privacidade']) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
      await page.goto('/');
      const wide = width >= 1240;
      await expect(page.locator('.opening__rubric')).toBeVisible({ visible: wide });
      await expect(page.locator('.opening__epilogue')).toBeVisible({ visible: wide });
      await expect(page.locator('.opening__meta')).toBeVisible({ visible: !wide });
      await expect(page.locator('.opening')).toHaveCSS('position', wide ? 'sticky' : 'relative');
    });
  }
});

test.describe('page width and gutters', () => {
  // [window, side margin, container width]: 24px up to 800px, then 3% of the
  // window up to 64px; one column up to 720px, two up to 1600px.
  const cases = [
    [320, 24, 272],
    [390, 24, 342],
    [768, 24, 720],
    [1024, 30.72, 720],
    [1240, 37.2, 1165.6],
    [1440, 43.2, 1353.6],
    [1920, 57.6, 1600],
    [2560, 64, 1600],
  ] as const;

  for (const [width, gutter, container] of cases) {
    test(`${width}px: one side margin, from the page shell, and everything on its axis`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const layout = await page.evaluate(() => {
        const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
        return {
          shell: parseFloat(style('.page').paddingLeft),
          viewMargin: parseFloat(style('main.form-view').marginLeft),
          viewPadding: parseFloat(style('main.form-view').paddingLeft) + parseFloat(style('main.form-view').paddingRight),
          view: { left: box('main.form-view').left, width: box('main.form-view').width },
          lefts: ['.interest', '.interlude', '.contact', '.form-column > .signature'].map((selector) => box(selector).left),
          column: box('.form-column').left,
          opening: box('.opening').left,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      expect(layout.shell).toBeCloseTo(gutter, 1);
      expect(layout.viewPadding).toBe(0);
      expect(layout.view.width).toBeCloseTo(container, 0);
      // The container's own margin only centers it once it reaches its maximum.
      expect(layout.viewMargin).toBeCloseTo((width - 2 * gutter - container) / 2, 0);
      expect(layout.opening).toBeCloseTo(layout.view.left, 1);
      for (const left of layout.lefts) expect(left).toBeCloseTo(layout.column, 1);
      expect(layout.scrollWidth).toBe(width);
    });
  }

  test('the columns share the width as in the frame, with the panel never under 560px', async ({ page }) => {
    for (const [width, panel, form] of [
      [1240, 560, 544],
      [1440, 593, 688],
      [1920, 703, 817],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      expect((await page.locator('.opening').boundingBox())!.width).toBeCloseTo(panel, -1);
      expect((await page.locator('.form-column').boundingBox())!.width).toBeCloseTo(form, -1);
    }
  });
});

/** Every visible text of the panel lies inside it, so nothing is cut. */
async function expectWhole(panel: Locator) {
  const box = (await panel.boundingBox())!;
  for (const text of await panel.locator(':scope > :is(p, h1)').filter({ visible: true }).all()) {
    const inner = (await text.boundingBox())!;
    expect(inner.y).toBeGreaterThanOrEqual(box.y);
    expect(inner.y + inner.height).toBeLessThanOrEqual(box.y + box.height);
  }
}

const scrollPage = (page: Page, fraction: number) =>
  page.evaluate((fraction) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * fraction), fraction);

test.describe('the desktop panel', () => {
  test.skip(({ isMobile }) => isMobile);

  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1792, 852],
    [1366, 768],
    [1280, 720],
    [1240, 600],
  ] as const) {
    test(`${width} × ${height}: whole and in view from the top to the end of the page, with no scroll of its own`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);
      await settled(page);
      const panel = page.locator('.opening');
      await expect(panel).toHaveCSS('position', 'sticky');
      await expect(panel).toHaveCSS('overflow-y', 'clip');
      for (const fraction of [0, 0.5, 1]) {
        await scrollPage(page, fraction);
        const box = (await panel.boundingBox())!;
        expect(box.y, `top at ${fraction}`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `bottom at ${fraction}`).toBeLessThanOrEqual(height);
        await expectWhole(panel);
      }
    });
  }

  test('on a window too short for it, it scrolls with the page, and sticks again when there is room', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await page.goto('/');
    const panel = page.locator('.opening');
    await expect(panel).toHaveCSS('position', 'relative');
    await expectWhole(panel);
    await page.locator('.opening__epilogue').scrollIntoViewIfNeeded();
    await expect(page.locator('.opening__epilogue')).toBeInViewport();

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(panel).toHaveCSS('position', 'sticky');
    await page.setViewportSize({ width: 1024, height: 720 });
    await expect(panel).toHaveCSS('position', 'relative');
  });

  test('the confirmation keeps its closing line inside the panel on a short window', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto('/');
    await fill(page, phone(testInfo), { optIn: true });
    await submitButton(page).click();
    await expect(confirmation(page)).toBeVisible();
    await settled(page);
    const box = (await page.locator('.done__panel').boundingBox())!;
    for (const text of ['.done__identity', '.done__title', '.done__closing']) {
      const inner = (await page.locator(text).boundingBox())!;
      expect(inner.y).toBeGreaterThanOrEqual(box.y);
      expect(inner.y + inner.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });
});

test('link previews have a title, a description and a 1200 × 630 image with a description', async ({ page }) => {
  await page.goto('/');
  const meta = (property: string) => page.locator(`meta[property="${property}"]`).getAttribute('content');
  expect(await meta('og:title')).toBe('a gente tá montando um clube do livro. vem?');
  expect(await meta('og:description')).toMatch(/^queremos começar em 2027/);
  expect(await meta('og:image:alt')).toBeTruthy();
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');

  const image = (await meta('og:image'))!;
  const response = await page.request.get(image);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/jpeg');
  const size = await page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    return [bitmap.width, bitmap.height];
  }, image);
  expect(size).toEqual([1200, 630]);
  expect([Number(await meta('og:image:width')), Number(await meta('og:image:height'))]).toEqual(size);
});
