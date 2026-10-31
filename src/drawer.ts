// "como usamos seus dados" opens in a drawer over the form, which stays as
// it was behind it: answers, choices and scroll. It's a modal <dialog>, so
// the page behind is inert, Escape closes it and focus stays inside; focus
// starts on its title and goes back to the link when it closes.
//
// The address follows it: /privacidade while it's open, so the back button
// closes it and a link to /privacidade (served as the form, vercel.json)
// opens the form with it open.

const PATH = '/privacidade';

type DrawerState = { drawer?: true };

export function setupDrawer(document: Document): void {
  const drawer = document.querySelector<HTMLDialogElement>('#como-usamos');
  const title = document.querySelector<HTMLElement>('#como-usamos-titulo');
  const content = drawer?.querySelector<HTMLElement>('.drawer__content');
  if (!drawer || !title || !content) return;
  const links = document.querySelectorAll<HTMLAnchorElement>(`a[href="${PATH}"]`);
  const pageTitle = document.title;
  const homePath = location.pathname === PATH ? '/' : location.pathname;
  let opener: HTMLElement | null = null;
  // Whether opening added a history entry, so closing should go back to it.
  let pushed = false;

  for (const link of links) {
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      history.pushState({ ...stateOf(history.state), drawer: true }, '', PATH);
      pushed = true;
      open();
    });
  }

  drawer.querySelector('.drawer__close')!.addEventListener('click', requestClose);

  // Escape: closed the same way as the button, with its motion.
  drawer.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });

  // A click on the page around it (the backdrop) closes it; a drag that
  // starts inside, selecting text, doesn't.
  let pressedOutside = false;
  drawer.addEventListener('pointerdown', (event) => (pressedOutside = event.target === drawer));
  drawer.addEventListener('click', (event) => {
    if (event.target === drawer && pressedOutside) requestClose();
  });

  addEventListener('popstate', () => {
    const wanted = Boolean(stateOf(history.state).drawer);
    if (wanted && !drawer.open) {
      pushed = true;
      open();
    } else if (!wanted && drawer.open) {
      pushed = false;
      void close();
    }
  });

  if (location.pathname === PATH) open();

  function open() {
    if (drawer!.open) return;
    opener ??= links[0] ?? null;
    document.title = `${title!.textContent} · ${pageTitle}`;
    document.documentElement.setAttribute('data-drawer', '');
    drawer!.removeAttribute('data-closing');
    drawer!.showModal();
    content!.scrollTop = 0;
    title!.focus({ preventScroll: true });
  }

  function requestClose() {
    if (!drawer!.open || drawer!.hasAttribute('data-closing')) return;
    if (pushed) {
      // popstate closes it.
      history.back();
    } else {
      const { drawer: _open, ...rest } = stateOf(history.state);
      history.replaceState(Object.keys(rest).length > 0 ? rest : null, '', homePath);
      void close();
    }
  }

  async function close() {
    drawer!.setAttribute('data-closing', '');
    await Promise.all(drawer!.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    drawer!.close();
    drawer!.removeAttribute('data-closing');
    document.documentElement.removeAttribute('data-drawer');
    document.title = pageTitle;
    opener?.focus({ preventScroll: true });
  }
}

function stateOf(state: unknown): DrawerState & Record<string, unknown> {
  return typeof state === 'object' && state !== null ? (state as DrawerState & Record<string, unknown>) : {};
}
