import { useEffect, useState } from 'preact/hooks';
import { Suspense } from 'preact/compat';
import { BookOpen, CalendarDays, Check, ListChecks, MonitorSmartphone, CloudCheck, CloudOff, CloudUpload, Loader2, Package, Settings, ShoppingCart, TriangleAlert, WifiOff, FlaskConical, LogIn } from 'lucide-preact';
import { exitDemo, useStore } from './storage/store.js';
import { canGenerateRecurring, ensureRecurringAround } from './storage/taskActions.js';
import { useRoute, navigate } from './utils/router.js';
import { useWeekId, shiftWeek, goToCurrentWeek } from './storage/ui.js';
import { useOnline } from './utils/hooks.js';
import { lazyPage } from './utils/lazy.js';
import { ToastRegion, ConfirmHost } from './components/ui.jsx';
import { ShortcutsModal } from './components/ShortcutsModal.jsx';
import { ScreenAutoUpdate } from './components/ScreenAutoUpdate.jsx';
import { WeekSelector } from './components/WeekSelector.jsx';
import { MenuPage } from './pages/MenuPage.jsx';
import { ShoppingPage } from './pages/ShoppingPage.jsx';
import { RecipesPage } from './pages/RecipesPage.jsx';
import { useWeekShopping } from './pages/useWeekData.js';

// Telas usadas com menos frequência: baixadas só quando abertas
// (ficam no cache do aplicativo e continuam funcionando offline).
const PantryPage = lazyPage(() => import('./pages/PantryPage.jsx'), 'PantryPage');
const RecipeDetailPage = lazyPage(() => import('./pages/RecipeDetailPage.jsx'), 'RecipeDetailPage');
const RecipeFormPage = lazyPage(() => import('./pages/RecipeFormPage.jsx'), 'RecipeFormPage');
const SettingsPage = lazyPage(() => import('./pages/SettingsPage.jsx'), 'SettingsPage');
const HistoryPage = lazyPage(() => import('./pages/HistoryPage.jsx'), 'HistoryPage');
const TasksPage = lazyPage(() => import('./pages/TasksPage.jsx'), 'TasksPage');
const DisplayPage = lazyPage(() => import('./pages/DisplayPage.jsx'), 'DisplayPage');
const DisplayScreen = lazyPage(() => import('./pages/DisplayPage.jsx'), 'DisplayScreen');
const LoginGate = lazyPage(() => import('./pages/LoginGate.jsx'), 'LoginGate');
const ViewerNotice = lazyPage(() => import('./pages/ViewerNotice.jsx'), 'ViewerNotice');

const NAV = [
  { id: 'cardapio', path: '/cardapio', long: 'Cardápio', short: 'Cardápio', icon: CalendarDays },
  { id: 'compras', path: '/compras', long: 'Lista da semana', short: 'Compras', icon: ShoppingCart },
  { id: 'despensa', path: '/despensa', long: 'Mercado do mês', short: 'Despensa', icon: Package },
  { id: 'receitas', path: '/receitas', long: 'Receitas', short: 'Receitas', icon: BookOpen },
  { id: 'tarefas', path: '/tarefas', long: 'Tarefas', short: 'Tarefas', icon: ListChecks },
];

function navSection(routeName) {
  if (routeName.startsWith('receita')) return 'receitas';
  return routeName;
}

const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Página carregando (telas baixadas sob demanda). */
const PageLoading = () => (
  <div class="page-loading" role="status" aria-live="polite">
    <Loader2 size={20} class="spin" /> Carregando…
  </div>
);

