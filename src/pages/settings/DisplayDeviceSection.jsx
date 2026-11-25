// Configurações → Tela e-ink: horários em que o aparelho (kit TRMNL 7,5" DIY da Seeed, com o programa do PanelAI)
// atualiza, o botão "Atualizar a tela agora" (com a chave do GitHub) e o endereço secreto da imagem que o
// GitHub publica para ele. Como tudo funciona: docs/DISPLAY.md.

import { useEffect, useState } from 'preact/hooks';
import { Clock, Copy, Download, ExternalLink, KeyRound, Loader2, MonitorSmartphone, Plus, Power, RefreshCw, Timer, Trash2, X } from 'lucide-preact';
import { useStore } from '../../storage/store.js';
import { requestScreenUpdate, setGithubToken, updateDisplayDevice } from '../../storage/displayActions.js';
import { screenSize } from '../../display/model.js';
import {
  CHECK_FROM,
  CHECK_OPTIONS,
  CHECK_UNTIL,
  CONFIG_FILE,
  IMAGE_FILE,
  MAX_TIMES,
  describeUpdate,
  inCheckWindow,
  localTimeZone,
  newPublishCode,
  nextUpdateTimes,
  normalizeDisplayDevice,
  normalizeTime,
  publishUrl,
} from '../../display/schedule.js';
import { isValidGithubToken, maskToken, tokenCreationUrl } from '../../display/github.js';
import { copyText } from '../../services/share.js';
import { useNow } from '../../utils/hooks.js';
import { confirmDialog, toast } from '../../components/ui.jsx';

// Tela do kit TRMNL 7,5" DIY: 800 × 480, preto e branco.
const DEVICE_SCREEN = { w: 800, h: 480 };

