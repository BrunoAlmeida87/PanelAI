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
import './styles/tasks.css';
import './styles/montessori.css';
import './styles/display.css';
import './styles/print.css';
import { App } from './App.jsx';
import { bootstrap } from './storage/store.js';
import { installViewportHeightVar } from './utils/hooks.js';

installViewportHeightVar();
render(<App />, document.getElementById('app'));
bootstrap();

// Service worker (funcionamento offline). Só em produção.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => registerServiceWorker());
}

/**
 * Versão nova do app: fica baixada esperando. Ao abrir o app ela entra na hora;
 * com o app em uso aparece "Nova versão disponível — Atualizar". A tela do
 * display (sem ninguém para tocar) atualiza sozinha.
 */
async function registerServiceWorker() {
  const openedAt = performance.now();
  let reg;
  try {
    reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  } catch (err) {
    console.warn('Service worker não registrado', err);
    return;
  }
  let requested = false;
  const apply = (worker) => {
    requested = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requested) window.location.reload();
  });
  const offer = async (worker) => {
    if (!navigator.serviceWorker.controller) return; // primeira instalação: nada a trocar
    const justOpened = performance.now() - openedAt < 4000;
    if (justOpened || location.hash.startsWith('#/display/tela')) return apply(worker);
    const { toast } = await import('./components/ui.jsx');
    toast('Nova versão do PanelAI disponível', { duration: 60_000, action: { label: 'Atualizar', onClick: () => apply(worker) } });
  };
  if (reg.waiting) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
    });
  });
  // Aparelhos que ficam sempre abertos (display) procuram versão nova de hora em hora.
  setInterval(() => reg.update().catch(() => {}), 3600_000);
}
