// What the form collects and the rules for accepting it. Shared by the page
// and the API so both validate the same way.

export const INTEREST_OPTIONS = ['sim', 'talvez', 'acompanhar'] as const;
export const FORMAT_OPTIONS = ['presencial', 'online', 'os-dois', 'nao-sei'] as const;

export type Interest = (typeof INTEREST_OPTIONS)[number];
export type Format = (typeof FORMAT_OPTIONS)[number];

// Versions of the contact consent text a submission can refer to. Each one
// has its exact wording in db/schema.sql (table consent_texts). When the copy
// next to the button changes, add a new version there and here, and update
// data-consent-version in index.html.
export const CONSENT_VERSIONS = ['2026-10'] as const;

export const NAME_MAX_LENGTH = 80;

export type Submission = {
  name: string;
  whatsapp: string; // E.164, e.g. +5531999999999
  interest: Interest;
  format: Format;
  testInvite: boolean;
  consentVersion: string;
};

export type FieldName = 'interest' | 'format' | 'name' | 'whatsapp';

// Order of the fields on the page, used to focus the first one with an error.
export const FIELD_ORDER: readonly FieldName[] = ['interest', 'format', 'name', 'whatsapp'];

// An invalid result with no fields is a malformed request (unknown consent
// version, opt-in that isn't a boolean): nothing the person can fix.
export type ValidationResult =
  | { ok: true; value: Submission }
  | { ok: false; fields: FieldName[] };

// Area codes in use in Brazil (Anatel).
const AREA_CODES = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

export function normalizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turns what people type into an E.164 Brazilian number, or null when it
 * isn't one. Accepts any punctuation, an optional +55 / 55 prefix and the
 * trunk 0 before the area code. Mobile numbers have 9 digits starting with 9;
 * landlines (WhatsApp Business) have 8 digits starting with 2 to 5.
 */
export function normalizeWhatsapp(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  let digits = raw.replace(/\D/g, '');

  if (raw.trim().startsWith('+')) {
    if (!digits.startsWith('55')) return null;
    digits = digits.slice(2);
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  const areaCode = digits.slice(0, 2);
  const number = digits.slice(2);
  if (!AREA_CODES.has(areaCode)) return null;
  const isMobile = number.length === 9 && number.startsWith('9');
  const isLandline = number.length === 8 && /^[2-5]/.test(number);
  if (!isMobile && !isLandline) return null;

  return `+55${areaCode}${number}`;
}

/** "+5531999999999" → "(31) 99999-9999" */
export function formatWhatsapp(e164: string): string {
  const areaCode = e164.slice(3, 5);
  const number = e164.slice(5);
  const split = number.length - 4;
  return `(${areaCode}) ${number.slice(0, split)}-${number.slice(split)}`;
}

export function validateSubmission(input: unknown): ValidationResult {
  const data = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const fields: FieldName[] = [];

  const interest = INTEREST_OPTIONS.find((option) => option === data.interest);
  if (!interest) fields.push('interest');

  const format = FORMAT_OPTIONS.find((option) => option === data.format);
  if (!format) fields.push('format');

  const name = normalizeName(data.name);
  if (name.length === 0 || [...name].length > NAME_MAX_LENGTH) fields.push('name');

  const whatsapp = normalizeWhatsapp(data.whatsapp);
  if (!whatsapp) fields.push('whatsapp');

  const consentVersion = CONSENT_VERSIONS.find((version) => version === data.consentVersion);
  const testInvite = data.testInvite === undefined ? false : data.testInvite;

  if (fields.length > 0) return { ok: false, fields };
  if (!consentVersion || typeof testInvite !== 'boolean') return { ok: false, fields };

  return {
    ok: true,
    value: {
      name,
      whatsapp: whatsapp!,
      interest: interest!,
      format: format!,
      testInvite,
      consentVersion,
    },
  };
}
