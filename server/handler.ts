import { validateSubmission } from '../shared/interest.js';
import { RATE_LIMIT, registerRequest, saveResponse, type Db } from './store.js';

export type HandlerOptions = {
  db: Db;
  /** Key for hashing client IPs before they touch the database. */
  secret: string;
  /** Requests per client per window; RATE_LIMIT unless a local server sets another. */
  rateLimit?: number;
};

const MAX_BODY_BYTES = 4096;

/**
 * POST /api/responses. Answers 200 only after the submission is recorded,
 * with the same body whatever was recorded (see SaveOutcome), so the answer
 * never tells whether a number is already here.
 *
 * Failures say what is known: 503 not_stored when nothing was written, 504
 * unconfirmed when the database may have finished without us hearing back.
 * Retrying is safe in both cases: the submission id makes it idempotent.
 *
 * Nothing from the request body is ever logged: errors are reported by
 * code only, so phone numbers and names don't end up in platform logs.
 */
export async function handleSubmission(
  request: Request,
  { db, secret, rateLimit = RATE_LIMIT.requests }: HandlerOptions,
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
  }

  const origin = request.headers.get('origin');
  if (origin && !sameHost(origin, request)) {
    return json({ error: 'forbidden' }, 403);
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'unsupported_media_type' }, 415);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);

  let body: unknown;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // Hidden field that people never see. Whatever fills it gets a normal
  // answer and nothing is stored.
  const trap = (body as Record<string, unknown> | null)?.trap;
  if (typeof trap === 'string' && trap.trim() !== '') {
    return json({ ok: true }, 200);
  }

  let writing = false;
  try {
    const requests = await registerRequest(db, await clientKey(request, secret));
    if (requests > rateLimit) {
      return json({ error: 'too_many_requests' }, 429, {
        'retry-after': String(RATE_LIMIT.windowMinutes * 60),
      });
    }

    const result = validateSubmission(body);
    if (!result.ok) {
      return Object.keys(result.errors).length > 0
        ? json({ error: 'invalid', fields: result.errors }, 422)
        : json({ error: 'bad_request' }, 400);
    }

    writing = true;
    await saveResponse(db, result.value);
    return json({ ok: true }, 200);
  } catch (error) {
    const code = errorCode(error);
    // Postgres reports errors with a SQLSTATE code, and a failed statement is
    // rolled back. Without one (a dropped connection, a timeout) the write may
    // or may not have happened.
    const known = !writing || /^[0-9A-Z]{5}$/.test(code);
    console.error(known ? 'response not stored' : 'response not confirmed', { code });
    return known ? json({ error: 'not_stored' }, 503) : json({ error: 'unconfirmed' }, 504);
  }
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function sameHost(origin: string, request: Request): boolean {
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function clientKey(request: Request, secret: string): Promise<string> {
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Buffer.from(signature).toString('base64url').slice(0, 22);
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && error.code) {
    return error.code;
  }
  return error instanceof Error ? error.name : 'unknown';
}
