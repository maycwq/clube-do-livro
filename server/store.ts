import type { Submission } from '../shared/interest.js';

// The two database drivers (Neon in production, PGlite locally and in tests)
// both fit this shape.
export type Db = {
  query<Row = Record<string, unknown>>(text: string, params?: unknown[]): Promise<Row[]>;
};

export const RATE_LIMIT = { requests: 20, windowMinutes: 10 };

/**
 * Records one request for this client and returns how many it made inside
 * the window, this one included. Entries older than an hour are dropped on
 * the way, so the table never holds more than that.
 */
export async function registerRequest(db: Db, clientKey: string): Promise<number> {
  const [row] = await db.query<{ requests: number }>(
    `with dropped as (
       delete from request_log where created_at < now() - interval '1 hour'
     ), logged as (
       insert into request_log (client_key) values ($1)
     )
     select count(*)::int + 1 as requests
       from request_log
      where client_key = $1
        and created_at > now() - make_interval(mins => $2)`,
    [clientKey, RATE_LIMIT.windowMinutes],
  );
  return row?.requests ?? 1;
}

/** One row per number: sending again replaces the answers and renews the consent. */
export async function saveResponse(db: Db, submission: Submission): Promise<void> {
  await db.query(
    `insert into responses (name, whatsapp, interest, format, test_invite, consent_version)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (whatsapp) do update set
       name = excluded.name,
       interest = excluded.interest,
       format = excluded.format,
       test_invite = excluded.test_invite,
       consent_version = excluded.consent_version,
       consented_at = now(),
       updated_at = now()`,
    [
      submission.name,
      submission.whatsapp,
      submission.interest,
      submission.format,
      submission.testInvite,
      submission.consentVersion,
    ],
  );
}