export function App() {
  const state = useStore();
  const route = useRoute();
  const weekId = useWeekId();
  const online = useOnline();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const section = navSection(route.name);

  // Atalhos de teclado (desktop)
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= NAV.length) {
        navigate(NAV[n - 1].path);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && ['cardapio', 'compras', 'tarefas'].includes(section)) {
        shiftWeek(-1);
      } else if (e.key === 'ArrowRight' && ['cardapio', 'compras', 'tarefas'].includes(section)) {
        shiftWeek(1);
      } else if (e.key === 't' || e.key === 'h') {
        goToCurrentWeek();
      } else if (e.key === '/') {
        const el = document.querySelector('[data-search]');
        if (el) {
          e.preventDefault();
          el.focus();
        }
      } else if (e.key === 'n' && section === 'receitas') {
        navigate('/receitas/nova');
      } else if (e.key === '?') {
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section]);

  // Leva o foco ao topo ao trocar de tela (acessibilidade)
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.name, route.arg]);

  const showWeek = ['cardapio', 'compras', 'tarefas'].includes(route.name);

  if (!state.ready) return <BootScreen waiting={state.cloud.waiting} online={online} />;

  // Nuvem configurada e ninguém logado: só a tela de entrar (também no display).
  if (state.mode === 'gate') {
    return (
      <>
        <Suspense fallback={<PageLoading />}>
          <LoginGate />
        </Suspense>
        <ToastRegion />
        <ConfirmHost />
      </>
    );
  }

  // Conta de tela (só leitura): ela existe só para mostrar o display.
  if (state.mode === 'cloud' && state.cloud.readOnly && route.name !== 'display-tela') {
    return (
      <>
        <Suspense fallback={<PageLoading />}>
          <ViewerNotice />
        </Suspense>
        <ToastRegion />
        <ConfirmHost />
      </>
    );
  }

  // Tela do display: só o conteúdo, sem menus (para o aparelho e-ink).
  if (route.name === 'display-tela') {
    return (
      <>
        <RecurringTasks />
        <Suspense fallback={<PageLoading />}>
          <DisplayScreen params={route.params} />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <a class="skip-link" href="#conteudo" onClick={(e) => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>
        Pular para o conteúdo
      </a>
      <header class="app-header">
        <div class="header-inner">
          <a class="brand" href="#/cardapio" aria-label="PanelAI — início">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="34" height="34" />
            <span class={`brand-name ${showWeek ? '' : 'always'}`}>
              Panel<b>AI</b>
            </span>
          </a>
          <nav class="top-nav" aria-label="Módulos">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.path}`} aria-current={section === n.id ? 'page' : undefined}>
                <n.icon size={18} />
                <span class="nav-long">{n.long}</span>
                <span class="nav-short">{n.short}</span>
                {n.id === 'compras' && <ShoppingCount weekId={weekId} cls="count" />}
              </a>
            ))}
          </nav>
          <div class="header-spacer" />
          {!online && (
            <span class="offline-pill" title="Sem conexão — seus dados continuam salvos neste aparelho">
              <CloudOff size={14} /> <span class="hide-mobile">Offline</span>
            </span>
          )}
          <SaveIndicator online={online} />
          {showWeek && <WeekSelector />}
          <div class="header-actions">
            <a
              class="icon-btn"
              href="#/display"
              aria-label="Display e-ink"
              title="Display e-ink"
              aria-current={section === 'display' ? 'page' : undefined}
            >
              <MonitorSmartphone size={20} />
            </a>
            <a
              class="icon-btn"
              href="#/ajustes"
              aria-label="Configurações"
              title="Configurações"
              aria-current={section === 'ajustes' || section === 'historico' ? 'page' : undefined}
            >
              <Settings size={20} />
            </a>
          </div>
        </div>
      </header>

      {state.mode === 'demo' && <DemoBanner />}

      {state.loadError && (
        <div class="main" style="padding-bottom:0">
          <div class="notice">
            <TriangleAlert size={18} /> Não foi possível abrir os dados salvos: {state.loadError}
          </div>
        </div>
      )}

      <main id="conteudo" class="main" tabIndex={-1}>
        <Suspense fallback={<PageLoading />}>
          <Route route={route} weekId={weekId} />
        </Suspense>
      </main>

      <nav class="bottom-nav" aria-label="Módulos">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.path}`} aria-current={section === n.id ? 'page' : undefined}>
            <span class="pill">
              <n.icon size={21} strokeWidth={section === n.id ? 2.2 : 1.8} />
            </span>
            {n.short}
            {n.id === 'compras' && <ShoppingCount weekId={weekId} cls="nav-badge" label />}
          </a>
        ))}
      </nav>

      <ToastRegion />
      <ConfirmHost />
      <RecurringTasks />
      <ScreenAutoUpdate />
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
  );
}

/** Modo de teste: lembra que os dados são de exemplo e ficam só neste navegador. */
function DemoBanner() {
  return (
    <div class="demo-banner" role="note">
      <span class="grow">
        <FlaskConical size={16} /> <span>
          <strong>Modo de teste</strong> — dados de exemplo, salvos só neste navegador.
        </span>
      </span>
      <button type="button" class="btn btn-secondary" onClick={exitDemo}>
        <LogIn size={16} /> Entrar na conta
      </button>
    </div>
  );
}

