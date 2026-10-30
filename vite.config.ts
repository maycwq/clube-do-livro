/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { handleSubmission } from './server/handler.js';
import type { Db } from './server/store.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [localApi(env.DATABASE_URL, env.LOCAL_DB_DIR ?? '.data/pglite')],
    build: { target: 'es2022' },
    test: { include: ['**/*.test.ts'], exclude: ['node_modules', 'e2e'] },
  };
});

/**
 * Serves /api/responses during `npm run dev` with the same handler the
 * Vercel Function uses. Without DATABASE_URL the answers go to a local
 * Postgres (PGlite) in .data/ (or LOCAL_DB_DIR; "memory://" keeps nothing),
 * so the form works with no account at all.
 * GET /api/responses lists what was stored; it exists only here, never in
 * the deployed app.
 */
function localApi(databaseUrl: string | undefined, localDbDir: string): Plugin {
  let db: Promise<Db> | undefined;
  const openDb = () =>
    (db ??= databaseUrl
      ? import('./server/neon-db.js').then(({ createNeonDb }) => createNeonDb(databaseUrl))
      : import('./server/local-db.js').then(({ createLocalDb }) => createLocalDb(localDbDir)));

  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/responses', async (req, res) => {
        try {
          const database = await openDb();
          if (req.method === 'GET') {
            const rows = await database.query('select * from responses order by updated_at desc');
            return send(res, Response.json(rows));
          }
          const response = await handleSubmission(await toRequest(req), { db: database, secret: 'local' });
          return send(res, response);
        } catch (error) {
          server.config.logger.error(String(error));
          res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  headers.set('x-real-ip', req.socket.remoteAddress ?? 'local');
  return new Request(`http://${req.headers.host}/api/responses`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
