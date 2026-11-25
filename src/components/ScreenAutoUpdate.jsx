// Geração automática da imagem da tela e-ink: pouco depois de alguém mudar,
// neste aparelho, algo que aparece na tela (cardápio, tarefas, layout…), o site
// pede ao GitHub uma imagem nova (src/display/github.js). Assim as imagens de
// cada horário já ficam prontas com os dados novos, sem esperar o agendamento
// do GitHub (que atrasa). A tela continua mudando só nos horários, no botão ou
// em "Atualizar a tela agora".

import { useEffect } from 'preact/hooks';
import { onPersist, useStore } from '../storage/store.js';
import { lastScreenRequest, requestScreenUpdate } from '../storage/displayActions.js';
import { AUTO_MIN_GAP_MS, nextAutoRequest, touchesDisplay } from '../display/github.js';
import { normalizeDisplayDevice } from '../display/schedule.js';
import { toast } from './ui.jsx';

const CHANGE_KEY = 'panelai.tela.ultimaMudanca';

const readChange = () => {
  try {
    return Number(localStorage.getItem(CHANGE_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeChange = (ms) => {
  try {
    localStorage.setItem(CHANGE_KEY, String(ms));
  } catch {
    /* sem armazenamento: vale só enquanto o app está aberto */
  }
};

/** A geração automática vale para quem grava na nuvem, com a chave do GitHub e a publicação ligadas. */
export function canAutoGenerate(s) {
  if (s.mode !== 'cloud' || s.cloud?.readOnly || !s.githubToken) return false;
  const device = normalizeDisplayDevice(s.settings?.displayDevice);
  return !!device.code && device.autoGenerate;
}

export function ScreenAutoUpdate() {
  const active = canAutoGenerate(useStore());

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    let lastChange = readChange();
    let lastAttempt = 0; // tentativas que falharam também esperam o intervalo mínimo
    let stopped = false; // chave recusada: para até o app ser aberto de novo

    const lastRequest = () => Math.max(lastScreenRequest(), lastAttempt);
    const due = () => nextAutoRequest({ lastChange, lastRequest: lastRequest() });

    const fire = async (keepalive = false) => {
      clearTimeout(timer);
      timer = null;
      lastAttempt = Date.now();
      const r = await requestScreenUpdate({ auto: true, keepalive });
      if (!r.ok && r.status >= 400 && r.status < 500) {
        stopped = true;
        toast(`A imagem da tela não foi refeita: ${r.message}`, { type: 'error', duration: 10_000 });
      }
      schedule();
    };

    function schedule() {
      clearTimeout(timer);
      timer = null;
      if (stopped) return;
      const at = due();
      if (at == null) return;
      timer = setTimeout(() => {
        // Um pedido manual pode ter acontecido enquanto esperava.
        const again = due();
        if (again != null && again <= Date.now() + 1000) fire();
        else schedule();
      }, Math.max(0, at - Date.now()));
    }

    const off = onPersist((ops) => {
      if (!touchesDisplay(ops)) return;
      lastChange = Date.now();
      writeChange(lastChange);
      schedule();
    });

    // Fechando ou trocando de app com mudança pendente: pede já (o pedido segue
    // mesmo com a página fechada), desde que respeite o intervalo mínimo.
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || stopped || due() == null) return;
      if (lastRequest() + AUTO_MIN_GAP_MS <= Date.now()) fire(true);
    };
    document.addEventListener('visibilitychange', onHide);
    schedule(); // mudança que ficou pendente da última vez que o app foi fechado

    return () => {
      off();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [active]);

  return null;
}
