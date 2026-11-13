import { render } from 'preact';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/menu.css';
import './styles/shopping.css';
import './styles/pantry.css';
import './styles/recipes.css';
import './styles/notes.css';
import './styles/print.css';
import { App } from './App.jsx';
import { bootstrap } from './storage/store.js';
import { startSync } from './storage/sync.js';
import { installViewportHeightVar } from './utils/hooks.js';

installViewportHeightVar();
render(<App />, document.getElementById('app'));
bootstrap().then(startSync);

// Service worker (funcionamento offline). Só em produção.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch((err) => {
      console.warn('Service worker não registrado', err);
    });
  });
}
