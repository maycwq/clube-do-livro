import { describe, expect, it } from 'vitest';
import { errorFields, formatWhatsapp, normalizeName, normalizeWhatsapp, validateSubmission } from './interest.js';

describe('normalizeWhatsapp', () => {
  it.each([
    ['(31) 99999-9999', '+5531999999999'],
    ['31999999999', '+5531999999999'],
    ['31 9 9999 9999', '+5531999999999'],
    ['+55 31 99999-9999', '+5531999999999'],
    ['55 31 99999-9999', '+5531999999999'],
    ['031 99999-9999', '+5531999999999'],
    ['(55) 99999-9999', '+5555999999999'], // area code 55 is Santa Maria (RS)
    ['(31) 3333-4444', '+553133334444'], // landline with WhatsApp Business
  ])('accepts %s', (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['99999-9999', 'no area code'],
    ['(20) 99999-9999', 'area code not in use'],
    ['(31) 89999-9999', 'mobile without the leading 9'],
    ['(31) 8999-9999', 'old 8-digit mobile'],
    ['(31) 99999-99999', 'too long'],
    ['+351 912 345 678', 'not Brazilian'],
    ['abc', 'not a number'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeWhatsapp(input)).toBeNull();
  });

  it('ignores anything that is not a string', () => {
    expect(normalizeWhatsapp(31999999999)).toBeNull();
    expect(normalizeWhatsapp(null)).toBeNull();
  });
});

describe('formatWhatsapp', () => {
  it('writes mobile and landline numbers the way the placeholder does', () => {
    expect(formatWhatsapp('+5531999999999')).toBe('(31) 99999-9999');
    expect(formatWhatsapp('+553133334444')).toBe('(31) 3333-4444');
  });
});

describe('normalizeName', () => {
  it('trims and collapses whitespace, including control characters', () => {
    expect(normalizeName('  Ana \n  Maria\t')).toBe('Ana Maria');
    expect(normalizeName('Ana\u0000')).toBe('Ana');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('validateSubmission', () => {
  const submissionId = '3f1c2b4a-8d9e-4f7a-9b6c-1d2e3f4a5b6c';
  const valid = {
    submissionId,
    interest: 'talvez',
    format: 'os-dois',
    name: ' Ana ',
    whatsapp: '(31) 98765-4321',
    consentVersion: 'v2',
  };

  it('returns the normalized submission, with the test invite off by default', () => {
    expect(validateSubmission(valid)).toEqual({
      ok: true,
      value: {
        submissionId,
        name: 'Ana',
        whatsapp: '+5531987654321',
        interest: 'talvez',
        format: 'os-dois',
        testInvite: false,
        consentVersion: 'v2',
      },
    });
  });

  it('keeps the test invite independent from the answers about the club', () => {
    const result = validateSubmission({ ...valid, interest: 'acompanhar', format: 'nao-sei', testInvite: true });
    expect(result.ok && result.value.testInvite).toBe(true);
  });

  it('says what is wrong with each field', () => {
    expect(validateSubmission({ consentVersion: 'v2' })).toEqual({
      ok: false,
      errors: { interest: 'missing', format: 'missing', name: 'missing', whatsapp: 'missing' },
    });
    expect(validateSubmission({ ...valid, name: '   ', whatsapp: '123' })).toEqual({
      ok: false,
      errors: { name: 'missing', whatsapp: 'invalid' },
    });
  });

  it('tells an empty WhatsApp from one that can be fixed', () => {
    const whatsapp = (value: unknown) => {
      const result = validateSubmission({ ...valid, whatsapp: value });
      return result.ok ? null : result.errors.whatsapp;
    };
    expect(whatsapp('')).toBe('missing');
    expect(whatsapp('   ')).toBe('missing');
    expect(whatsapp(undefined)).toBe('missing');
    expect(whatsapp('99999-9999')).toBe('invalid');
    expect(whatsapp('(20) 99999-9999')).toBe('invalid');
  });

  it('rejects options that are not on the page', () => {
    expect(validateSubmission({ ...valid, interest: 'claro' })).toEqual({ ok: false, errors: { interest: 'invalid' } });
    expect(validateSubmission({ ...valid, format: 'presencial ' })).toEqual({ ok: false, errors: { format: 'invalid' } });
  });

  it('takes names up to 80 characters', () => {
    expect(validateSubmission({ ...valid, name: 'a'.repeat(81) })).toEqual({ ok: false, errors: { name: 'too_long' } });
    expect(validateSubmission({ ...valid, name: 'a'.repeat(80) }).ok).toBe(true);
  });

  it('treats an unknown consent version, a missing submission id or a non-boolean opt-in as malformed', () => {
    expect(validateSubmission({ ...valid, consentVersion: 'v1' })).toEqual({ ok: false, errors: {} });
    expect(validateSubmission({ ...valid, consentVersion: undefined })).toEqual({ ok: false, errors: {} });
    expect(validateSubmission({ ...valid, submissionId: undefined })).toEqual({ ok: false, errors: {} });
    expect(validateSubmission({ ...valid, submissionId: '1' })).toEqual({ ok: false, errors: {} });
    expect(validateSubmission({ ...valid, testInvite: 'sim' })).toEqual({ ok: false, errors: {} });
  });

  it('lists fields with errors in page order', () => {
    expect(errorFields({ whatsapp: 'invalid', interest: 'missing' })).toEqual(['interest', 'whatsapp']);
  });
});
