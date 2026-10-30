import { handleSubmission } from '../server/handler.js';
import { createNeonDb } from '../server/neon-db.js';

// Vercel Function. DATABASE_URL is set by the Neon integration (or by hand,
// see README). Only POST is exported, so any other method gets a 405.

const databaseUrl = process.env.DATABASE_URL;
const db = databaseUrl ? createNeonDb(databaseUrl) : null;

export async function POST(request: Request): Promise<Response> {
  if (!db || !databaseUrl) {
    console.error('DATABASE_URL is not set');
    return Response.json({ error: 'not_stored' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  // The IP hashes only need a key that stays private and stable for an hour;
  // the connection string already is one, so there's no extra secret to set.
  return handleSubmission(request, { db, secret: databaseUrl });
}
