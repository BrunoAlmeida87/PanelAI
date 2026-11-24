// Configurações → Tela e-ink: horários em que o aparelho (kit TRMNL 7,5" DIY da Seeed, com o programa do PanelAI)
// atualiza e o endereço secreto da imagem que o GitHub publica para ele.
// Como tudo funciona: docs/DISPLAY.md.

import { useEffect, useState } from 'preact/hooks';
import { Clock, Copy, Download, ExternalLink, KeyRound, MonitorSmartphone, Plus, Power, X } from 'lucide-preact';
import { useStore } from '../../storage/store.js';
import { updateDisplayDevice } from '../../storage/displayActions.js';
import { screenSize } from '../../display/model.js';
import {
  CONFIG_FILE,
  IMAGE_FILE,
  MAX_TIMES,
  describeUpdate,
  localTimeZone,
  newPublishCode,
  nextUpdateTimes,
  normalizeDisplayDevice,
  normalizeTime,
  publishUrl,
} from '../../display/schedule.js';
import { copyText } from '../../services/share.js';
import { useNow } from '../../utils/hooks.js';
import { confirmDialog, toast } from '../../components/ui.jsx';

// Tela do kit TRMNL 7,5" DIY: 800 × 480, preto e branco.
const DEVICE_SCREEN = { w: 800, h: 480 };

const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;
// Página que instala o programa do PanelAI no aparelho pelo cabo USB (public/instalar-tela.html).
const installerUrl = () => `${import.meta.env.BASE_URL}instalar-tela.html`;

