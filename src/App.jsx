import { useEffect, useState } from 'preact/hooks';
import { BookOpen, CalendarDays, Check, Cloud, CloudAlert, CloudOff, Loader2, Package, RefreshCw, Settings, ShoppingCart, StickyNote, TriangleAlert } from 'lucide-preact';
import { useStore } from './storage/store.js';
import { useSyncStatus } from './storage/sync.js';
import { useRoute, navigate } from './utils/router.js';
import { useWeekId, shiftWeek, goToCurrentWeek } from './storage/ui.js';
import { useOnline } from './utils/hooks.js';
import { ToastRegion, ConfirmHost, Modal } from './components/ui.jsx';
import { WeekSelector } from './components/WeekSelector.jsx';
import { MenuPage } from './pages/MenuPage.jsx';
import { ShoppingPage } from './pages/ShoppingPage.jsx';
import { PantryPage } from './pages/PantryPage.jsx';
import { RecipesPage } from './pages/RecipesPage.jsx';
import { RecipeDetailPage } from './pages/RecipeDetailPage.jsx';
import { RecipeFormPage } from './pages/RecipeFormPage.jsx';
import { NotesPage } from './pages/NotesPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { useWeekShopping } from './pages/useWeekData.js';

const NAV = [
  { id: 'cardapio', path: '/cardapio', long: 'Cardápio', short: 'Cardápio', icon: CalendarDays },
  { id: 'compras', path: '/compras', long: 'Lista da semana', short: 'Compras', icon: ShoppingCart },
  { id: 'despensa', path: '/despensa', long: 'Mercado do mês', short: 'Despensa', icon: Package },
  { id: 'receitas', path: '/receitas', long: 'Receitas', short: 'Receitas', icon: BookOpen },
  { id: 'recados', path: '/recados', long: 'Recados', short: 'Recados', icon: StickyNote },
];

function navSection(routeName) {
  if (routeName.startsWith('receita')) return 'receitas';
  return routeName;
}

const isTyping = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function App() {
  const state = useStore();
  const route = useRoute();
  const weekId = useWeekId();
  const online = useOnline();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const section = navSection(route.name);
  const { list } = useWeekShopping(weekId);

  // Atalhos de teclado (desktop)
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= NAV.length) {
        navigate(NAV[n - 1].path);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && ['cardapio', 'compras'].includes(section)) {
        shiftWeek(-1);
      } else if (e.key === 'ArrowRight' && ['cardapio', 'compras'].includes(section)) {
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

  const counts = { compras: list?.summary.remaining || null };
  const showWeek = ['cardapio', 'compras'].includes(route.name);

  if (!state.ready) {
    return (
      <div class="boot" role="status">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width="72" height="72" />
        <p>Carregando o PanelAI…</p>
      </div>
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
                {counts[n.id] ? <span class="count">{counts[n.id]}</span> : null}
              </a>
            ))}
          </nav>
          <div class="header-spacer" />
          {!online && (
            <span class="offline-pill" title="Sem conexão — seus dados continuam salvos neste aparelho">
              <CloudOff size={14} /> <span class="hide-mobile">Offline</span>
            </span>
          )}
          <SaveIndicator status={state.saveStatus} persistent={state.persistent} />
          <SyncIndicator />
          {showWeek && <WeekSelector />}
          <div class="header-actions">
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

      {state.loadError && (
        <div class="main" style="padding-bottom:0">
          <div class="notice">
            <TriangleAlert size={18} /> Não foi possível abrir os dados salvos: {state.loadError}
          </div>
        </div>
      )}

      <main id="conteudo" class="main" tabIndex={-1}>
        <Route route={route} weekId={weekId} />
      </main>

      <nav class="bottom-nav" aria-label="Módulos">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.path}`} aria-current={section === n.id ? 'page' : undefined}>
            <span class="pill">
              <n.icon size={21} strokeWidth={section === n.id ? 2.2 : 1.8} />
            </span>
            {n.short}
            {counts[n.id] ? <span class="nav-badge" aria-label={`${counts[n.id]} itens`}>{counts[n.id]}</span> : null}
          </a>
        ))}
      </nav>

      <ToastRegion />
      <ConfirmHost />
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </>
  );
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
    case 'recados':
      return <NotesPage />;
    case 'ajustes':
      return <SettingsPage params={route.params} />;
    case 'historico':
      return <HistoryPage />;
    default:
      return <MenuPage weekId={weekId} />;
  }
}

function SaveIndicator({ status, persistent }) {
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

/** Estado da sincronização na nuvem (só aparece quando o aparelho está conectado a uma casa). */
function SyncIndicator() {
  const sync = useSyncStatus();
  if (!sync.connected) return null;
  const map = {
    syncing: { icon: RefreshCw, text: 'Sincronizando…' },
    error: { icon: CloudAlert, text: 'Erro na sincronização' },
    offline: { icon: CloudOff, text: 'Sem conexão com a nuvem — as alterações serão enviadas depois' },
  };
  const s = map[sync.state] ?? { icon: Cloud, text: 'Sincronizado com a nuvem' };
  return (
    <a class={`sync-pill ${sync.state}`} href="#/ajustes" role="status" title={s.text} aria-label={s.text}>
      <s.icon size={15} />
    </a>
  );
}

const SHORTCUTS = [
  ['1 – 5', 'Ir para Cardápio, Lista, Mercado, Receitas e Recados'],
  ['← / →', 'Semana anterior / próxima'],
  ['T', 'Voltar para a semana atual'],
  ['/', 'Buscar na tela atual'],
  ['N', 'Nova receita (em Receitas)'],
  ['Esc', 'Fechar janelas'],
  ['?', 'Mostrar esta ajuda'],
];

export function ShortcutsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" size="sm">
      <table class="table">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td class="nowrap">
                <span class="kbd">{k}</span>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

export { NAV };
