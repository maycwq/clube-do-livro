import { expect, test } from '@playwright/test';

test.describe('reference widths', () => {
  for (const width of [320, 390, 768, 1440]) {
    test(`${width}px: no sideways scroll, and the composition of that width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/privacidade']) {
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
      await page.goto('/');
      const wide = width >= 1200;
      await expect(page.locator('.opening__rubric')).toBeVisible({ visible: wide });
      await expect(page.locator('.opening__epilogue')).toBeVisible({ visible: wide });
      await expect(page.locator('.opening__meta')).toBeVisible({ visible: !wide });
      expect(await page.locator('.opening').evaluate((el) => getComputedStyle(el).position)).toBe(wide ? 'sticky' : 'relative');
      const column = await page.locator('.form-column').boundingBox();
      expect(column!.width).toBeLessThanOrEqual(wide ? 650 : 390);
    });
  }
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
