# product decisions

Decisions taken during implementation that complement the Figma file. The file and its notes stay the main source; this covers what they leave open or contradict, so it doesn't have to be settled again.

When an open point is decided, move it to the decided list. When a decision changes, edit it here instead of keeping the old version.

## decided

### copy

- **Field errors say what to do about what's there.** Unanswered questions: "escolha uma das opções." (the file has a red-border error state for options but no message; a border alone doesn't say what's wrong). Empty name, or only spaces: "informe como a gente pode te chamar.". Empty WhatsApp: "informe seu WhatsApp com DDD."; something typed that isn't a number we can use: "confira o DDD e o número do WhatsApp.". A name over 80 characters gets "use até 80 caracteres no nome ou apelido.", which only shows if the field's own limit is bypassed. All of them sit under their field, in the style of the file's field errors.
- **While sending, only the button changes.** It says "enviando..."; screen readers hear "enviando sua resposta...". The states frame shows "a resposta está sendo processada. evite enviar novamente." under the button; it's not shown, since the page itself prevents a second send.
- **Failures say only what is known.** "não conseguimos guardar sua resposta." when the server reports that nothing was written; "não conseguimos confirmar o envio." when there's no answer or the server can't tell (offline, timeout, dropped connection); "muitas tentativas por aqui." after a 429; "não deu pra enviar agora." for anything else. Each comes with its short line of what to do. None mentions codes, services or the database.
- **The failure message sits under the button**, where the person just tapped, before the privacy line. Focus stays on the button, so trying again is one tap or Enter away; screen readers hear the message as an alert. It goes away when the form is sent again, and is announced again if the same failure repeats.
- **The privacy line is "a gente usa seus dados só pra organizar o clube e entrar em contato sobre ele."**, followed by the link "como usamos seus dados", underlined in the same size and color. It fits the space the frame's line had, so nothing below moves at 390 and 1440; at 320 it takes one more line (9 px).
- **The opt-in confirmation also appears on desktop.** The mobile confirmation has "também anotamos seu interesse em testar a experiência digital." (shown only with the opt-in); the desktop frame has no equivalent. It goes under the status line in the right column, with the same box as on mobile.
- **Copy that differs between breakpoints stays different**: "anotado!" on mobile and "anotado." on desktop, "2027 / em construção" vs "clube do livro / 2027", the desktop-only "um convite primeiro. as inscrições ficam pra depois.", and the headline line breaks of each frame.
- **Browser title "clube do livro"; link previews use the headline, the proposal and an image** made from the desktop panel: the purple surface, the light group from the file, the rubric, the headline in its five desktop lines and the epilogue. Nothing in it is new copy.

### behavior

- **Validation happens on submit**, as the file's note says. Nothing is flagged before that. Errors appear for every field at once and focus goes to the first one. After that, fixing a field clears its error right away; a field is checked again (and its message updated) only when the person leaves it or sends again. The error is the first thing read with the field, before its help text.
- **WhatsApp accepts what people actually type**: with or without punctuation, `+55`, `55` or a leading 0. The area code must exist. Mobile numbers have 9 digits starting with 9; 8-digit landlines (WhatsApp Business) are accepted too. When the field loses focus, a valid number is rewritten as in the placeholder, "(31) 98765-4321".
- **A number already stored is never overwritten by the form.** Typing a number doesn't prove it's yours, and there's no account to prove it with. Different answers for a stored number wait in `change_requests` until the organizers confirm them through that WhatsApp; the same answers add nothing; a retried submission is recorded once. Accounts or codes sent by WhatsApp would cost more than the problem, and the club will message every number anyway, which is the natural moment to confirm.
- **Nothing tells whether a number is already stored.** The API answer and the confirmation are the same in every case. The confirmation stays true in all of them: the answers were noted (as a row or as a request), and the test invite line appears only when the box was ticked, which is recorded either way.
- **The confirmation survives a reload.** Only "sent" and whether the test invite was ticked are kept in the history entry, never the answers. There's no way back to the form from the confirmation, since none is designed.
- **After a 429 the page waits** the time the server asked for (`Retry-After`), showing the same message if the person tries before that.
- **The test invite is independent.** It starts unchecked, doesn't depend on the club answers and is stored as its own column.
- **Sending needs JavaScript.** Without it the browser posts the form to the API, which refuses it; no answer is ever placed in the URL.

### layout

