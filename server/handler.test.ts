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
  consentVersion: '2026-10',
};

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

  beforeAll(async () => {
    db = await createLocalDb();
  });

  beforeEach(async () => {
    await db.query('truncate responses, request_log');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.close();
  });

  it('stores a valid response and answers only after that', async () => {
    const response = await send(post(answers));

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
      consent_version: '2026-10',
    });
    expect(row?.consented_at).toBeInstanceOf(Date);
  });

  it('keeps the test invite as answered, whatever the interest in the club', async () => {
    await send(post({ ...answers, interest: 'acompanhar', format: 'nao-sei', testInvite: true }));
    expect((await rows())[0]).toMatchObject({ interest: 'acompanhar', format: 'nao-sei', test_invite: true });
  });

  it('updates the same row when a number is sent again', async () => {
    await send(post(answers));
    const [first] = await rows();
    await send(post({ ...answers, name: 'Ana Maria', whatsapp: '+55 31 98765 4321', format: 'online', testInvite: true }));

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: 'Ana Maria', format: 'online', test_invite: true });
    expect(all[0]?.created_at).toEqual(first?.created_at);
    expect((all[0]?.consented_at as Date) >= (first?.consented_at as Date)).toBe(true);
  });

  it('records which consent text was shown', async () => {
    await send(post(answers));
    const [consent] = await db.query<Row>(
      'select c.contact from responses r join consent_texts c on c.version = r.consent_version',
    );
    expect(consent?.contact).toBe(
      'ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube. pra parar depois, é só avisar.',
    );
  });

  it('answers 422 with the fields to fix and stores nothing', async () => {
    const response = await send(post({ ...answers, interest: undefined, whatsapp: '9999-9999' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'invalid', fields: ['interest', 'whatsapp'] });
    expect(await rows()).toHaveLength(0);
  });

  it('answers 400 to malformed requests', async () => {
    expect((await send(post('{"name": '))).status).toBe(400);
    expect((await send(post({ ...answers, consentVersion: 'old' }))).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it('pretends to accept what fills the hidden field, without storing it', async () => {
    const response = await send(post({ ...answers, trap: 'http://spam.example' }));
    expect(response.status).toBe(200);
    expect(await rows()).toHaveLength(0);
  });

  it(`limits each client to ${RATE_LIMIT.requests} requests per ${RATE_LIMIT.windowMinutes} minutes`, async () => {
    for (let i = 0; i < RATE_LIMIT.requests; i++) {
      expect((await send(post({ ...answers, name: `Ana ${i}` }))).status).toBe(200);
    }
    const blocked = await send(post(answers));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe(String(RATE_LIMIT.windowMinutes * 60));

    // Another address still gets through.
    expect((await send(post(answers, { 'x-real-ip': '198.51.100.20' }))).status).toBe(200);
  });

  it('keeps only hashes of client addresses, and only for an hour', async () => {
    await db.query(`insert into request_log (client_key, created_at) values ('old', now() - interval '2 hours')`);
    await send(post(answers));

    const log = await db.query<{ client_key: string }>('select client_key from request_log');
    expect(log).toHaveLength(1);
    expect(log[0]?.client_key).not.toContain('203.0.113.7');
  });

  it('refuses other methods, other origins, other content types and large bodies', async () => {
    expect((await send(new Request('https://clube.example/api/responses'))).status).toBe(405);
    expect((await send(post(answers, { origin: 'https://elsewhere.example' }))).status).toBe(403);
    expect((await send(post(answers, { 'content-type': 'application/x-www-form-urlencoded' }))).status).toBe(415);
    expect((await send(post({ ...answers, name: 'a'.repeat(5000) }))).status).toBe(413);
    expect(await rows()).toHaveLength(0);
  });

  it('answers 503 when the database fails, without logging personal data', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: Db = {
      async query() {
        throw Object.assign(new Error('Failing row contains (Ana, +5531987654321)'), { code: '23514' });
      },
    };

    const response = await send(post(answers), failing);

    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledWith('response not stored', { code: '23514' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/98765|Ana/);
  });
});
