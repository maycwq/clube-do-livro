import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONSENT_VERSIONS } from './interest.js';

// The consent record is only worth something if the stored text is the one
// on the page. Changing the copy (or the privacy notice) without updating
// db/schema.sql fails here.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

const text = (className: string) => {
  const match = html.match(new RegExp(`class="${className}"[^>]*>([^<]+)<`));
  if (!match?.[1]) throw new Error(`.${className} not found in index.html`);
  return match[1].trim();
};

/** The notice as stored: one line per heading, paragraph and list item. */
function noticeText(page: string): string {
  const article = page.slice(page.indexOf('<article'), page.indexOf('</article>'));
  return article
    .replace(/<\/(h1|h2|h3|p|li)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

describe('consent texts', () => {
  const version = html.match(/data-consent-version="([^"]+)"/)?.[1];
  const seed = schema.match(new RegExp(`'${version}',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'`));

  it('use a version the API accepts', () => {
    expect(CONSENT_VERSIONS).toContain(version);
    expect(seed, `no consent_texts row for ${version} in db/schema.sql`).not.toBeNull();
  });

  it('match the form copy stored for that version', () => {
    const [, contact, privacy, testInvite] = seed!;
    expect(contact).toBe(text('submit__consent'));
    expect(privacy).toBe(text('submit__privacy'));
    expect(testInvite).toBe(`${text('interlude__text')} ${text('check__label')}`);
  });

  it('match the privacy notice stored for that version', () => {
    const current = noticeText(html);
    expect(seed![4], `the notice in index.html changed; store this text for ${version}:\n\n${current}\n`).toBe(current);
  });

  it('link the form to the notice', () => {
    expect(html).toMatch(/<a class="submit__link" href="\/privacidade"[^>]*>como usamos seus dados<\/a>/);
  });
});
