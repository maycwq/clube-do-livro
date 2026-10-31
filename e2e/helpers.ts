import type { Locator, Page, TestInfo } from '@playwright/test';

// Each test uses its own number, since both projects share one database.
let sequence = 0;
export function phone(testInfo: TestInfo): string {
  const project = testInfo.project.name === 'mobile' ? '1' : '2';
  sequence += 1;
  const suffix = String(Date.now() % 10000).padStart(4, '0');
  return `(31) 9${project}${String(sequence).padStart(3, '0')}-${suffix}`;
}

export type Stored = { name: string; whatsapp: string; interest: string; format: string; test_invite: boolean };

/** What the local database holds for a number (dev server only). */
export async function stored(page: Page, typed: string) {
  const whatsapp = `+55${typed.replace(/\D/g, '')}`;
  const { responses, changeRequests } = (await (await page.request.get('/api/responses')).json()) as {
    responses: Stored[];
    changeRequests: Stored[];
  };
  return {
    responses: responses.filter((row) => row.whatsapp === whatsapp),
    changeRequests: changeRequests.filter((row) => row.whatsapp === whatsapp),
  };
}

export async function fill(
  page: Page,
  typed: string,
  options: { optIn?: boolean; interest?: string; format?: string; name?: string } = {},
) {
  await page.getByLabel(options.interest ?? 'sim, eu toparia').check();
  await page.getByLabel(options.format ?? 'presenciais em ipatinga').check();
  if (options.optIn) await page.getByLabel('sim, me chama pra testar também').check();
  await page.getByLabel('como a gente pode te chamar?').fill(options.name ?? 'Ana');
  await page.getByLabel('seu WhatsApp').fill(typed);
}

/** Stops every light animation at the same point (0 to 1) of its own cycle. */
export async function holdLight(page: Page, phase: number) {
  await page.evaluate((phase) => {
    for (const animation of document.getAnimations()) {
      const { duration, delay } = animation.effect!.getTiming() as { duration: number; delay: number };
      animation.currentTime = (((phase * duration - delay) % duration) + duration) % duration;
      animation.pause();
    }
  }, phase);
}

export const submitButton = (page: Page) => page.getByRole('button', { name: 'quero acompanhar o clube' });
export const confirmation = (page: Page) => page.getByRole('heading', { level: 1, name: /anotado/ });
export const optInNote = (page: Page) => page.getByText('também anotamos seu interesse em testar a experiência digital.');

/** WCAG relative luminance contrast between two sRGB colors. */
export function contrast(a: number[], b: number[]): number {
  const luminance = ([r, g, b]: number[]) => {
    const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

export const rgb = (css: string) => css.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);

/**
 * Lowest contrast between a text's color and what is actually painted under
 * its letters (the light masses included): the element is captured with and
 * without its text, and only pixels the letters cover are compared.
 */
export async function worstContrastUnderText(page: Page, element: Locator): Promise<number> {
  const color = rgb(await element.evaluate((el) => getComputedStyle(el).color));
  const box = (await element.boundingBox())!;
  const withText = (await page.screenshot({ clip: box })).toString('base64');
  await element.evaluate((el) => el.style.setProperty('color', 'transparent', 'important'));
  const background = (await page.screenshot({ clip: box })).toString('base64');
  await element.evaluate((el) => el.style.removeProperty('color'));

  const pairs = await page.evaluate(
    async ([a, b]) => {
      const pixels = async (base64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [text, bg] = await Promise.all([pixels(a!), pixels(b!)]);
      const under: number[][] = [];
      for (let i = 0; i < bg.length; i += 4) {
        const difference = Math.abs(text[i]! - bg[i]!) + Math.abs(text[i + 1]! - bg[i + 1]!) + Math.abs(text[i + 2]! - bg[i + 2]!);
        if (difference > 150) under.push([bg[i]!, bg[i + 1]!, bg[i + 2]!]);
      }
      return under;
    },
    [withText, background],
  );
  return Math.min(...pairs.map((pixel) => contrast(color, pixel)));
}
