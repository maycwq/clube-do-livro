import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSubmission } from './handler.js';
import { createLocalDb } from './local-db.js';
import { RATE_LIMIT, type Db } from './store.js';

type LocalDb = Awaited<ReturnType<typeof createLocalDb>>;
type Row = Record<string, unknown>;

const answers = {
  interest: 'sim',
  format: 'presencial',
  name: 'Ana',
  whatsapp: '(31) 98765-4321',
  testInvite: false,
  consentVersion: 'v2',
};

// Each new set of answers gets its own id, as the page does.
const submission = (overrides: Record<string, unknown> = {}) => ({
  ...answers,
  submissionId: crypto.randomUUID(),
  ...overrides,
});

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://clube.example/api/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://clube.example', 'x-real-ip': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('handleSubmission', () => {
  let db: LocalDb;
  const send = (request: Request, database: Db = db) => handleSubmission(request, { db: database, secret: 'test' });
  const rows = () => db.query<Row>('select * from responses order by id');
  const requests = () => db.query<Row>('select * from change_requests order by id');

  beforeAll(async () => {
    db = await createLocalDb();
  });

  beforeEach(async () => {
    await db.query('truncate responses, change_requests, request_log');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.close();
  });

  it('stores a valid response and answers only after that', async () => {
    const response = await send(post(submission()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [row] = await rows();
    expect(row).toMatchObject({
      name: 'Ana',
      whatsapp: '+5531987654321',
      interest: 'sim',
      format: 'presencial',
      test_invite: false,
      consent_version: 'v2',
    });
    expect(row?.consented_at).toBeInstanceOf(Date);
  });

  it('keeps the test invite as answered, whatever the interest in the club', async () => {
    await send(post(submission({ interest: 'acompanhar', format: 'nao-sei', testInvite: true })));
    expect((await rows())[0]).toMatchObject({ interest: 'acompanhar', format: 'nao-sei', test_invite: true });
  });

  it('never changes stored answers when the number is sent again; the new ones wait for confirmation', async () => {
    await send(post(submission()));
    const [before] = await rows();

    const response = await send(
      post(submission({ name: 'Outra pessoa', whatsapp: '+55 31 98765 4321', format: 'online', testInvite: true })),
    );

    expect(response.status).toBe(200);
    expect(await rows()).toEqual([before]);
    expect(await requests()).toEqual([
      expect.objectContaining({ whatsapp: '+5531987654321', name: 'Outra pessoa', format: 'online', test_invite: true }),
    ]);
  });

  it("doesn't let anyone turn someone else's test invite on or off", async () => {
    await send(post(submission({ whatsapp: '(31) 91111-1111', testInvite: true })));
    await send(post(submission({ whatsapp: '(31) 92222-2222', testInvite: false })));

    await send(post(submission({ whatsapp: '(31) 91111-1111', testInvite: false })));
    await send(post(submission({ whatsapp: '(31) 92222-2222', testInvite: true })));

    const stored = await db.query<Row>('select whatsapp, test_invite from responses order by whatsapp');
    expect(stored).toEqual([
      { whatsapp: '+5531911111111', test_invite: true },
      { whatsapp: '+5531922222222', test_invite: false },
    ]);
    expect(await requests()).toHaveLength(2);
  });

  it('answers the same way whether or not the number is already here', async () => {
    const first = await send(post(submission()));
    const again = await send(post(submission({ name: 'Outra pessoa' })));

    expect(again.status).toBe(first.status);
    expect(await again.text()).toBe(await first.text());
    expect([...again.headers]).toEqual([...first.headers]);
  });

  it('records nothing new when the same answers arrive again', async () => {
    await send(post(submission({ testInvite: true })));
    const response = await send(post(submission({ testInvite: true, whatsapp: '31987654321' })));

    expect(response.status).toBe(200);
    expect(await rows()).toHaveLength(1);
    expect(await requests()).toHaveLength(0);
  });

  it('records a retried submission only once', async () => {
    const first = submission();
    const change = submission({ format: 'online' });
    for (const body of [first, first, change, change]) {
      expect((await send(post(body))).status).toBe(200);
    }

    expect(await rows()).toHaveLength(1);
    expect(await requests()).toHaveLength(1);
  });

  it('keeps the first answers when two submissions for a new number arrive together', async () => {
    await Promise.all([
      send(post(submission({ name: 'Ana' }))),
      send(post(submission({ name: 'Ana Maria' }))),
    ]);

    expect(await rows()).toHaveLength(1);
    expect(await requests()).toHaveLength(1);
  });

  it('deleting a response also deletes its pending changes', async () => {
    await send(post(submission()));
    await send(post(submission({ format: 'online' })));
    await db.query(`delete from responses where whatsapp = '+5531987654321'`);

    expect(await requests()).toHaveLength(0);
  });

  it('records which texts were shown', async () => {
    await send(post(submission()));
    const [consent] = await db.query<Row>(
      'select c.contact, c.privacy, c.notice from responses r join consent_texts c on c.version = r.consent_version',
    );
    expect(consent?.contact).toBe(
      'ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube. pra parar depois, é só avisar.',
    );
    expect(consent?.privacy).toBe('a gente usa seus dados só pra organizar o clube e entrar em contato sobre ele.');
    expect(consent?.notice).toMatch(/^como usamos seus dados\n/);
  });

  it('answers 422 with the fields to fix and stores nothing', async () => {
    const response = await send(post(submission({ interest: undefined, name: ' ', whatsapp: '9999-9999' })));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'invalid',
      fields: { interest: 'missing', name: 'missing', whatsapp: 'invalid' },
    });
    expect(await rows()).toHaveLength(0);
  });

  it('refuses what the page refuses, without dropping characters to make a number fit', async () => {
    const response = await send(post(submission({ name: '5625746785', whatsapp: '31a98765-4321' })));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalid', fields: { name: 'invalid', whatsapp: 'characters' } });
    const tooLong = await send(post(submission({ name: 'a'.repeat(81) })));
    expect(await tooLong.json()).toEqual({ error: 'invalid', fields: { name: 'too_long' } });
    expect(await rows()).toHaveLength(0);
  });

  it('answers 400 to malformed requests', async () => {
    expect((await send(post('{"name": '))).status).toBe(400);
    expect((await send(post(submission({ consentVersion: 'v1' })))).status).toBe(400);
    expect((await send(post(answers))).status).toBe(400); // no submission id
    expect(await rows()).toHaveLength(0);
  });

  it('pretends to accept what fills the hidden field, without storing it', async () => {
    const response = await send(post(submission({ trap: 'http://spam.example' })));
    expect(response.status).toBe(200);
    expect(await rows()).toHaveLength(0);
  });

  it(`limits each client to ${RATE_LIMIT.requests} requests per ${RATE_LIMIT.windowMinutes} minutes`, async () => {
    for (let i = 0; i < RATE_LIMIT.requests; i++) {
      expect((await send(post(submission({ name: `Ana ${i}` })))).status).toBe(200);
    }
    const blocked = await send(post(submission()));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe(String(RATE_LIMIT.windowMinutes * 60));

    // Another address still gets through.
    expect((await send(post(submission(), { 'x-real-ip': '198.51.100.20' }))).status).toBe(200);
  });

  it('keeps only hashes of client addresses, and only for an hour', async () => {
    await db.query(`insert into request_log (client_key, created_at) values ('old', now() - interval '2 hours')`);
    await send(post(submission()));

    const log = await db.query<{ client_key: string }>('select client_key from request_log');
    expect(log).toHaveLength(1);
    expect(log[0]?.client_key).not.toContain('203.0.113.7');
  });

  it('refuses other methods, other origins, other content types and large bodies', async () => {
    expect((await send(new Request('https://clube.example/api/responses'))).status).toBe(405);
    expect((await send(post(submission(), { origin: 'https://elsewhere.example' }))).status).toBe(403);
    expect((await send(post(submission(), { 'content-type': 'application/x-www-form-urlencoded' }))).status).toBe(415);
    expect((await send(post(submission({ name: 'a'.repeat(5000) })))).status).toBe(413);
    expect(await rows()).toHaveLength(0);
  });

  it('says nothing was stored when the database refused the write, without logging personal data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refusing = failOnWrite(Object.assign(new Error('Failing row contains (Ana, +5531987654321)'), { code: '23514' }));

    const response = await send(post(submission()), refusing);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'not_stored' });
    expect(log).toHaveBeenCalledWith('response not stored', { code: '23514' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/98765|Ana/);
  });

  it("says the result is unknown when the database stops answering during the write", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await send(post(submission()), failOnWrite(new TypeError('fetch failed')));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: 'unconfirmed' });
  });

  it('says nothing was stored when the database is unreachable before the write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unreachable: Db = {
      async query() {
        throw new TypeError('fetch failed');
      },
    };
    expect((await send(post(submission()), unreachable)).status).toBe(503);
  });

  // Lets the rate limit through and fails the statement that writes the answers.
  function failOnWrite(error: Error): Db {
    return {
      async query<R>(text: string, params?: unknown[]) {
        if (text.includes('insert into responses')) throw error;
        return db.query<R>(text, params);
      },
    };
  }
});
