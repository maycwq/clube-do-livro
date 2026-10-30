# quem anima

The interest form for a book club that should start in 2027, with monthly meetings in person in Ipatinga, MG, and maybe online meetings later on.

At this stage the club only wants to know who would join and how to reach them once the details are settled. **It isn't an enrollment.** The form asks two single-choice questions (interest in the club, and whether the person could join in person, online or both), a name or nickname, a WhatsApp number, and offers a separate, optional invitation to test a digital experience related to the club.

> **status:** working end to end. The page reproduces the approved Figma screens on mobile and desktop, validates the answers, stores them in Postgres and confirms only after they're saved. It's ready to deploy on Vercel with a Neon database; it hasn't been deployed yet (see [deploy](#deploy-on-vercel)).

## design source

The Figma file is the source for interface, copy, hierarchy, responsive behavior and states:

- [clube do livro · alta fidelidade](https://www.figma.com/design/bPIkvsOd4llum9EBLyl2Zg/clube-do-livro?node-id=3233-11): form and confirmation at 390 and 1440, responsive proofs at 320 and 768, components, states and behavior notes;
- [comunidade](https://www.figma.com/design/L095OwMoiSvr0R0tRDLyTH/comunidade?node-id=1409-47): the visual library the screens draw from.

The interface copy is Brazilian Portuguese and is kept exactly as approved, lowercase and without emoji. Decisions taken where the file is silent, ambiguous or contradicts itself are in [docs/product-decisions.md](docs/product-decisions.md), together with what is still open.

## how it works

One static page and one serverless function.

- **The page** is plain HTML, CSS and a small TypeScript module, built with Vite. The form is a native form: radio groups with `required` under a `fieldset` and `legend`, labelled inputs, a real checkbox and a submit button. The script validates on submit, shows errors next to each field, sends the answers as JSON and swaps the form for the confirmation once the server says they were stored. Without a successful answer the form stays as it was, with a message and the button ready to try again.
- **The function** (`api/responses.ts`, `POST /api/responses`) validates the answers again with the same rules (`shared/interest.ts`), and writes them to Postgres. It answers `200` only after the write.
- **The database** is Postgres on [Neon](https://neon.tech): one table for responses, one with the consent texts, one for short-lived rate limiting (`db/schema.sql`).

Locally the same handler runs inside the Vite dev server, against [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) in `.data/`, so the whole flow works without any account or service.

### what is stored

| column | content |
| --- | --- |
| `name` | name or nickname, trimmed, up to 80 characters |
| `whatsapp` | the number in E.164 (`+5531999999999`); unique |
| `interest` | `sim`, `talvez` or `acompanhar` |
| `format` | `presencial`, `online`, `os-dois` or `nao-sei` |
| `test_invite` | `true` only if the optional checkbox was ticked; `false` by default |
| `consent_version` | which wording the person saw next to the button (see `consent_texts`) |
| `consented_at` | when they last sent the form |
| `created_at`, `updated_at` | first and last time the number was sent |

Nothing else: no IP address, no user agent, no cookies, no analytics, no third-party requests (fonts are self-hosted). Sending the form again with the same number updates that row instead of adding another one.

`consent_texts` keeps the exact sentences shown at the time: the contact consent ("ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube…"), the privacy note and the test invitation. A test (`shared/copy.test.ts`) fails if the page copy changes without a new version.

### abuse and duplicates

- The answers are validated on the server with the same rules as the page; anything else is rejected.
- Requests must be JSON, at most 4 KB, from the same origin.
- A hidden field catches form-filling bots: they get a normal answer and nothing is stored.
- Each client can send 20 requests per 10 minutes. The limit is kept in `request_log` as a keyed hash of the IP (never the IP itself), and entries older than an hour are deleted on every request.
- The button can't send twice while a request is in flight, and a number already stored is updated, not duplicated, so retrying after a lost answer is safe.
- Errors are logged by code only. Names and numbers never reach logs, URLs or the browser history.

## development

Requires Node 22.12+ (or 24).

```sh
npm install
npm run dev        # http://localhost:5173, with the API on a local PGlite database
npm run build      # typecheck + production build into dist/
npm test           # unit and API tests (Vitest, against PGlite)
npm run test:e2e   # browser tests (Playwright) on mobile and desktop
npm run typecheck
```

`npm run dev` and `npm run build` first download Satoshi from Fontshare (see [fonts](#fonts)), so the first run needs internet access. `npm run test:e2e` needs a Chromium for Playwright (`npx playwright install chromium` once).

During `npm run dev`, `GET /api/responses` lists what was stored locally. It exists only in the dev server; the deployed function answers `POST` only. To start from an empty local database, delete `.data/`. To develop against a Neon branch instead, put its `DATABASE_URL` in `.env.local`.

### structure

```
index.html                 the page: form and confirmation, both in the markup
src/
  main.ts                  entry: fonts, styles, form setup
  form.ts                  validation display, sending, confirmation
  styles/
    tokens.css             Figma variables and the values the frames use directly
    fonts.css, base.css
    layout.css             compact and wide compositions, light masses, sticky panel
    form.css               questions, options, checkbox, fields, button, statuses
    confirmation.css
  assets/
    light/                 light masses, exported from the Figma file
    icons/                 radio and the PikaIcons check, exported from the Figma file
shared/interest.ts         fields, options, normalization and validation (page and API)
server/
  handler.ts               the API: checks, rate limit, validation, storage
  store.ts                 SQL
  neon-db.ts, local-db.ts  Neon over HTTP in production, PGlite locally and in tests
api/responses.ts           the Vercel Function
db/schema.sql              tables and consent texts (idempotent)
e2e/                       Playwright tests
scripts/                   Satoshi download, schema migration
```

### layout

Two compositions, following the frames:

- **compact**, up to 1199 px: a single column, at most 390 px wide and centered, as in the 390 and 768 frames. Below 360 px the sizes come from the 320 frame; between 320 and 390 type scales linearly between the two. From 640 px the page gets the 768 frame's space at the top.
- **wide**, from 1200 px: the editorial panel next to the form, as in the 1440 frames. The panel is sticky. Between 1200 and 1440 px the outer margin and the gap shrink linearly; above 1440 the composition stays centered.

The light masses are the SVG groups exported from the file, blur included, positioned as in the frames. They drift a few pixels (up to 8 on desktop, 4 on mobile) over 14 seconds, and stay still under `prefers-reduced-motion`.

### fonts

- **Fraunces** (SIL Open Font License) comes from `@fontsource-variable/fraunces` with all its axes, since the file sets `SOFT 0` and `WONK 1`.
- **Satoshi** (ITF Free Font License, [Fontshare](https://www.fontshare.com/fonts/satoshi)) can be self-hosted on our own site but not redistributed through a repository, so it isn't committed. `scripts/fetch-satoshi.mjs` downloads the official package before `dev` and `build` and extracts the three `.woff2` files used (Regular, Medium, Bold) into `src/assets/fonts/satoshi/`, unmodified. The build serves them from our domain.

## deploy on Vercel

The page is static and the API is one Vercel Function; the database is Neon, which Vercel offers as a native integration.

1. **Import the repository** in Vercel (Add New → Project). It detects Vite, `npm run build` and `dist`; nothing needs overriding.
2. **Add the database**: Storage → Create Database → Neon (or connect an existing Neon project). Choose the **São Paulo (aws-sa-east-1)** region, to keep the data close to the function (`vercel.json` pins functions to `gru1`, São Paulo). The integration adds `DATABASE_URL` to the project. Keep it on **Production** only, or let the integration create a branch per preview: preview deployments shouldn't write to the real list.
3. **Create the tables** once: open the database in Neon's console, SQL Editor, paste `db/schema.sql` and run it. Or, from a machine with the connection string in `.env.local`, run `npm run db:migrate`.
4. **Deploy** and send one test answer from the published page. Check it under Tables → `responses`, then delete it (see below).

There's no other variable or secret. The rate-limit hash is keyed with `DATABASE_URL`, which is already private.

`vercel.json` also sets the security headers (a strict Content-Security-Policy that allows only the site itself, `Referrer-Policy: no-referrer`, `X-Content-Type-Options`, `Permissions-Policy`) and long caching for hashed assets.

## accessing the responses

The responses live only in the Neon project. Whoever has access to it sees them; nobody else does, and there's no admin page to protect. Keep the Neon (and Vercel) accounts with two-factor authentication, and add people to the Neon project only if they need the list.

In Neon's console: **Tables → `responses`** shows every row and lets you edit or delete one. For lists and exports, use the **SQL Editor** (results can be downloaded as CSV):

```sql
-- everyone, newest first
select name, whatsapp, interest, format, test_invite, updated_at
from responses
order by updated_at desc;

-- people who want to test the digital experience
select name, whatsapp from responses where test_invite;

-- how many in each answer
select interest, format, count(*) from responses group by 1, 2 order by 1, 2;
```

An exported CSV carries everyone's numbers: keep it off shared folders and delete it when done.

**When someone asks to stop being contacted or to be removed**, delete their row; nothing else about them is kept:

```sql
delete from responses where whatsapp = '+5531999999999';
```

**When someone only wants to stop hearing about the digital test**:

```sql
update responses set test_invite = false, updated_at = now() where whatsapp = '+5531999999999';
```

Numbers are stored as `+55` followed by area code and number, digits only.

## tests

- `npm test` (Vitest): phone and name normalization, validation rules, and the API handler against a real Postgres (PGlite): storage, updates by number, consent record, 400/403/405/413/415/422/429/503 answers, the hidden field, rate limiting, hash retention, and that a database failure logs no personal data. It also checks that the consent texts in the database match the page copy.
- `npm run test:e2e` (Playwright, on a Pixel 7 profile and a 1440 × 900 desktop): empty and invalid submissions, errors clearing as fields are fixed, storage of valid answers, the test invite stored independently of the club answers, network and server failures keeping everything filled in, retrying, the sending state and double clicks, the whole flow by keyboard, reduced motion, and no personal data in the address bar.
