// Tela de entrada: com a nuvem configurada, só pessoas da casa (logadas) usam o app.
// Quem só quer conhecer pode experimentar no modo de teste (dados de exemplo,
// guardados só neste navegador).

import { useState } from 'preact/hooks';
import { FlaskConical } from 'lucide-preact';
import { CloudSection } from './settings/CloudSection.jsx';
import { startDemo } from '../storage/store.js';

export function LoginGate() {
  const [starting, setStarting] = useState(false);
  return (
    <main class="login-gate" id="conteudo">
      <div class="login-gate-inner">
        <img src={`${import.meta.env.BASE_URL}logo-horizontal.svg`} alt="PanelAI" width="220" height="62" class="login-logo" />
        <CloudSection gate />
        <section class="card card-pad demo-cta" aria-labelledby="teste">
          <h2 id="teste" class="section-title" style="margin:0;display:flex;gap:8px;align-items:center">
            <FlaskConical size={18} /> Só quer conhecer?
          </h2>
          <p class="small muted" style="margin:0">
            Experimente o PanelAI com dados de exemplo, sem conta. Nada é enviado para a nuvem: o que você mudar fica só neste navegador.
          </p>
          <div class="toolbar">
            <button
              type="button"
              class="btn btn-secondary"
              disabled={starting}
              onClick={() => {
                setStarting(true);
                startDemo();
              }}
            >
              <FlaskConical size={16} /> Experimentar sem conta
            </button>
          </div>
        </section>
        <p class="small muted login-foot">Cardápio, compras, despensa e tarefas da casa — compartilhados só com quem você convidar.</p>
      </div>
    </main>
  );
}