const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;
// Página que instala o programa do PanelAI no aparelho pelo cabo USB (public/instalar-tela.html).
const installerUrl = () => `${import.meta.env.BASE_URL}instalar-tela.html`;
// Um pedido de "Atualizar a tela agora" é acompanhado por até 15 minutos.
const FOLLOW_REQUEST_MS = 15 * 60_000;
const hhmmHere = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function DisplayDeviceSection() {
  const s = useStore();
  const device = normalizeDisplayDevice(s.settings.displayDevice);
  const now = useNow();
  const [newTime, setNewTime] = useState('');
  const cloud = s.mode === 'cloud';
  const layout = s.displayLayouts[s.settings.displayLayoutId] ?? Object.values(s.displayLayouts)[0] ?? null;
  const upcoming = nextUpdateTimes(device, now.getTime(), { limit: 3 });
  const hereTz = localTimeZone();
  // Endereço da imagem (só com a nuvem e a publicação ligada) e a última publicação.
  const url = cloud && device.code ? publishUrl(siteUrl(), device.code) : '';
  // Pedido recente de "Atualizar a tela agora" (de qualquer pessoa da casa): acompanha até sair a imagem.
  const following = device.requestedAt > 0 && now.getTime() - device.requestedAt < FOLLOW_REQUEST_MS ? device.requestedAt : 0;
  const status = usePublishedStatus(url, following);

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

      {url && <UpdateNow device={device} token={s.githubToken} status={status} following={following} />}

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
          O aparelho relê os horários sempre que acorda (nas conferências de pedidos ou, sem elas, pelo menos a cada 6 horas), então uma mudança
          aqui vale a partir da próxima vez que ele acordar. Para valer na hora, aperte o botão do aparelho.
        </span>
      </div>

      <LayoutCheck layout={layout} />

      {url && (
        <>
          <div class="divider" />
          <RequestOptions device={device} token={s.githubToken} />
        </>
      )}

      <div class="divider" />
      <Publish device={device} cloud={cloud} url={url} status={status} />
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
function Publish({ device, cloud, url, status }) {
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
                  'A partir da próxima publicação, a imagem da tela fica disponível num endereço secreto. Guarde o endereço só no aparelho.',
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
                'Use se o endereço vazou. O endereço atual para de funcionar na próxima publicação e o endereço novo precisa ser colado na página do aparelho.',
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
              message: 'A imagem deixa de ser publicada na próxima publicação. O aparelho continua mostrando a última imagem que baixou.',
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
 * "Atualizar a tela agora": pede ao GitHub a imagem nova e marca o pedido; a
 * tela, na próxima conferência, vê o pedido no config.json e redesenha.
 */
function UpdateNow({ device, token, status, following }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentAt, setSentAt] = useState(0);
  const now = useNow(5_000).getTime();
  const ready = isValidGithubToken(token);
  // Um minuto entre toques (cada pedido republica o site).
  const cooling = sentAt > 0 && now - sentAt < 60_000;

  const request = async () => {
    setBusy(true);
    setError('');
    const r = await requestScreenUpdate();
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setSentAt(Date.now());
    toast('Pedido enviado. A imagem nova fica pronta em uns 3 minutos.');
  };

  return (
    <div class="field">
      <div class="toolbar">
        <button type="button" class="btn btn-primary" onClick={request} disabled={!ready || busy || cooling}>
          {busy ? <Loader2 size={16} class="spin" /> : <RefreshCw size={16} />} Atualizar a tela agora
        </button>
      </div>
      {!ready && (
        <span class="hint">
          Para usar este botão, salve a chave do GitHub em <strong>Atualizar sem esperar o horário</strong>, mais abaixo (uma vez só).
        </span>
      )}
      {error && (
        <div class="notice" role="alert">
          <RefreshCw size={18} />
          <span>{error}</span>
        </div>
      )}
      {!error && following > 0 && <RequestProgress device={device} status={status} requestedAt={following} now={now} />}
    </div>
  );
}

/** Andamento do último pedido: gerando → publicada → quando a tela mostra. */
function RequestProgress({ device, status, requestedAt, now }) {
  const published = status.state === 'ok' && status.pedido >= Math.floor(requestedAt / 1000);
  if (!published) {
    const late = now - requestedAt > 10 * 60_000;
    return (
      <div class="notice info" role="status">
        {late ? <Clock size={18} /> : <Loader2 size={18} class="spin" />}
        <span>
          {late
            ? 'A imagem pedida ainda não saiu. O GitHub pode estar lento ou com problemas; tente de novo daqui a pouco.'
            : `Gerando a imagem nova no GitHub (pedido às ${hhmmHere(requestedAt)}; leva uns 3 minutos)…`}
        </span>
      </div>
    );
  }
  let when;
  if (!device.checkMinutes) when = 'A tela mostra no próximo horário ou quando alguém apertar o botão dela.';
  else if (inCheckWindow(device, now)) when = `A tela mostra na próxima conferência (em até ${device.checkMinutes} minutos).`;
  else when = `A tela confere pedidos das ${CHECK_FROM} às ${CHECK_UNTIL}: mostra na primeira conferência a partir das ${CHECK_FROM} (ou aperte o botão dela).`;
  return (
    <div class="notice ok" role="status">
      <Clock size={18} />
      <span>
        Imagem nova publicada às {hhmmHere(status.generatedAt.getTime())}. {when}
      </span>
    </div>
  );
}

/** Chave do GitHub, conferência de pedidos pela tela e geração automática. */
function RequestOptions({ device, token }) {
  return (
    <div class="form-section" style="gap:12px">
      <h3 class="label with-icon" style="margin:0">
        <Timer size={14} /> Atualizar sem esperar o horário
      </h3>
      <p class="small muted" style="margin:0">
        Com a chave do GitHub salva, o PanelAI pede a imagem nova na hora: no botão <strong>Atualizar a tela agora</strong> e sozinho, logo depois que
        algo muda. Sem a chave, a imagem só é refeita pelo agendamento do GitHub, que pode atrasar horas.
      </p>
      <GithubKey token={token} />
      <label class="field">
        <span class="label">A tela confere se houve pedido</span>
        <select class="input" style="max-width:340px" value={String(device.checkMinutes)} onChange={(e) => updateDisplayDevice({ checkMinutes: Number(e.currentTarget.value) })}>
          {CHECK_OPTIONS.map((m) => (
            <option key={m} value={String(m)}>
              {m ? `A cada ${m} minutos` : 'Não confere (só nos horários e no botão)'}
            </option>
          ))}
        </select>
        <span class="hint">
          Só das {CHECK_FROM} às {CHECK_UNTIL}. Em cada conferência a tela acorda por alguns segundos, só lê se alguém pediu e volta a dormir, sem
          piscar. Quanto mais vezes, mais bateria: a cada 10 minutos ela deve durar 1 a 2 meses; a cada 30, bem mais; sem conferir, vários meses
          (estimativas). Ligada no cabo USB, tanto faz.
        </span>
      </label>
      <label class="switch">
        <input type="checkbox" checked={device.autoGenerate} onChange={(e) => updateDisplayDevice({ autoGenerate: e.currentTarget.checked })} />
        <span>
          Refazer a imagem sozinho quando algo mudar
          <span class="xsmall muted" style="display:block">
            Pouco depois de uma mudança no cardápio, nas tarefas ou no layout, o PanelAI pede ao GitHub as imagens novas de cada horário. A tela
            não muda na hora: continua seguindo os horários.
          </span>
        </span>
      </label>
    </div>
  );
}

/** Guarda, troca ou remove a chave do GitHub (src/display/github.js). */
function GithubKey({ token }) {
  const has = isValidGithubToken(token);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    const t = value.trim();
    if (!isValidGithubToken(t)) return setError('Isso não parece uma chave do GitHub: ela começa com "github_pat_".');
    setError('');
    await setGithubToken(t);
    setValue('');
    setEditing(false);
    toast('Chave do GitHub salva');
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Remover a chave do GitHub',
      message: 'O botão "Atualizar a tela agora" e a geração automática param. Para apagar a chave de vez, apague também no GitHub.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    await setGithubToken(null);
    toast('Chave removida');
  };

  if (has && !editing) {
    return (
      <div class="field">
        <span class="label with-icon">
          <KeyRound size={14} /> Chave do GitHub
        </span>
        <div class="toolbar">
          <code>{maskToken(token)}</code>
          <button type="button" class="btn btn-ghost" onClick={() => setEditing(true)}>
            <KeyRound size={16} /> Trocar
          </button>
          <button type="button" class="btn btn-danger-ghost" onClick={remove}>
            <Trash2 size={16} /> Remover
          </button>
        </div>
        <span class="hint">Se a chave vencer ou for apagada no GitHub, o botão avisa: crie outra e salve aqui.</span>
      </div>
    );
  }

  return (
    <form class="field" onSubmit={save}>
      <label class="label with-icon" for="chave-github">
        <KeyRound size={14} /> Chave do GitHub
      </label>
      <div class="toolbar">
        <input
          id="chave-github"
          class="input"
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder="github_pat_…"
          style="max-width:340px"
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <button type="submit" class="btn btn-secondary" disabled={!value.trim()}>
          Salvar chave
        </button>
        {has && (
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => {
              setEditing(false);
              setValue('');
              setError('');
            }}
          >
            Cancelar
          </button>
        )}
      </div>
      {error && (
        <span class="error" role="alert">
          {error}
        </span>
      )}
      <details class="disclosure small">
        <summary>Como criar a chave (uma vez só)</summary>
        <ol style="margin:0;padding-left:20px;display:grid;gap:6px">
          <li>
            Abra{' '}
            <a href={tokenCreationUrl()} target="_blank" rel="noopener noreferrer">
              a página do GitHub que cria a chave
            </a>{' '}
            (entre na sua conta do GitHub se ele pedir). Ela já vem com o nome "PanelAI tela", sem data para vencer e com a permissão certa.
          </li>
          <li>
            Em <strong>Repository access</strong>, escolha <strong>Only select repositories</strong> e selecione <strong>PanelAI</strong>.
          </li>
          <li>
            Em <strong>Permissions</strong>, confira: <strong>Actions</strong> com <strong>Read and write</strong> (o <strong>Metadata</strong> vem junto,
            só leitura). Não precisa de mais nada.
          </li>
          <li>
            Toque em <strong>Generate token</strong>, copie a chave (começa com <code>github_pat_</code>), cole aqui e toque em <strong>Salvar chave</strong>.
          </li>
        </ol>
        <p class="xsmall muted" style="margin:8px 0 0">
          A chave só serve para o GitHub Actions do PanelAI (pedir a imagem e ver as execuções): não mexe no código, nos segredos nem nos dados da casa.
          Fica guardada nos dados da casa, que só as pessoas da casa e a conta de tela leem, e não vai para os backups.
        </p>
      </details>
    </form>
  );
}

