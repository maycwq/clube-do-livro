import '@fontsource-variable/fraunces/full.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/light.css';
import './styles/layout.css';
import './styles/notice.css';

// Coming from the form, "voltar pro formulário" goes back in history, so the
// answers already filled in are still there. Opened from anywhere else, it's
// a plain link to the form.
const back = document.querySelector<HTMLAnchorElement>('[data-back]');
back?.addEventListener('click', (event) => {
  const fromForm = document.referrer !== '' && new URL(document.referrer).origin === location.origin;
  if (fromForm && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});