/** Abertura: carregando ou, na nuvem, aguardando a primeira sincronização. */
function BootScreen({ waiting, online }) {
  return (
    <div class="boot" role="status" aria-live="polite">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="72" height="72" />
      {waiting ? (
        <>
          <p>
            <WifiOff size={16} /> Aguardando a primeira sincronização
          </p>
          <p class="small muted" style="max-width:320px;text-align:center">
            Os dados da casa ainda não foram baixados neste aparelho.{' '}
            {online ? 'A conexão com a nuvem está lenta; o PanelAI abre assim que os dados chegarem.' : 'Conecte-se à internet; o PanelAI abre sozinho quando os dados chegarem.'}
          </p>
          <button type="button" class="btn btn-secondary" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </>
      ) : (
        <p>Carregando o PanelAI…</p>
      )}
    </div>
  );
}

/** Quantos itens faltam comprar (barra de navegação). Componente próprio para não redesenhar a tela inteira. */
function ShoppingCount({ weekId, cls, label = false }) {
  const { list } = useWeekShopping(weekId);
  const n = list?.summary.remaining;
  if (!n) return null;
  return (
    <span class={cls} aria-label={label ? `${n} itens` : undefined}>
      {n}
    </span>
  );
}

/**
 * Tarefas fixas da semana atual e da próxima: criadas ao abrir o app (inclusive
 * na tela do display, que ninguém abre na aba Tarefas) e conferidas de hora em
 * hora para virar o dia/semana com o aparelho ligado. Na nuvem, só depois da
 * confirmação do servidor.
 */
function RecurringTasks() {
  const s = useStore();
  const allowed = canGenerateRecurring(s);
  const templates = s.taskTemplates;
  useEffect(() => {
    if (!allowed) return undefined;
    ensureRecurringAround();
    const t = setInterval(() => ensureRecurringAround(), 3600_000);
    return () => clearInterval(t);
  }, [allowed, templates]);
  return null;
}

function Route({ route, weekId }) {
  switch (route.name) {
    case 'compras':
      return <ShoppingPage weekId={weekId} />;
    case 'despensa':
      return <PantryPage tab={route.arg ?? 'estoque'} weekId={weekId} />;
    case 'receitas':
      return <RecipesPage params={route.params} />;
    case 'receita':
      return <RecipeDetailPage id={route.arg} />;
    case 'receita-nova':
      return <RecipeFormPage id={null} />;
    case 'receita-editar':
      return <RecipeFormPage id={route.arg} />;
    case 'ajustes':
      return <SettingsPage />;
    case 'historico':
      return <HistoryPage />;
    case 'tarefas':
      return <TasksPage />;
    case 'display':
      return <DisplayPage />;
    default:
      return <MenuPage weekId={weekId} />;
  }
}

function SaveIndicator({ online }) {
  const state = useStore();
  const status = state.saveStatus;
  const persistent = state.persistent;
  const cloud = state.mode === 'cloud' ? state.cloud : null;
  if (cloud && status !== 'error') {
    const s = cloud.error
      ? { icon: TriangleAlert, text: 'Erro na nuvem', cls: 'error', title: cloud.error }
      : cloud.pending > 0
        ? online
          ? { icon: CloudUpload, text: 'Sincronizando…', cls: 'saving', title: 'Enviando alterações para a nuvem' }
          : { icon: CloudUpload, text: 'Salvo no aparelho', cls: 'saving', title: 'Sem internet: as alterações serão enviadas quando a conexão voltar' }
        : { icon: CloudCheck, text: 'Sincronizado', cls: 'saved', title: 'Tudo salvo na nuvem da casa' };
    return (
      <span class={`save-indicator ${s.cls}`} role="status" aria-live="polite" title={s.title}>
        <s.icon size={14} /> <span class="text">{s.text}</span>
      </span>
    );
  }
  if (!persistent) {
    return (
      <span class="save-indicator error" title="O navegador bloqueou o armazenamento local. Os dados serão perdidos ao fechar.">
        <TriangleAlert size={14} /> <span class="text">Sem armazenamento</span>
      </span>
    );
  }
  const map = {
    saved: { icon: Check, text: 'Salvo' },
    saving: { icon: Loader2, text: 'Salvando…' },
    error: { icon: TriangleAlert, text: 'Erro ao salvar' },
  };
  const s = map[status] ?? map.saved;
  return (
    <span class={`save-indicator ${status}`} role="status" aria-live="polite" title={s.text}>
      <s.icon size={14} /> <span class="text">{s.text}</span>
    </span>
  );
}

export { NAV };
