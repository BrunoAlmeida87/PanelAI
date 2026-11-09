// Guarda o evento beforeinstallprompt para oferecer a instalação do PWA.

let deferred = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const getInstallPrompt = () => deferred;
export function onInstallPromptChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