- **Compact up to 1199 px, wide from 1200 px.** Below 1200 the editorial panel and the form can't keep their proportions, so the page uses the centered 390 px column of the 768 frame. Between 1200 and 1440 the outer margin and gap shrink linearly; the panel keeps its 560 px.
- **The desktop panel keeps its 940 px and sticks.** On windows taller than the panel plus its margins it sticks 60 px from the top. On shorter ones (most laptops) it scrolls until its bottom edge is 60 px from the bottom of the window and sticks there, so the epilogue and the whole light are reachable; shrinking the panel would push the light under the text.
- **The desktop confirmation panel keeps its 780 px.** The mobile confirmation fills the screen, with "a gente se fala." and the signature at the bottom, as in the 390 × 844 frame.
- **The light masses aren't cut at the column edge.** In the 768 frame the light ends sharply at the edge of the 390 px column (top and right). On the page it continues into the margin, as it does at the edge of a phone screen.
- **At 320, sizes and the extra space under text come from the 320 frame; some boxes don't.** The frame has artifacts of fixed-size boxes that aren't reproduced: the year sits 22 px away from the right edge, the third option is 98 px tall while the others are 77 px, two-line labels sit off-center in their rows, and the divider runs to the edge of the screen. Here the year aligns right, every option is 77 px with its label centered, and the divider keeps the margins. Everything below the first question sits about 20 px higher than in the frame.
- **The privacy notice is a page of its own** (`/privacidade`) in the form's type scale, with the opening light at the top: a column of 390 px on compact screens and 650 px on wide ones. It can be linked directly in a message. Coming from the form, "voltar pro formulário" returns through history, so the answers already filled in are still there.
- **Hover isn't styled.** The file defines default, selected, focus and error states; options and the button only change the cursor.

### accessibility

Where the file falls short of WCAG 2.2 AA, the implementation moves as little as possible:

- **The desktop light sits 16 px lower than in the frame.** There, the bright edge of the light reaches the bottom of "comentar" at about 3:1. Lower, the proposal stays above 5:1 at rest and through the drift; the composition reads the same.
- **Field borders reach 3:1.** The frames use `#e8d8d4` (empty, 1.3:1) and `#c8b9b6` (filled, 1.8:1). They are now `#988c87` and `#887d78`: the same colors mixed with `olue/beige chalk/800`, so they stay warm and the filled state stays a step darker. The error border is `cores/marca/highlight` darkened just enough (`#eb6069`, 3.1:1).
- **The button label is 19 px at every width.** The 320 frame uses 16 px, which against the primary color (3.8:1) would need 4.5:1; at 19 px bold it counts as large text, for which 3:1 is enough. It still fits on one line at 320.
- **The checkbox keeps the file's focus state** (a thicker border). It's subtle, but visible, which is what AA asks.

### data and privacy

- **What is stored and why** is in the README: the answers, the number in E.164, the consent version and dates. No IP, user agent, cookies or analytics.
- **The consent record is the exact text shown**: the sentence next to the button, the privacy line, the test invite and the whole privacy notice, stored once per version in `consent_texts`; each response and change request points to its version. `v1` (the first wording) was never published; `v2` adds the notice. A version can be corrected while nothing points to it; after that, a change means a new version.
- **The form can't be published with the notice incomplete.** The production build stops while any pending item is left; a private preview can be forced with `ALLOW_PENDING_PRIVACY=1`, and the items then show as visibly pending, never as information.
- **Rate limiting keeps a keyed hash of the IP for at most an hour**, in a separate table never joined with the responses.
- **The responses are read in Neon's console.** No admin page: the list is small, Neon's table view and SQL editor cover reading, exporting, applying changes and deleting, and there's nothing new to secure.
- **Requests are confirmed through the number itself** before acting, and stopping contact means deleting the row (its change requests go with it). Dropping only the test invite is an update of that column. The README covers exports, Neon's restore window and branches.
- **Region: São Paulo** for the function and the database, as the notice says.

### fonts

- **Satoshi is downloaded at build time.** Its license allows self-hosting on our own site but not redistribution through a repository. The build fetches the official files from Fontshare and serves them from our domain; nothing goes to a third party at runtime.

### deploy

- **Prepared for Vercel and Neon, not deployed.** No Vercel or Neon account was available to this work, so no project, database or deployment was created. The README has the steps. The function was built with the Vercel CLI and checked locally.
- **Link previews use the production domain**, from `VERCEL_PROJECT_PRODUCTION_URL` or `SITE_URL`, even on preview deployments.

## still open

- **The three pending items of the privacy notice**: who organizes and answers for the data, the contact channel for privacy requests, and the retention criterion. The form can't be published without them.
- **Retention, proposed and not approved.** Review the list after the first round of messages and delete what isn't needed anymore (people who didn't want to go on, change requests already handled); use the end of 2027 as the first deadline to review whether keeping anything still makes sense; if the club doesn't go ahead, delete the list. Requests to delete are handled as they come, whatever the schedule. Once approved, this (in the organizers' words) replaces `[CRITÉRIO DE RETENÇÃO APROVADO]`.
