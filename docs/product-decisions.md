# product decisions

Decisions taken during implementation that complement the Figma file. The file and its notes stay the main source; this covers what they leave open or contradict, so it doesn't have to be settled again.

When an open point is decided, move it to the decided list. When a decision changes, edit it here instead of keeping the old version.

## decided

### copy

- **Unanswered questions say "escolha uma das opções."** The file has an error state for the radio option (a red border) but no message. A border alone doesn't say what's wrong, so each group gets this line under its options, in the same style and position as the field errors ("informe seu WhatsApp com DDD.", "informe como a gente pode te chamar.").
- **The loading line is shown.** While sending, the button says "enviando..." and "a resposta está sendo processada. evite enviar novamente." appears under it, as in the states frame (`ajuda / loading`). Screen readers hear it as a status.
- **The failure message sits under the button**, where the person just tapped, before "o contato fica só com a gente…". Focus stays on the button, so trying again is one tap or Enter away; screen readers hear the message as an alert. It goes away when the form is sent again.
- **The opt-in confirmation also appears on desktop.** The mobile confirmation has "também anotamos seu interesse em testar a experiência digital." (shown only with the opt-in); the desktop frame has no equivalent. It goes under the status line in the right column, with the same box as on mobile.
- **Copy that differs between breakpoints stays different**: "anotado!" on mobile and "anotado." on desktop, "2027 / em construção" vs "clube do livro / 2027", the desktop-only "um convite primeiro. as inscrições ficam pra depois.", and the headline line breaks of each frame.
- **Browser title "clube do livro"; link previews use the headline and the proposal** ("a gente tá montando um clube do livro. vem?"). There's no preview image yet (see still open).

### behavior

- **Validation happens on submit**, as the file's note says. Errors appear for every field at once and focus goes to the first one. After that, fixing a field clears its error right away; a field is marked again only when the person leaves it or sends again.
- **WhatsApp accepts what people actually type**: with or without punctuation, `+55`, `55` or a leading 0. The area code must exist. Mobile numbers have 9 digits starting with 9; 8-digit landlines (WhatsApp Business) are accepted too. When the field loses focus, a valid number is rewritten as in the placeholder, "(31) 98765-4321". Anything else gets "informe seu WhatsApp com DDD.".
- **One answer per number.** Sending again with the same number replaces the answers and renews the consent date; the first date is kept. This also makes retries after a lost connection safe.
- **The confirmation survives a reload.** Only "sent" and whether the test invite was ticked are kept in the history entry, never the answers. There's no way back to the form from the confirmation, since none is designed.
- **The test invite is independent.** It starts unchecked, doesn't depend on the club answers and is stored as its own column.
- **Sending needs JavaScript.** Without it the browser posts the form to the API, which refuses it; no answer is ever placed in the URL.

### layout

- **Compact up to 1199 px, wide from 1200 px.** Below 1200 the editorial panel and the form can't keep their proportions, so the page uses the centered 390 px column of the 768 frame. Between 1200 and 1440 the outer margin and gap shrink linearly; the panel keeps its 560 px.
- **The desktop panel keeps its 940 px and sticks.** On windows taller than the panel plus its margins it sticks 60 px from the top. On shorter ones (most laptops) it scrolls until its bottom edge is 60 px from the bottom of the window and sticks there, so the epilogue and the whole light are reachable; shrinking the panel would push the light under the text.
- **The desktop confirmation panel keeps its 780 px.** The mobile confirmation fills the screen, with "a gente se fala." and the signature at the bottom, as in the 390 × 844 frame.
- **The light masses aren't cut at the column edge.** In the 768 frame the light ends sharply at the edge of the 390 px column (top and right). On the page it continues into the margin, as it does at the edge of a phone screen.
- **At 320, sizes and the extra space under text come from the 320 frame; some boxes don't.** The frame has artifacts of fixed-size boxes that aren't reproduced: the year sits 22 px away from the right edge, the third option is 98 px tall while the others are 77 px, two-line labels sit off-center in their rows, and the divider runs to the edge of the screen. Here the year aligns right, every option is 77 px with its label centered, and the divider keeps the margins. Everything below the first question sits about 20 px higher than in the frame.
- **Hover isn't styled.** The file defines default, selected, focus and error states; options and the button only change the cursor.

### data and privacy

- **What is stored and why** is in the README: the answers, the number in E.164, the consent version and dates. No IP, user agent, cookies or analytics.
- **The consent record is the exact text shown**, stored once per version in `consent_texts`, and each response points to it.
- **Rate limiting keeps a keyed hash of the IP for at most an hour**, in a separate table never joined with the responses.
- **The responses are read in Neon's console.** No admin page: the list is small, Neon's table view and SQL editor cover reading, exporting and deleting, and there's nothing new to secure.
- **Stopping contact means deleting the row.** There's no reason to keep a number after the person asks to stop. Dropping only the test invite is an update of that column.
- **Region: São Paulo** for the function and the database.

### fonts

- **Satoshi is downloaded at build time.** Its license allows self-hosting on our own site but not redistribution through a repository. The build fetches the official files from Fontshare and serves them from our domain; nothing goes to a third party at runtime.

### deploy

- **Prepared for Vercel and Neon, not deployed.** No Vercel or Neon account was available to this work, so no project, database or deployment was created. The README has the steps. The function was built with the Vercel CLI and checked locally.

## still open

- **Who is behind the form, and how to reach them before the first message.** LGPD (art. 9) asks for the controller's identity and a contact channel. "pra parar depois, é só avisar" works once the club has messaged someone, but before that the page gives no way to ask for removal. A line with a name and a contact (or a short privacy page) would close it; it's copy, so it's left for the design.
- **How long the list is kept.** Suggestion: after the first round of messages, delete the numbers of people who didn't want to go on, and the whole list if the club doesn't start.
- **Contrast in two places of the design.** On the desktop panel, the bottom of the word "comentar" sits over the light at about 3:1 (4.5:1 is the target for that size); the composition is exactly as in the file. The empty-field border (`#e8d8d4` on `#fbf9f4`) is about 1.3:1, under the 3:1 WCAG 1.4.11 asks for component boundaries; the label above and the placeholder inside still mark the field.
- **A preview image for WhatsApp links.** The form will mostly be shared in chats; without `og:image` the preview shows only text.
