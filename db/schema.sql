-- Schema for the interest form. Safe to run more than once.

-- Exact wording a person saw when they agreed to be contacted. Each response
-- points to one version, so the record says what was agreed to, not just when.
create table if not exists consent_texts (
  version text primary key,
  contact text not null,
  privacy text not null,
  test_invite text not null,
  created_at timestamptz not null default now()
);

insert into consent_texts (version, contact, privacy, test_invite) values (
  '2026-10',
  'ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube. pra parar depois, é só avisar.',
  'o contato fica só com a gente, pra falar deste clube.',
  'a gente também tá criando uma experiência digital pro clube. quer receber um convite pra testar quando tiver algo pronto? sim, me chama pra testar também'
) on conflict (version) do nothing;

-- One row per WhatsApp number. Sending the form again with the same number
-- updates the row instead of creating another one.
create table if not exists responses (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  whatsapp text not null unique check (whatsapp ~ '^\+55[0-9]{10,11}$'),
  interest text not null check (interest in ('sim', 'talvez', 'acompanhar')),
  format text not null check (format in ('presencial', 'online', 'os-dois', 'nao-sei')),
  test_invite boolean not null default false,
  consent_version text not null references consent_texts (version),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Short-lived rate limiting: a keyed hash of the client IP per request, kept
-- for at most an hour. Never joined with responses.
create table if not exists request_log (
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists request_log_client_key_created_at on request_log (client_key, created_at);
