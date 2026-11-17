// Tela de entrada: com a nuvem configurada, só pessoas da casa (logadas) usam o app.

import { CloudSection } from './settings/CloudSection.jsx';

export function LoginGate() {
  return (
    <main class="login-gate" id="conteudo">
      <div class="login-gate-inner">
        <img src={`${import.meta.env.BASE_URL}logo-horizontal.svg`} alt="PanelAI" width="220" height="62" class="login-logo" />
        <CloudSection gate />
        <p class="small muted login-foot">Cardápio, compras, despensa e tarefas da casa — compartilhados só com quem você convidar.</p>
      </div>
    </main>
  );
}
