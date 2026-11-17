// Telas carregadas sob demanda (divisão do código por rota).
//
// Se a importação falhar porque o app foi atualizado e o arquivo antigo não
// existe mais, recarrega a página uma vez para pegar a versão nova.

import { lazy } from 'preact/compat';

const KEY = 'panelai.chunkReload';

export function lazyPage(load, name) {
  return lazy(() =>
    load()
      .then((m) => {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* ignora */
        }
        return { default: m[name] };
      })
      .catch((err) => {
        try {
          const last = Number(sessionStorage.getItem(KEY)) || 0;
          if (Date.now() - last > 60_000) {
            sessionStorage.setItem(KEY, String(Date.now()));
            window.location.reload();
          }
        } catch {
          /* ignora */
        }
        throw err;
      }),
  );
}