/**
 * Lê o config.json publicado para mostrar quando saiu a última imagem.
 * { state: 'checking' | 'ok' | 'missing' | 'error', generatedAt?: Date, pedido?: número (s) }
 * Com `following` (ms de um pedido recente), confere de novo a cada 20 s até sair a imagem pedida.
 */
function usePublishedStatus(url, following = 0) {
  const [status, setStatus] = useState({ state: 'checking', url });
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    // Só mostra "conferindo" na primeira vez (as conferências seguintes não piscam).
    setStatus((prev) => (prev.url === url ? prev : { state: 'checking', url }));
    fetch(`${url}/${CONFIG_FILE}?t=${Date.now()}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!alive) return;
        // 404 (ou outra página no lugar do JSON): ainda não publicada.
        if (r.status === 404 || (r.ok && !(r.headers.get('content-type') ?? '').includes('json'))) return setStatus({ state: 'missing', url });
        if (!r.ok) return setStatus({ state: 'error', url });
        const cfg = await r.json();
        if (alive) setStatus({ state: 'ok', url, generatedAt: new Date(Number(cfg.gerado) * 1000), pedido: Number(cfg.pedido) || 0 });
      })
      .catch(() => alive && setStatus({ state: 'error', url }));
    return () => {
      alive = false;
    };
  }, [url, round]);

  const waiting = following > 0 && !(status.state === 'ok' && status.pedido >= Math.floor(following / 1000));
  useEffect(() => {
    if (!url || !waiting) return undefined;
    const t = setInterval(() => setRound((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [url, waiting]);
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
          Última imagem publicada: {describeUpdate(d.getTime(), Date.now(), localTimeZone()).replace(' às ', ', ')}. Ela é refeita quando algo muda
          no PanelAI (com a chave do GitHub salva) e pelo agendamento do GitHub, que pode atrasar.
        </span>
      </div>
    );
  }
  if (status.state === 'missing') {
    return (
      <div class="notice" role="status">
        <Clock size={18} />
        <span>
          Ainda não há imagem neste endereço. Ela sai na próxima publicação do GitHub (com a chave do GitHub salva, em uns 3 minutos; sem ela, pode
          demorar), desde que a conta da tela esteja configurada lá (passo a passo em <code>docs/DISPLAY.md</code>).
        </span>
      </div>
    );
  }
  return <p class="small muted" style="margin:0">Não foi possível conferir a publicação agora (sem internet?).</p>;
}
