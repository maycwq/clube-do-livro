// Renders public/og.jpg, the 1200 × 630 image for link previews, from the
// desktop panel's art direction: the purple surface, the light group exported
// from the Figma file and the approved headline. Run it after changing any of
// those (npm run og); the image is committed, so builds don't depend on it.
//
// Fonts are embedded as data URLs; Satoshi comes from the files fetched by
// scripts/fetch-satoshi.mjs (run `npm run fonts` first).

import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const file = (path) => readFile(new URL(`../${path}`, import.meta.url));
const dataUrl = async (path, type) => `data:${type};base64,${(await file(path)).toString('base64')}`;

const fraunces = await dataUrl('node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2', 'font/woff2');
const satoshiBold = await dataUrl('src/assets/fonts/satoshi/Satoshi-Bold.woff2', 'font/woff2');
const satoshiRegular = await dataUrl('src/assets/fonts/satoshi/Satoshi-Regular.woff2', 'font/woff2');
const light = await dataUrl('src/assets/light/atmosphere-form.svg', 'image/svg+xml');

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Fraunces Variable'; src: url(${fraunces}) format('woff2'); font-weight: 100 900; }
  @font-face { font-family: Satoshi; src: url(${satoshiRegular}) format('woff2'); font-weight: 400; }
  @font-face { font-family: Satoshi; src: url(${satoshiBold}) format('woff2'); font-weight: 700; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #513e4b; position: relative;
         font-family: Satoshi, sans-serif; -webkit-font-smoothing: antialiased; }
  .light { position: absolute; left: 520px; top: 60px; width: 680px; height: 562px;
           background: url(${light}) no-repeat 0 0 / 100% 100%; }
  .rubric { position: absolute; left: 72px; top: 64px; color: #f6e7dc; font-weight: 700;
            font-size: 20px; line-height: 26px; white-space: pre; }
  h1 { position: absolute; left: 72px; top: 122px; color: #fff; font-family: 'Fraunces Variable', serif;
       font-weight: 700; font-variation-settings: 'SOFT' 0, 'WONK' 1; font-size: 66px; line-height: 70px; }
  .epilogue { position: absolute; left: 72px; bottom: 60px; color: #f6e7dc; font-size: 20px; line-height: 28px; }
</style></head><body>
  <div class="light"></div>
  <p class="rubric">clube do livro     /     2027</p>
  <h1>a gente tá<br>montando<br>um clube<br>do livro.<br>vem?</h1>
  <p class="epilogue">um convite primeiro. as inscrições ficam pra depois.</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
// JPEG keeps the soft gradients well and stays far under the ~300 KB some
// apps accept for previews.
await page.screenshot({ path: new URL('../public/og.jpg', import.meta.url).pathname, type: 'jpeg', quality: 90 });
await browser.close();
console.log('public/og.jpg written');
