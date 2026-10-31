# quem anima

The interest form for a book club that should start in 2027, with monthly meetings in person in Ipatinga, MG, and maybe online meetings later on.

At this stage the club only wants to know who would join and how to reach them once the details are settled. **It isn't an enrollment.** The form asks two single-choice questions (interest in the club, and whether the person could join in person, online or both), a name or nickname, a WhatsApp number, and offers a separate, optional invitation to test a digital experience related to the club.

> **status:** working end to end and ready to deploy; not collecting answers yet. The page reproduces the approved Figma screens on mobile and desktop, validates the answers, stores them in Postgres and confirms only after they're recorded. Two items of the privacy notice still depend on the organizers, and answers should only be collected once they're filled in (see [before collecting answers](#before-collecting-answers)).

## design source

The Figma file is the source for interface, copy, hierarchy, responsive behavior and states:

- [clube do livro · alta fidelidade]: form and confirmation at 390 and 1440, responsive proofs at 320 and 768, components, states and behavior notes;
- [comunidade]: the visual library the screens draw from.

The interface copy is Brazilian Portuguese, lowercase and without emoji. Decisions taken where the file is silent, ambiguous or contradicts itself, and the few places where the implementation departs from it for accessibility, are in [docs/product-decisions.md](docs/product-decisions.md), together with what is still open.

## how it works

Two static pages and one serverless function.

- **The form** (`index.html`) is plain HTML, CSS and a small TypeScript module, built with Vite. It's a native form: radio groups with `required` under a `fieldset` and `legend`, labelled inputs, a real checkbox and a submit button. The script points out problems next to each field as soon as they're certain (see `docs/product-decisions.md`, behavior), checks everything again on submit, sends the answers as JSON and swaps the form for the confirmation once the server says they were recorded. Otherwise the form stays as it was, with a message that says what is known about the failure and the button ready to try again.
- **The privacy notice** (`privacidade.html`, served at `/privacidade`) explains, in a few short lines, who organizes the club, why the form asks for a name and a WhatsApp, how the test invite works, how long answers are kept and how to stop, correct or delete. The form links to it under the button.
- **The function** (`api/responses.ts`, `POST /api/responses`) validates the answers again with the same rules (`shared/interest.ts`) and records them in Postgres. It answers `200` only after the write.
- **The database** is Postgres on [Neon](https://neon.tech) (`db/schema.sql`).

Locally the same handler runs inside the Vite dev server, against [PGlite](https://pglite.dev) (Postgres compiled to WebAssembly) in `.data/`, so the whole flow works without any account or service.

### what is stored

`responses` has one row per WhatsApp number, as first sent:

| column | content |
| --- | --- |
| `name` | name or nickname, trimmed, up to 80 characters |
| `whatsapp` | the number in E.164 (`+5531999999999`); unique |
| `interest` | `sim`, `talvez` or `acompanhar` |
| `format` | `presencial`, `online`, `os-dois` or `nao-sei` |
| `test_invite` | `true` only if the optional checkbox was ticked; `false` by default |
| `consent_version` | which texts the person saw (see `consent_texts`) |
| `consented_at` | when they sent the form |
| `submission_id` | a random id the page creates for each set of answers, so a retry isn't recorded twice |
| `created_at`, `updated_at` | when the row was created and last changed by the organizers |

Nothing else: no IP address, no user agent, no cookies, no analytics, no third-party requests (fonts are self-hosted).

`consent_texts` keeps the exact wording each version showed: the contact consent ("ao enviar, você deixa a gente te chamar pelo WhatsApp sobre o clube…"), the privacy line under the button, the test invitation and the whole privacy notice. A test (`shared/copy.test.ts`) fails if the page or the notice change without the stored wording changing with them.

### numbers already here

Typing a number doesn't prove it's yours, so sending the form with a number that is already stored **never changes the stored row**. What happens instead:

- **different answers** go to `change_requests`, next to the original, until the organizers confirm them with that WhatsApp (see [change requests](#change-requests));
- **the same answers** add nothing;
- **the same submission arriving twice** (a retry after a lost answer) is recorded once, thanks to its `submission_id`.

The page shows the same confirmation in every case, and the API gives the same answer, so nobody can find out whether a number is stored. The confirmation only says what really happened in all of them: the answers were noted, and "também anotamos seu interesse em testar a experiência digital" appears only when the checkbox was ticked, because that choice is recorded either in the new row or in the change request.

### failures

The API says what it knows, and the page says it in the same voice as the rest:

| situation | API | page |
| --- | --- | --- |
| the database refused the write, or was unreachable before it | `503 not_stored` | "não conseguimos guardar sua resposta." |
| no answer from the page's point of view: offline, timeout, dropped connection, gateway error, or the database stopped answering during the write | `504 unconfirmed` (or nothing) | "não conseguimos confirmar o envio." |
| too many attempts from the same address | `429` with `Retry-After` | "muitas tentativas por aqui."; the page doesn't send again before that time |
| anything else | `4xx` | "não deu pra enviar agora." |

Retrying is safe in every case: the same answers keep the same `submission_id`.

### abuse and limits

- The answers are validated on the server with the same rules as the page; anything else is rejected.
- Requests must be JSON, at most 4 KB, from the same origin.
- A hidden field catches form-filling bots: they get a normal answer and nothing is stored.
- Each client can send 20 requests per 10 minutes. The limit is kept in `request_log` as a keyed hash of the IP (never the IP itself), and entries older than an hour are deleted on every request.
- The button can't send twice while a request is in flight.
- Errors are logged by code only. Names and numbers never reach logs, URLs or the browser history.

## development

Requires Node 22.12+ (or 24).

```sh
npm install
npm run dev        # http://localhost:5173, with the API on a local PGlite database
npm test           # unit and API tests (Vitest, against PGlite)
npm run test:e2e   # browser tests (Playwright) on mobile and desktop
npm run typecheck
npm run build      # typecheck + production build into dist/
npm run og         # regenerates public/og.jpg, the link preview image
```

`npm run dev` and `npm run build` first download Satoshi from Fontshare (see [fonts](#fonts)), so the first run needs internet access. `npm run test:e2e` needs a Chromium for Playwright (`npx playwright install chromium` once).

During `npm run dev`, `GET /api/responses` lists what was stored locally (responses and change requests). It exists only in the dev server; the deployed function answers `POST` only. To start from an empty local database, delete `.data/`. To develop against a Neon branch instead, put its `DATABASE_URL` in `.env.local`. `LOCAL_RATE_LIMIT` raises the per-client limit of the local server; the browser tests use it, since every request comes from the same address.

### structure

```
index.html                 the form and the confirmation, both in the markup
privacidade.html           "como usamos seus dados"
src/
  main.ts, privacy.ts      entries of the two pages
  form.ts                  validation display, sending, failures, confirmation
  panel.ts                 whether the desktop panel fits the window, to stick
  messages.ts              the copy the script shows: field errors, sending, failures
  styles/
    tokens.css             Figma variables and the values the frames use directly
    fonts.css, base.css
    layout.css             compact and wide compositions, the desktop panel
    light.css              light masses: layers, motion, color
    form.css               questions, options, checkbox, fields, button, statuses
    confirmation.css, notice.css
  assets/
    light/layers/          light masses from the Figma file, one blurred SVG per shape
    light/atmosphere-form.svg  the desktop group whole, for the link preview image
    icons/                 radio and the PikaIcons check, exported from the Figma file
public/og.jpg              link preview image
shared/interest.ts         fields, options, normalization and validation (page and API)
server/
  handler.ts               the API: checks, rate limit, validation, storage, failures
  store.ts                 SQL
  neon-db.ts, local-db.ts  Neon over HTTP in production, PGlite locally and in tests
api/responses.ts           the Vercel Function
db/schema.sql              tables and consent texts (idempotent)
e2e/                       Playwright tests
scripts/                   Satoshi download, schema migration, preview image
```

### layout

Two compositions, following the frames:

- **compact**, up to 1199 px: a single column, at most 390 px wide and centered, as in the 390 and 768 frames. Below 360 px the sizes come from the 320 frame; between 320 and 390 type scales linearly between the two. From 640 px the page gets the 768 frame's space at the top.
- **wide**, from 1200 px: the editorial panel next to the form, as in the 1440 frames. Between 1200 and 1440 px the outer margin and the gap shrink linearly; above 1440 the composition stays centered.

The desktop panel follows the window's height too. From 1060 px it's the frame's 940 px, 60 px from the top. On shorter windows it takes the height of the window minus a margin (60 px, down to 24 px), and the headline and the space around the text scale with that height, from the frame's sizes at 900 px down to a floor at 640 px; the proposal, the context and the epilogue keep their size. It sticks next to the form only when it fits whole in the window (`panel.ts`); on windows too short even for its floor (below about 600 px) it scrolls with the page. It never scrolls on its own. The confirmation panel takes the same height.

The light masses are the Figma groups split into their shapes, one blurred SVG per layer, stacked as in the file; at rest they are the frame. Each layer moves on its own slow cycle (11 to 29 s): the source dims and opens a little away from the text, the bounce breathes, the reflection and the edge that hides the source drift. Now and then part of the light turns more golden, rosier or lilac (cycles of 43 to 83 s). Only `transform` and `opacity` change, the light never gets stronger than at rest, and under `prefers-reduced-motion` it stays still.

### fonts

- **Fraunces** (SIL Open Font License) comes from `@fontsource-variable/fraunces` with all its axes, since the file sets `SOFT 0` and `WONK 1`.
- **Satoshi** (ITF Free Font License, [Fontshare](https://www.fontshare.com/fonts/satoshi)) can be self-hosted on our own site but not redistributed through a repository, so it isn't committed. `scripts/fetch-satoshi.mjs` downloads the official package before `dev` and `build` and extracts the three `.woff2` files used (Regular, Medium, Bold) into `src/assets/fonts/satoshi/`, unmodified. The build serves them from our domain. `public/og.jpg` is an image rendered with both, which the licenses allow.

## before collecting answers

The privacy notice has two items only the organizers can provide. In `privacidade.html` they are marked `<mark class="pending" data-pending>` and show as visibly pending, never as real information:

- `[IDENTIFICAÇÃO DOS RESPONSÁVEIS]`: who organizes the club and answers for the data;
- `[CANAL DE CONTATO PARA PRIVACIDADE]`: where to ask to stop, correct or delete before the club has messaged anyone (an e-mail or a number).

They don't stop the build: the site can be deployed and reviewed with them pending. Answers should only be collected once both are filled in, so connect the database (which is what turns collection on) and share the link only after that.

To fill them in:

1. Replace each `<mark …>[…]</mark>` in `privacidade.html` with the final text.
2. Run `npm test`. `shared/copy.test.ts` fails and prints the notice as it now reads; paste it as the `notice` of version `v2` in `db/schema.sql`. Version `v2` can still be corrected because nobody has seen it yet; once the form is public, any change to the texts needs a new version (`v3` in `db/schema.sql`, `shared/interest.ts` and `data-consent-version` in `index.html`).
3. If the database was created before this, run `db/schema.sql` again: it updates the wording of a version only while no response points to it.

## deploy on Vercel

The pages are static and the API is one Vercel Function; the database is Neon, which Vercel offers as a native integration. Nothing here needs a paid plan.

1. **Import the repository** in Vercel (Add New → Project), with `main` as the production branch. `vercel.json` sets the Vite preset, `npm run build` and `dist`, so whatever the project settings say, the build is the same.
2. **Fill in the privacy notice** (above) before going further: the next step turns collection on.
3. **Add the database**: Storage → Create Database → Neon (or connect an existing Neon project), in the **São Paulo (aws-sa-east-1)** region, next to the function (`vercel.json` pins functions to `gru1`). The integration adds `DATABASE_URL`. Keep it on **Production** only: preview deployments shouldn't write to the real list, and a Neon branch made for a preview starts as a copy of everyone's answers.
4. **Create the tables** once: in Neon's console, SQL Editor, paste `db/schema.sql` and run it. Or, from a machine with the connection string in `.env.local`, run `npm run db:migrate`.
5. **Deploy** and send one test answer from the published page. Check it under Tables → `responses`, then delete it (see below).
6. **Check the link preview** by sending the address in a WhatsApp chat (or with the sharing debuggers of Facebook and LinkedIn). Previews use absolute addresses: on Vercel they come from the project's production domain (`VERCEL_PROJECT_PRODUCTION_URL`); set `SITE_URL` (for example `https://clube.example`) to use another one. Apps cache previews, so check before sharing the link widely.

There's no other variable or secret. The rate-limit hash is keyed with `DATABASE_URL`, which is already private.

`vercel.json` also turns on clean URLs (`/privacidade`) and sets the security headers (a strict Content-Security-Policy that allows only the site itself, `Referrer-Policy: same-origin`, `X-Content-Type-Options`, `Permissions-Policy`) and long caching for hashed assets.

## accessing the responses

The responses live only in the Neon project. Whoever has access to it sees them; nobody else does, and there's no admin page to protect. Keep the Neon (and Vercel) accounts with two-factor authentication, and add people to the Neon project only if they need the list.

In Neon's console: **Tables → `responses`** shows every row. For lists and exports, use the **SQL Editor** (results can be downloaded as CSV):

```sql
-- everyone, newest first
select name, whatsapp, interest, format, test_invite, created_at
from responses
order by created_at desc;

-- people who want to test the digital experience
select name, whatsapp from responses where test_invite;

-- how many in each answer
select interest, format, count(*) from responses group by 1, 2 order by 1, 2;
```

Numbers are stored as `+55` followed by area code and number, digits only.

### change requests

Answers sent again with different content for a number already stored wait here:

```sql
select c.id, c.created_at, r.whatsapp,
       r.name as stored_name, c.name as new_name,
       r.interest as stored_interest, c.interest as new_interest,
       r.format as stored_format, c.format as new_format,
       r.test_invite as stored_test_invite, c.test_invite as new_test_invite
from change_requests c join responses r using (whatsapp)
order by c.created_at;
```

Ask that WhatsApp number whether the change is theirs. If it is, apply it (replace `123` with the request's `id`):

```sql
with applied as (delete from change_requests where id = 123 returning *)
update responses r
set name = a.name, interest = a.interest, format = a.format, test_invite = a.test_invite,
    consent_version = a.consent_version, consented_at = a.created_at, updated_at = now()
from applied a
where r.whatsapp = a.whatsapp;
```

If it isn't, or nobody answers, discard it: `delete from change_requests where id = 123;`. Requests hold whatever someone typed, so don't keep them longer than it takes to check.

### requests from people

Before acting on a request, confirm it came from the number in question: answer through that WhatsApp, or ask the person to write from it.

- **Stop the contact or delete everything**: delete the row. Its change requests go with it.

  ```sql
  delete from responses where whatsapp = '+5531999999999';
  ```

- **Correct something**: edit the row in Tables → `responses`, and set `updated_at` to now.
- **Stop only the digital test invitation**:

  ```sql
  update responses set test_invite = false, updated_at = now() where whatsapp = '+5531999999999';
  ```

- **Know what is kept**: run `select * from responses where whatsapp = '+5531999999999';` (and the same on `change_requests`) and send the person the result.

Then take care of the copies:

- **Exports.** A CSV carries everyone's numbers. Keep exports off shared folders, delete them when done, and when someone asks to be removed, delete or edit any export that still exists.
- **Neon history.** Neon can restore the database to a point in the recent past (the restore window set in the project). A deleted row disappears from that history when the window passes. If the database is ever restored, delete again whatever was deleted after the restore point.
- **Branches.** A Neon branch is a full copy of the data at the time it was created. Don't keep branches of the production database; if one exists, delete it or delete the person there too.

## tests

- `npm test` (Vitest): phone and name normalization, validation rules with the reason for each error (accepted and refused names in several alphabets, Brazilian number formats, letters and symbols in a number, what is already certain while typing), and the API handler against a real Postgres (PGlite): storage; stored answers never overwritten by a later submission, including someone else's test invite turned on or off; the same answer whatever was recorded; identical answers and retries recorded once; concurrent submissions for a new number; change requests deleted with their response; 400/403/405/413/415/422/429 answers; `not_stored` and `unconfirmed` failures; the hidden field; rate limiting and hash retention; no personal data in logs. It also checks that the texts stored for the current consent version match the form and the privacy notice.
- `npm run test:e2e` (Playwright, on a Pixel 7 profile and a 1440 × 900 desktop): nothing flagged while a valid number and name are typed key by key, or when passing through fields and choices; letters and a digit too many flagged while typing, with the value kept; incomplete and emptied fields flagged when left; a real clipboard paste; editing in the middle of a number with the cursor kept; errors going away as soon as they're fixed and not coming back early while re-editing; a name over 80 characters kept whole and explained; long numbers as names; choices questioned only on submit; the optional test invite; empty, whitespace-only and malformed fields on submit, with focus on the first one and the answers kept; each message announced once, not at every key; names stored as typed; storage and confirmation; the test invite stored on its own; the sending state for sighted and screen reader users and double clicks; each kind of failure, including an answer lost after the write and a 429 that is respected; numbers already stored; the privacy notice and coming back to the form with the answers kept; the whole flow by keyboard; axe (WCAG 2.2 A and AA) on the form, its errors, a failure, the confirmation and the notice; contrast of field borders, the button and every text over the light masses (form, confirmation and notice) at rest and at the extremes of each layer's cycle, on a tall and a short window; the light moving only through transform and opacity, and not at all with reduced motion; the four reference widths; the desktop panel whole and in view from top to end at six window sizes, with no scroll of its own, scrolling with the page when the window is too short, and the confirmation's closing line inside its panel; and the link preview metadata and image.
