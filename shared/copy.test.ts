import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONSENT_VERSIONS } from './interest.js';

// The consent record is only worth something if the stored text is the one
// on the page. Changing the copy without a new version fails here.

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

const text = (className: string) => {
  const match = html.match(new RegExp(`class="${className}"[^>]*>([^<]+)<`));
  if (!match?.[1]) throw new Error(`.${className} not found in index.html`);
  return match[1];
};

describe('consent text', () => {
  const version = html.match(/data-consent-version="([^"]+)"/)?.[1];

  it('is a version the API accepts', () => {
    expect(CONSENT_VERSIONS).toContain(version);
  });

  it('matches the wording stored for that version', () => {
    const seed = schema.match(new RegExp(`'${version}',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'`));
    expect(seed).not.toBeNull();
    const [, contact, privacy, testInvite] = seed!;

    expect(contact).toBe(text('submit__consent'));
    expect(privacy).toBe(text('submit__privacy'));
    expect(testInvite).toBe(`${text('interlude__text')} ${text('check__label')}`);
  });
});
