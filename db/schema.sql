-- Schema for the interest form. Safe to run more than once.

-- Exact wording a person saw when they agreed to be contacted: the sentence
-- next to the button, the privacy line under it, the test invite and the
-- privacy notice (privacidade.html). Each response points to one version.
create table if not exists consent_texts (
  version text primary key,
  contact text not null,
  privacy text not null,
  test_invite text not null,
  notice text,
  created_at timestamptz not null default now()
);

-- One row per WhatsApp number, as first sent. Sending the form again with a
-- number that is already here never changes this row (see change_requests).
create table if not exists responses (
  id bigint generated always as identity primary key,
  submission_id uuid not null unique,
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

-- Different answers sent later for a number that is already in responses.
-- Typing a number doesn't prove it's yours, so they wait here until the
-- organizers confirm them with that WhatsApp (README: change requests).
-- Deleting the response deletes its requests.
create table if not exists change_requests (
  id bigint generated always as identity primary key,
  submission_id uuid not null unique,
  whatsapp text not null references responses (whatsapp) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  interest text not null check (interest in ('sim', 'talvez', 'acompanhar')),
  format text not null check (format in ('presencial', 'online', 'os-dois', 'nao-sei')),
  test_invite boolean not null,
  consent_version text not null references consent_texts (version),
  created_at timestamptz not null default now()
);

create index if not exists change_requests_whatsapp on change_requests (whatsapp);

-- Short-lived rate limiting: a keyed hash of the client IP per request, kept
-- for at most an hour. Never joined with responses.
create table if not exists request_log (
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists request_log_client_key_created_at on request_log (client_key, created_at);

-- v1 is the first wording, never published. v2 adds the privacy notice; its
-- pending items have to be filled in before publishing (README). A version
-- can still be corrected here while no response points to it; after that,
-- any change needs a new version.
insert into consent_texts as existing (version, contact, privacy, test_invite, notice) values (
  'v1',
  'ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube. pra parar depois, é só avisar.',
  'o contato fica só com a gente, pra falar deste clube.',
  'a gente também tá criando uma experiência digital pro clube. quer receber um convite pra testar quando tiver algo pronto? sim, me chama pra testar também',
  null
), (
  'v2',
  'ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube. pra parar depois, é só avisar.',
  'a gente usa seus dados só pra organizar o clube e entrar em contato sobre ele.',
  'a gente também tá criando uma experiência digital pro clube. quer receber um convite pra testar quando tiver algo pronto? sim, me chama pra testar também',
  'como usamos seus dados
esse formulário serve pra gente saber quem tem vontade de participar do clube e conseguir chamar essas pessoas quando os detalhes estiverem definidos. aqui vai, em poucas linhas, o que a gente faz com o que você responde.
quem organiza
o clube é organizado por [IDENTIFICAÇÃO DOS RESPONSÁVEIS], que respondem pelo uso desses dados.
o que a gente guarda e pra quê
seu nome ou apelido e seu WhatsApp, pra saber como te chamar e conseguir falar com você;
suas respostas sobre a vontade de participar e o formato dos encontros, pra organizar o clube;
se você quer o convite pra testar a experiência digital;
quando você enviou e qual versão destes textos estava no ar, pra registrar sua autorização.
não usamos cookies nem ferramentas de análise, e não guardamos seu endereço IP junto das respostas.
contato sobre o clube e convite pro teste
o WhatsApp é usado só pra falar do clube: contar os detalhes quando estiverem definidos e saber se você ainda tá a fim. ninguém entra em grupo sem combinar. ao enviar o formulário você autoriza esse contato, e pode retirar a autorização quando quiser.
o convite pra testar a experiência digital é separado e opcional. só chamamos pra isso quem marcou essa opção, e desistir dele não muda nada na sua participação no clube.
onde ficam e quem vê
o site fica na Vercel e as respostas, num banco de dados da Neon, em servidores em são paulo. só quem organiza o clube tem acesso a elas. as respostas não ficam públicas e não são vendidas nem repassadas pra ninguém.
se alguém enviar o formulário de novo com um número que já está aqui, a gente não troca as respostas na hora: guarda o pedido e confirma pelo próprio WhatsApp antes de mudar qualquer coisa.
por quanto tempo
[CRITÉRIO DE RETENÇÃO APROVADO]
pra parar, corrigir ou apagar
pra saber o que temos sobre você, corrigir alguma coisa, apagar seus dados ou parar o contato, é só avisar por [CANAL DE CONTATO PARA PRIVACIDADE] ou responder a nossa mensagem no WhatsApp. a gente confirma pelo número cadastrado que o pedido é seu e atende o quanto antes, inclusive nas cópias que tivermos feito.'
)
on conflict (version) do update set
  contact = excluded.contact,
  privacy = excluded.privacy,
  test_invite = excluded.test_invite,
  notice = excluded.notice
where not exists (select 1 from responses where consent_version = existing.version)
  and not exists (select 1 from change_requests where consent_version = existing.version);
