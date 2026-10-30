// Applies db/schema.sql to the database in DATABASE_URL (read from the
// environment or .env.local). The schema is idempotent, so running it again
// is harmless. The same file can be pasted into Neon's SQL Editor instead.

import { readFile } from 'node:fs/promises';
import { Pool } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (in the environment or in .env.local) first.');
  process.exit(1);
}

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const pool = new Pool({ connectionString: url });
try {
  await pool.query(schema);
  console.log(`Schema applied to ${new URL(url).host}`);
} finally {
  await pool.end();
}
