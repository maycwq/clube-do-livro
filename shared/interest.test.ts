import { describe, expect, it } from 'vitest';
import {
  earlyFieldError,
  errorFields,
  fieldError,
  formatWhatsapp,
  normalizeName,
  normalizeWhatsapp,
  validateSubmission,
} from './interest.js';

describe('normalizeWhatsapp', () => {
  it.each([
    ['(31) 99999-9999', '+5531999999999'],
    ['31999999999', '+5531999999999'],
    ['31 9 9999 9999', '+5531999999999'],
    ['(31)99999-9999', '+5531999999999'],
    ['31.99999.9999', '+5531999999999'],
    ['31 99999\u20139999', '+5531999999999'], // en dash, as pasted from formatted text
    ['+55 31 99999-9999', '+5531999999999'],
    ['+55 (31) 99999-9999', '+5531999999999'],
    ['(+55) 31 99999-9999', '+5531999999999'],
    ['55 31 99999-9999', '+5531999999999'],
    ['5531999999999', '+5531999999999'],
    ['031 99999-9999', '+5531999999999'],
    ['+55 031 99999-9999', '+5531999999999'],
    [' (31) 99999-9999 ', '+5531999999999'],
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
    ['31a99999999', 'a letter among the digits'],
    ['tel: 31 99999-9999', 'a prefix in letters'],
    ['(31) 99999-9999 ramal 2', 'an extension'],
    ['31 99999#9999', 'a symbol that is not part of a number'],
    ['31 +99999-9999', 'a + in the middle'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeWhatsapp(input)).toBeNull();
  });

  it('ignores anything that is not a string', () => {
    expect(normalizeWhatsapp(31999999999)).toBeNull();
    expect(normalizeWhatsapp(null)).toBeNull();
  });
});

describe('fieldError: whatsapp', () => {
  it.each([
    ['', 'missing'],
    ['   ', 'missing'],
    [undefined, 'missing'],
    ['31a99999999', 'characters'],
    ['WhatsApp: (31) 99999-9999', 'characters'],
    ['(31) 9999', 'invalid'],
    ['99999-9999', 'invalid'],
    ['(20) 99999-9999', 'invalid'],
    ['319999999999', 'invalid'],
    ['(31) 99999-9999', undefined],
  ])('%s → %s', (input, expected) => {
    expect(fieldError('whatsapp', input)).toBe(expected);
  });
});

describe('earlyFieldError: what is certain while typing', () => {
  it.each(['', '3', '(31', '(31) 9', '(31) 99999-999', '+', '+5', '+55 3', '0', '031 9', '55 31 99999-999'])(
    'says nothing about %s, which can still become a number',
    (input) => {
      expect(earlyFieldError('whatsapp', input)).toBeUndefined();
    },
  );

  it('flags letters and other symbols as soon as they are typed', () => {
    expect(earlyFieldError('whatsapp', '3a')).toBe('characters');
    expect(earlyFieldError('whatsapp', '(31) 9999*')).toBe('characters');
  });

  it('flags digits beyond what any Brazilian number has, whatever the prefix', () => {
    expect(earlyFieldError('whatsapp', '(31) 99999-99999')).toBe('invalid'); // 12 digits, no prefix
    expect(earlyFieldError('whatsapp', '55 31 99999-9999')).toBeUndefined(); // 13 with the country code
    expect(earlyFieldError('whatsapp', '55 31 99999-99999')).toBe('invalid');
    expect(earlyFieldError('whatsapp', '031 99999-99999')).toBe('invalid');
    expect(earlyFieldError('whatsapp', '+55 31 99999-99999')).toBe('invalid');
  });

  it('leaves the area code, a foreign number and the length of a short number to the end', () => {
    expect(earlyFieldError('whatsapp', '(20) 99999-9999')).toBeUndefined();
    expect(earlyFieldError('whatsapp', '+1 555 123 4567')).toBeUndefined();
    expect(earlyFieldError('whatsapp', '9999-9999')).toBeUndefined();
  });

  it('flags a name over the limit, and nothing else about names', () => {
    expect(earlyFieldError('name', 'a'.repeat(81))).toBe('too_long');
    expect(earlyFieldError('name', 'a'.repeat(80))).toBeUndefined();
    expect(earlyFieldError('name', '5625746785')).toBeUndefined();
    expect(earlyFieldError('name', '')).toBeUndefined();
  });
});

describe('fieldError: name', () => {
  it.each([
    'Ana',
    'a',
    'Ana Maria',
    'José',
    'Zoë',
    "D'Ávila",
    'Ana-Clara',
    'João Pedro da Silva',
    'm4yco',
    'ana_07',
    'R2-D2',
    '007',
    '42',
    '12345',
    '#1',
    '李小龙',
    'さくら',
    'Ольга',
    'محمد',
    'Nguyễn',
    '🌻 Ana',
  ])('accepts %s', (name) => {
    expect(fieldError('name', name)).toBeUndefined();
  });

  it.each([
    ['', 'missing'],
    ['    ', 'missing'],
    ['\u200b', 'missing'],
    ['\u0000\t', 'missing'],
    ['5625746785', 'invalid'],
    ['(31) 99999-9999', 'invalid'],
    ['123456', 'invalid'],
    ['...', 'invalid'],
    ['?', 'invalid'],
    ['🌻', 'invalid'],
  ])('%s → %s', (name, expected) => {
    expect(fieldError('name', name)).toBe(expected);
  });

  it('counts the limit in characters, after tidying spaces', () => {
    expect(fieldError('name', 'a'.repeat(80))).toBeUndefined();
    expect(fieldError('name', 'a'.repeat(81))).toBe('too_long');
    expect(fieldError('name', `  ${'a'.repeat(80)}  `)).toBeUndefined();
    expect(fieldError('name', 'ã'.repeat(80))).toBeUndefined();
    // 80 characters, 120 UTF-16 units
    expect(fieldError('name', '🌻'.repeat(40) + 'a'.repeat(40))).toBeUndefined();
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

  it("keeps everything else as typed: case, accents, punctuation, digits", () => {
    for (const name of ["D'Ávila", 'ana_07', 'MAYCO', 'Zoë-Ann', 'm4yco']) expect(normalizeName(name)).toBe(name);
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

  it('refuses what the page refuses: a long number as a name, letters in the WhatsApp', () => {
    expect(validateSubmission({ ...valid, name: '5625746785', whatsapp: '31a98765-4321' })).toEqual({
      ok: false,
      errors: { name: 'invalid', whatsapp: 'characters' },
    });
    const result = validateSubmission({ ...valid, name: ' m4yco ', whatsapp: '+55 (31) 98765-4321' });
    expect(result.ok && [result.value.name, result.value.whatsapp]).toEqual(['m4yco', '+5531987654321']);
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
