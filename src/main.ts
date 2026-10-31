import '@fontsource-variable/fraunces/full.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/light.css';
import './styles/layout.css';
import './styles/form.css';
import './styles/confirmation.css';
import './styles/motion.css';
import { setupInterestForm } from './form.js';
import { setupLight } from './light.js';
import { setupPanel } from './panel.js';

setupInterestForm(document);
setupPanel(document);
setupLight(document);
