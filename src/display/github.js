// Pedidos ao GitHub para gerar a imagem da tela e-ink agora (workflow
// .github/workflows/display.yml, evento workflow_dispatch).
//
// Por que existe: o agendamento do GitHub ("a cada 30 minutos") atrasa ou é
// descartado quando o GitHub está cheio. Pedidos diretos rodam em segundos.
// O site pede: (1) quando alguém toca em "Atualizar a tela agora" e (2) sozinho,
// pouco depois de alguém mudar algo no PanelAI (geração automática).
//
// A chave é um token do GitHub que só pode rodar esse workflow (permissão
// "Actions: leitura e escrita", só no repositório do PanelAI). Fica nos dados da
// casa (meta/github), que só as pessoas da casa e a conta de tela leem, e não
// entra nos backups. Passo a passo: docs/DISPLAY.md.

export const DEFAULT_REPO = 'BrunoAlmeida87/PanelAI';
export const WORKFLOW_FILE = 'display.yml';
export const GITHUB_API = 'https://api.github.com';

/** A geração automática espera a pessoa parar de mexer por este tempo… */
export const AUTO_DEBOUNCE_MS = 60_000;
/** …e não pede de novo antes deste intervalo (cada pedido republica o site). */
export const AUTO_MIN_GAP_MS = 10 * 60_000;

/** Repositório a partir do endereço do site (<dono>.github.io/<repositório>/), ou o padrão. */
export function repoFromSite(hostname, basePath) {
  const owner = /^([a-z0-9-]+)\.github\.io$/i.exec(String(hostname ?? ''))?.[1];
  const repo = String(basePath ?? '').split('/').filter(Boolean)[0];
  return owner && repo ? `${owner}/${repo}` : DEFAULT_REPO;
}

/** Token do GitHub: fino ("github_pat_…") ou clássico ("ghp_…"). */
export function isValidGithubToken(token) {
  return /^(github_pat_[A-Za-z0-9_]{20,255}|gh[pousr]_[A-Za-z0-9]{20,255})$/.test(String(token ?? '').trim());
}

/** "github_pat_…a1b2": para mostrar que há uma chave sem mostrá-la. */
export function maskToken(token) {
  const t = String(token ?? '');
  return t.length > 12 ? `${t.slice(0, t.startsWith('github_pat_') ? 11 : 4)}…${t.slice(-4)}` : '';
}

/**
 * Página do GitHub para criar a chave, já preenchida (nome, sem vencimento e
 * "Actions: Read and write"). O repositório não dá para preencher pelo endereço:
 * a pessoa escolhe "Only select repositories" → PanelAI.
 * Parâmetros: docs.github.com → "Pre-filling fine-grained personal access token details using URL parameters".
 */
export function tokenCreationUrl() {
  const q = new URLSearchParams({
    name: 'PanelAI tela',
    description: 'Pede ao GitHub a imagem nova da tela e-ink do PanelAI (workflow "Imagem do display").',
    expires_in: 'none',
    actions: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${q}`;
}

const ERRORS = {
  401: 'A chave do GitHub é inválida ou venceu. Crie outra e salve de novo.',
  403: 'A chave do GitHub não tem permissão para rodar o workflow (precisa de "Actions: Read and write").',
  404: 'A chave do GitHub não tem acesso ao repositório do PanelAI (escolha o repositório ao criar a chave).',
  422: 'O GitHub recusou o pedido (o workflow "Imagem do display" está na branch main?).',
};

/**
 * Pede ao GitHub para gerar e publicar a imagem agora.
 * Resolve com { ok: true } ou { ok: false, status, message } (nunca rejeita).
 * `keepalive`: o pedido segue mesmo se a página for fechada logo depois.
 */
export async function requestImageGeneration({ token, repo = DEFAULT_REPO, fetchImpl = globalThis.fetch, keepalive = false }) {
  if (!isValidGithubToken(token)) return { ok: false, status: 0, message: 'Falta a chave do GitHub (Configurações → Tela e-ink).' };
  try {
    const r = await fetchImpl(`${GITHUB_API}/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      keepalive,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${String(token).trim()}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (r.status === 204 || r.status === 200) return { ok: true };
    return { ok: false, status: r.status, message: ERRORS[r.status] ?? `O GitHub respondeu com erro ${r.status}. Tente de novo em instantes.` };
  } catch {
    return { ok: false, status: 0, message: 'Sem conexão com o GitHub. Confira a internet e tente de novo.' };
  }
}

/**
 * Geração automática: quando pedir, dado o momento da última mudança e do
 * último pedido feito por este aparelho. Devolve o instante (ms) ou null se não
 * há mudança pendente.
 */
export function nextAutoRequest({ lastChange, lastRequest, debounceMs = AUTO_DEBOUNCE_MS, minGapMs = AUTO_MIN_GAP_MS }) {
  if (!lastChange || (lastRequest && lastRequest >= lastChange)) return null;
  return Math.max(lastChange + debounceMs, (lastRequest || 0) + minGapMs);
}

/** Coleções cujas mudanças alteram o que aparece na tela (as outras não pedem imagem nova). */
export const DISPLAY_STORES = new Set([
  'weeks',
  'tasks',
  'taskTemplates',
  'recipes',
  'marmitas',
  'pantry',
  'ingredients',
  'displayLayouts',
  'children', // card Montessori (atividades do dia)
  'montessoriLogs',
  'meta',
]);

/** Alguma operação de gravação mexe no que aparece na tela? (meta: só as configurações.) */
export function touchesDisplay(ops) {
  return ops.some((op) => DISPLAY_STORES.has(op.store) && (op.store !== 'meta' || op.value?.key === 'settings'));
}
