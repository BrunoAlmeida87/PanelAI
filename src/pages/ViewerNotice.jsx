// Conta de tela (só leitura): ela existe para gerar a imagem do display
// (docs/DISPLAY.md). Fora de #/display/tela, aparece só este aviso.

import { useState } from 'preact/hooks';
import { LogOut, MonitorSmartphone } from 'lucide-preact';
import { useStore } from '../storage/store.js';

export function ViewerNotice() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const h = s.cloud.household;
  return (
    <main class="login-gate" id="conteudo">
      <div class="login-gate-inner">
        <img src={`${import.meta.env.BASE_URL}logo-horizontal.svg`} alt="PanelAI" width="220" height="62" class="login-logo" />
        <section class="card card-pad form-section gate-card" aria-labelledby="conta-tela">
          <h2 id="conta-tela" class="section-title" style="margin:0">
            <MonitorSmartphone size={18} /> Conta da tela
          </h2>
          <p style="margin:0">
            <strong>{s.cloud.user?.email}</strong> é uma conta de tela da casa <strong>{h?.name ?? '…'}</strong>: ela só lê os dados para mostrar o
            display e não altera nada.
          </p>
          <p class="small muted" style="margin:0">
            Para usar o PanelAI, saia desta conta e entre com o seu e-mail. As contas de tela são cadastradas pelo responsável em Configurações →
            Sincronização na nuvem.
          </p>
          <div class="toolbar">
            <a class="btn btn-primary" href="#/display/tela">
              <MonitorSmartphone size={16} /> Ver a tela
            </a>
            <button
              type="button"
              class="btn btn-ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const { signOutCloud } = await import('../cloud/session.js');
                await signOutCloud();
              }}
            >
              <LogOut size={16} /> Sair da conta
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
