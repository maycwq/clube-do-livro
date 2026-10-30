import { mkdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Db } from './store.js';

const schemaUrl = new URL('../db/schema.sql', import.meta.url);

/**
 * Postgres compiled to WebAssembly, for local development and tests: the
 * same SQL as production without installing or signing up for anything.
 * With no directory (or "memory://") the database lives in memory.
 */
export async function createLocalDb(dataDir?: string): Promise<Db & { close(): Promise<void> }> {
  if (dataDir && !dataDir.includes('://')) await mkdir(dataDir, { recursive: true });
  const pg = await PGlite.create(dataDir);
  await pg.exec(await readFile(schemaUrl, 'utf8'));
  return {
    async query<Row>(text: string, params?: unknown[]) {
      const result = await pg.query<Row>(text, params);
      return result.rows;
    },
    close: () => pg.close(),
  };
}
