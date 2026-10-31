import '@fontsource-variable/fraunces/full.css';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/light.css';
import './styles/layout.css';
import './styles/form.css';
import './styles/confirmation.css';
import './styles/drawer.css';
import './styles/motion.css';
import { setupDrawer } from './drawer.js';
import { setupInterestForm } from './form.js';
import { setupLight } from './light.js';
import { setupPanel } from './panel.js';

setupInterestForm(document);
setupDrawer(document);
setupPanel(document);
setupLight(document);
