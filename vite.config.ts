/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import { handleSubmission } from './server/handler.js';
import type { Db } from './server/store.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      localApi(env.DATABASE_URL, env.LOCAL_DB_DIR ?? '.data/pglite', Number(env.LOCAL_RATE_LIMIT) || undefined),
      cleanUrls(),
      shareMetadata(siteUrl(env)),
      privacyGate(env.ALLOW_PENDING_PRIVACY === '1'),
    ],
    build: {
      target: 'es2022',
      rollupOptions: { input: { main: 'index.html', privacidade: 'privacidade.html' } },
    },
    test: { include: ['**/*.test.ts'], exclude: ['node_modules', 'e2e'] },
  };
});

/**
 * Serves /api/responses during `npm run dev` with the same handler the
 * Vercel Function uses. Without DATABASE_URL the answers go to a local
 * Postgres (PGlite) in .data/ (or LOCAL_DB_DIR; "memory://" keeps nothing),
 * so the form works with no account at all. LOCAL_RATE_LIMIT raises the
 * per-client limit, for test runs that send everything from one address.
 * GET /api/responses lists what was stored; it exists only here, never in
 * the deployed app.
 */
function localApi(databaseUrl: string | undefined, localDbDir: string, rateLimit: number | undefined): Plugin {
  let db: Promise<Db> | undefined;
  const openDb = () =>
    (db ??= databaseUrl
      ? import('./server/neon-db.js').then(({ createNeonDb }) => createNeonDb(databaseUrl))
      : import('./server/local-db.js').then(({ createLocalDb }) => createLocalDb(localDbDir)));

  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      // Opened right away, so the first answer doesn't wait for the database.
      openDb().catch((error) => server.config.logger.error(String(error)));
      server.middlewares.use('/api/responses', async (req, res) => {
        try {
          const database = await openDb();
          if (req.method === 'GET') {
            const [responses, changeRequests] = await Promise.all([
              database.query('select * from responses order by id'),
              database.query('select * from change_requests order by id'),
            ]);
            return send(res, Response.json({ responses, changeRequests }));
          }
          const response = await handleSubmission(await toRequest(req), { db: database, secret: 'local', rateLimit });
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

/** /privacidade serves privacidade.html locally, as cleanUrls does on Vercel. */
function cleanUrls(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url === '/privacidade' || req.url?.startsWith('/privacidade?')) {
      req.url = req.url.replace('/privacidade', '/privacidade.html');
    }
    next();
  };
  return {
    name: 'clean-urls',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

/**
 * Link previews need absolute addresses. SITE_URL wins; on Vercel the
 * production domain comes in VERCEL_PROJECT_PRODUCTION_URL, even for
 * preview builds, so previews of any deployment point to production.
 */
function siteUrl(env: Record<string, string>): string {
  const url = env.SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return url.replace(/\/+$/, '');
}

function shareMetadata(url: string): Plugin {
  return {
    name: 'share-metadata',
    configResolved(config) {
      if (config.command === 'build' && !url) {
        config.logger.warn('SITE_URL is not set: link previews will use relative addresses, which apps ignore.');
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        url
          ? html.replaceAll('%SITE_URL%', url)
          : // Without a domain there's no address to point to: drop the tags
            // that need one and leave the image path relative (fine locally).
            html
              .replace(/\s*<(link rel="canonical"|meta property="og:url")[^>]*%SITE_URL%[^>]*>/g, '')
              .replaceAll('%SITE_URL%', ''),
    },
  };
}

/**
 * The privacy notice has items only the organizers can fill in (marked with
 * data-pending). A production build stops while any is left, so the form
 * can't be published without them. ALLOW_PENDING_PRIVACY=1 lets a private
 * preview through; the items then show as visibly pending.
 */
function privacyGate(allowPending: boolean): Plugin {
  return {
    name: 'privacy-gate',
    apply: 'build',
    transformIndexHtml(html, context) {
      const pending = [...html.matchAll(/<mark[^>]*data-pending[^>]*>([^<]*)<\/mark>/g)].map((match) => match[1]);
      if (pending.length === 0 || allowPending) return html;
      throw new Error(
        `${context.filename} still has pending information: ${pending.join(', ')}. ` +
          'Fill it in before publishing (README: before publishing), or set ALLOW_PENDING_PRIVACY=1 for a private preview.',
      );
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
