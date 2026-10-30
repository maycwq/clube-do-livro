import { neon } from '@neondatabase/serverless';
import type { Db } from './store.js';

/** Neon over HTTP: one round trip per query, no connection to keep open. */
export function createNeonDb(databaseUrl: string): Db {
  const sql = neon(databaseUrl);
  return {
    query: async <Row>(text: string, params?: unknown[]) => (await sql.query(text, params)) as Row[],
  };
}
