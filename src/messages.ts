import type { FieldError, FieldName } from '../shared/interest.js';

// Copy the script shows while the form is used. Everything else is in the HTML.

export const fieldMessages: Record<FieldName, Partial<Record<FieldError, string>> & { missing: string }> = {
  interest: { missing: 'escolha uma das opções.' },
  format: { missing: 'escolha uma das opções.' },
  name: {
    missing: 'informe como a gente pode te chamar.',
    invalid: 'confira o nome ou apelido que você informou.',
    too_long: 'use até 80 caracteres no nome ou apelido.',
  },
  whatsapp: {
    missing: 'informe seu WhatsApp com DDD.',
    invalid: 'confira o DDD e o número do WhatsApp.',
    characters: 'use apenas números e sinais de telefone, sem letras ou outros símbolos.',
  },
};

/** Read by screen readers while the button says "enviando...". */
export const sendingStatus = 'enviando sua resposta...';

export type FailureKind = 'notStored' | 'unconfirmed' | 'tooMany' | 'unexpected';

export const failureMessages: Record<FailureKind, { title: string; text: string }> = {
  // The server says nothing was written.
  notStored: {
    title: 'não conseguimos guardar sua resposta.',
    text: 'o que você preencheu continua aqui. tenta enviar de novo.',
  },
  // No answer, or the server couldn't tell: the response may or may not be stored.
  unconfirmed: {
    title: 'não conseguimos confirmar o envio.',
    text: 'sua resposta continua preenchida. tenta de novo.',
  },
  tooMany: {
    title: 'muitas tentativas por aqui.',
    text: 'espera alguns minutos e tenta enviar de novo.',
  },
  unexpected: {
    title: 'não deu pra enviar agora.',
    text: 'tenta novamente daqui a pouco.',
  },
};