export function DisplayDeviceSection() {
  const s = useStore();
  const device = normalizeDisplayDevice(s.settings.displayDevice);
  const now = useNow();
  const [newTime, setNewTime] = useState('');
  const cloud = s.mode === 'cloud';
  const layout = s.displayLayouts[s.settings.displayLayoutId] ?? Object.values(s.displayLayouts)[0] ?? null;
  const upcoming = nextUpdateTimes(device, now.getTime(), { limit: 3 });
  const hereTz = localTimeZone();

  const addTime = (e) => {
    e?.preventDefault?.();
    const t = normalizeTime(newTime);
    if (!t) return toast('Escolha um horário', { type: 'error' });
    if (device.times.includes(t)) return toast(`${t} já está na lista`);
    if (device.times.length >= MAX_TIMES) return toast(`No máximo ${MAX_TIMES} horários`, { type: 'error' });
    updateDisplayDevice({ times: [...device.times, t] });
    setNewTime('');
    toast(`A tela vai atualizar também às ${t}`);
  };

  const removeTime = (t) => {
    updateDisplayDevice({ times: device.times.filter((x) => x !== t) });
    toast(`Horário ${t} removido`);
  };

  return (
    <section class="card card-pad form-section" style="margin-top:16px" aria-labelledby="tela-eink">
      <h2 id="tela-eink" class="section-title" style="margin:0">
        <MonitorSmartphone size={18} /> Tela e-ink
      </h2>
      <p class="small muted" style="margin:0">
        O aparelho fica desligado e acorda sozinho nos horários abaixo: baixa a imagem da tela pela internet, mostra e volta a dormir. O botão do
        aparelho atualiza na hora.
      </p>

      <div class="field">
        <span class="label with-icon" id="horarios-label">
          <Clock size={14} /> Horários de atualização
        </span>
        {device.times.length ? (
          <div class="chip-row" role="list" aria-labelledby="horarios-label">
            {device.times.map((t) => (
              <span key={t} role="listitem">
                <button type="button" class="chip" onClick={() => removeTime(t)} aria-label={`Remover o horário ${t}`} title="Remover">
                  {t} <X size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p class="small muted" style="margin:0">
            Nenhum horário: a tela só atualiza quando alguém aperta o botão do aparelho.
          </p>
        )}
        <form class="toolbar" style="margin-top:6px" onSubmit={addTime}>
          <input
            class="input"
            type="time"
            style="max-width:140px"
            value={newTime}
            onInput={(e) => setNewTime(e.currentTarget.value)}
            aria-label="Novo horário de atualização"
          />
          <button type="submit" class="btn btn-secondary" disabled={!newTime || device.times.length >= MAX_TIMES}>
            <Plus size={16} /> Adicionar horário
          </button>
        </form>
        {upcoming.length > 0 && <span class="hint">Próximas: {upcoming.map((ms) => describeUpdate(ms, now.getTime(), device.timeZone)).join(' · ')}.</span>}
        <span class="hint">
          Fuso horário: {device.timeZone}.
          {hereTz !== device.timeZone && (
            <>
              {' '}
              <button type="button" class="btn-link" onClick={() => updateDisplayDevice({ timeZone: hereTz })}>
                Usar o fuso deste aparelho ({hereTz})
              </button>
            </>
          )}
        </span>
        <span class="hint">
          O aparelho confere os horários sempre que acorda (pelo menos a cada 6 horas), então uma mudança aqui vale a partir da próxima vez que
          ele acordar. Para valer na hora, aperte o botão do aparelho.
        </span>
      </div>

      <LayoutCheck layout={layout} />

      <div class="divider" />
      <Publish device={device} cloud={cloud} />
    </section>
  );
}

/** Confere se o layout escolhido combina com a tela do aparelho (800 × 480, preto e branco). */
function LayoutCheck({ layout }) {
  if (!layout) {
    return (
      <p class="small muted" style="margin:0">
        Ainda não há layout salvo: a tela mostra o sugerido "Cozinha". Monte o seu na aba <a href="#/display">Display</a>.
      </p>
    );
  }
  const { w, h } = screenSize(layout);
  const sizeOk = (w === DEVICE_SCREEN.w && h === DEVICE_SCREEN.h) || (w === DEVICE_SCREEN.h && h === DEVICE_SCREEN.w);
  const colorOk = layout.colorMode === 'bw';
  return (
    <>
      <p class="small" style="margin:0">
        Mostra o layout <strong>{layout.name}</strong> ({w} × {h}). <a href="#/display">Alterar na aba Display</a>.
      </p>
      {(!sizeOk || !colorOk) && (
        <div class="notice" role="note">
          <MonitorSmartphone size={18} />
          <span>
            A tela do aparelho é de 800 × 480, em preto e branco.
            {!sizeOk && ' Escolha o modelo 7,5" (800 × 480) no layout, senão a imagem fica cortada ou com sobra.'}
            {!colorOk && ' Use as cores "Preto e branco": cinzas e cores claras somem ou viram preto na tela.'}
          </span>
        </div>
      )}
    </>
  );
}

/** Endereço secreto da imagem: ativar, copiar, conferir, trocar e desligar. */
function Publish({ device, cloud }) {
  const url = device.code ? publishUrl(siteUrl(), device.code) : '';
  const status = usePublishedStatus(url);

  if (!cloud) {
    return (
      <div class="notice info" role="note">
        <KeyRound size={18} />
        <span>A tela busca a imagem pela internet, gerada com os dados da casa na nuvem. Entre na conta da casa para ativar o endereço da imagem.</span>
      </div>
    );
  }

  if (!device.code) {
    return (
      <div class="form-section" style="gap:10px">
        <p class="small muted" style="margin:0">
          Para o aparelho baixar a imagem, ela é publicada num endereço secreto: um código longo e aleatório, impossível de adivinhar. Quem tiver o
          endereço vê só a imagem da tela; não entra no sistema nem altera nada.
        </p>
        <div class="toolbar">
          <button
            type="button"
            class="btn btn-primary"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Ativar o endereço da imagem',
                message:
                  'A partir da próxima publicação (em até 30 minutos), a imagem da tela fica disponível num endereço secreto. Guarde o endereço só no aparelho.',
                confirmLabel: 'Ativar',
              });
              if (ok) {
                updateDisplayDevice({ code: newPublishCode() });
                toast('Endereço criado');
              }
            }}
          >
            <KeyRound size={16} /> Ativar endereço da imagem
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="form-section" style="gap:10px">
      <label class="field">
        <span class="label">Endereço para o aparelho</span>
        <input class="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} spellcheck={false} />
        <span class="hint">
          Cole este endereço na página do aparelho, no campo <strong>Endereço da imagem</strong> (veja <a href={installerUrl()} target="_blank" rel="noopener">Instalar o
          programa na tela</a>). Não compartilhe: é a chave para ver a imagem.
        </span>
      </label>
      <PublishedStatus status={status} />
      <div class="toolbar">
        <button
          type="button"
          class="btn btn-secondary"
          onClick={async () => toast((await copyText(url)) ? 'Endereço copiado' : 'Não foi possível copiar')}
        >
          <Copy size={16} /> Copiar endereço
        </button>
        <a class="btn btn-ghost" href={`${url}/${IMAGE_FILE}`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} /> Ver imagem publicada
        </a>
        <a class="btn btn-ghost" href={installerUrl()} target="_blank" rel="noopener">
          <Download size={16} /> Instalar o programa na tela
        </a>
        <button
          type="button"
          class="btn btn-ghost"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Trocar o endereço',
              message:
                'Use se o endereço vazou. O endereço atual para de funcionar na próxima publicação (em até 30 minutos) e o aparelho precisa ser gravado de novo com o endereço novo.',
              confirmLabel: 'Trocar endereço',
              danger: true,
            });
            if (ok) {
              updateDisplayDevice({ code: newPublishCode() });
              toast('Endereço trocado. Cole o novo na página do aparelho (segure o botão dele por 5 s).');
            }
          }}
        >
          <KeyRound size={16} /> Trocar endereço
        </button>
        <button
          type="button"
          class="btn btn-danger-ghost"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Desligar a publicação',
              message: 'A imagem deixa de ser publicada na próxima publicação (em até 30 minutos). O aparelho continua mostrando a última imagem que baixou.',
              confirmLabel: 'Desligar',
              danger: true,
            });
            if (ok) {
              updateDisplayDevice({ code: null });
              toast('Publicação desligada');
            }
          }}
        >
          <Power size={16} /> Desligar
        </button>
      </div>
    </div>
  );
}

