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

/**
 * What happened to a submission. The page gets the same answer for all of
 * them, so nobody can find out whether a number is already here.
 * - stored: first answers for this number;
 * - requested: the number was already here with other answers; they wait in
 *   change_requests until someone confirms them with that WhatsApp;
 * - unchanged: the same answers that are already stored for this number;
 * - replayed: this submission had already arrived (a retry after a lost answer).
 */
export type SaveOutcome = 'stored' | 'requested' | 'unchanged' | 'replayed';

/** One statement, so concurrent submissions for the same number stay consistent. */
export async function saveResponse(db: Db, submission: Submission): Promise<SaveOutcome> {
  const [row] = await db.query<{ outcome: SaveOutcome }>(
    `with inserted as (
       insert into responses (submission_id, name, whatsapp, interest, format, test_invite, consent_version)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict do nothing
       returning 1
     ), seen as (
       select 1 from responses where submission_id = $1
       union all
       select 1 from change_requests where submission_id = $1
     ), requested as (
       insert into change_requests (submission_id, whatsapp, name, interest, format, test_invite, consent_version)
       select $1, $3, $2, $4, $5, $6, $7
        where not exists (select 1 from inserted)
          and not exists (select 1 from seen)
          and not exists (
            select 1 from responses
             where whatsapp = $3 and name = $2 and interest = $4 and format = $5 and test_invite = $6
          )
       on conflict (submission_id) do nothing
       returning 1
     )
     select case
       when exists (select 1 from inserted) then 'stored'
       when exists (select 1 from requested) then 'requested'
       when exists (select 1 from seen) then 'replayed'
       else 'unchanged'
     end as outcome`,
    [
      submission.submissionId,
      submission.name,
      submission.whatsapp,
      submission.interest,
      submission.format,
      submission.testInvite,
      submission.consentVersion,
    ],
  );
  return row!.outcome;
}