/**
 * Lê o config.json publicado para mostrar quando saiu a última imagem.
 * { state: 'checking' | 'ok' | 'missing' | 'error', generatedAt?: Date }
 */
function usePublishedStatus(url) {
  const [status, setStatus] = useState({ state: 'checking' });
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    setStatus({ state: 'checking' });
    fetch(`${url}/${CONFIG_FILE}?t=${Date.now()}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!alive) return;
        // 404 (ou outra página no lugar do JSON): ainda não publicada.
        if (r.status === 404 || (r.ok && !(r.headers.get('content-type') ?? '').includes('json'))) return setStatus({ state: 'missing' });
        if (!r.ok) return setStatus({ state: 'error' });
        const cfg = await r.json();
        setStatus({ state: 'ok', generatedAt: new Date(Number(cfg.gerado) * 1000) });
      })
      .catch(() => alive && setStatus({ state: 'error' }));
    return () => {
      alive = false;
    };
  }, [url]);
  return status;
}

function PublishedStatus({ status }) {
  if (status.state === 'checking') return <p class="small muted" style="margin:0">Conferindo a última publicação…</p>;
  if (status.state === 'ok') {
    const d = status.generatedAt;
    return (
      <div class="notice ok" role="status">
        <Clock size={18} />
        <span>
          Última imagem publicada: {describeUpdate(d.getTime(), Date.now(), localTimeZone()).replace(' às ', ', ')}. Ela é refeita a cada 30 minutos.
        </span>
      </div>
    );
  }
  if (status.state === 'missing') {
    return (
      <div class="notice" role="status">
        <Clock size={18} />
        <span>
          Ainda não há imagem neste endereço. Ela sai na próxima publicação do GitHub (até 30 minutos), desde que a conta da tela esteja configurada
          lá (passo a passo em <code>docs/DISPLAY.md</code>).
        </span>
      </div>
    );
  }
  return <p class="small muted" style="margin:0">Não foi possível conferir a publicação agora (sem internet?).</p>;
}
