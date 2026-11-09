// Configurações, dados (exportar/importar) e informações do aplicativo.

import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, Upload, History, Keyboard, RotateCcw, Eraser, Smartphone, HardDrive, Info } from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { updateSettings, exportData, importData, resetDemo, startFresh } from '../storage/actions.js';
import { validateBackup } from '../services/backup.js';
import { WEEKDAY_SHORT, todayISO } from '../utils/dates.js';
import { usePref } from '../utils/hooks.js';
import { Chip, Segmented, Stepper, toast, confirmDialog } from '../components/ui.jsx';
import { ShortcutsModal } from '../App.jsx';
import { getInstallPrompt, onInstallPromptChange } from '../utils/install.js';

const MARKET_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function SettingsPage() {
  const s = useStore();
  const [mobileView, setMobileView] = usePref('menuMobileView', 'day');
  const [shortcuts, setShortcuts] = useState(false);
  const [importErrors, setImportErrors] = useState([]);
  const [usage, setUsage] = useState(null);
  const [installable, setInstallable] = useState(!!getInstallPrompt());
  const fileRef = useRef(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e)).catch(() => {});
    return onInstallPromptChange(() => setInstallable(!!getInstallPrompt()));
  }, []);

  const toggleMarket = (d) => {
    const set = new Set(s.settings.marketDays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    updateSettings({ marketDays: [...set].sort() });
  };

  const doExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `panelai-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup exportado');
  };

  const doImport = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setImportErrors([]);
    if (file.size > 30 * 1024 * 1024) return setImportErrors(['Arquivo grande demais (máx. 30 MB).']);
    const text = await file.text();
    const result = validateBackup(text);
    if (!result.ok) {
      setImportErrors(result.errors);
      toast('Arquivo inválido: nada foi alterado', { type: 'error' });
      return;
    }
    const d = result.data;
    const ok = await confirmDialog({
      title: 'Importar dados',
      message: `O arquivo tem ${Object.keys(d.recipes).length} receitas, ${Object.keys(d.weeks).length} semanas e ${Object.keys(d.pantry).length} produtos na despensa. Os dados atuais deste aparelho serão substituídos. Recomendamos exportar um backup antes.`,
      confirmLabel: 'Substituir dados',
      danger: true,
    });
    if (!ok) return;
    await importData(d);
    toast('Dados importados');
  };

  const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div style="max-width:880px">
      <div class="page-head">
        <div class="grow">
          <h1>Configurações</h1>
          <p class="sub">Preferências, backup e histórico</p>
        </div>
        <a class="btn btn-secondary" href="#/historico">
          <History size={16} /> Histórico
        </a>
      </div>

      <section class="card card-pad form-section" aria-labelledby="pref">
        <h2 id="pref" class="section-title" style="margin:0">Preferências</h2>
        <div class="field">
          <span class="label">Pessoas na casa</span>
          <Stepper value={s.settings.people} min={1} max={20} unit="pessoas" label="Pessoas na casa" onChange={(v) => updateSettings({ people: v })} />
          <span class="hint">Número padrão de porções ao adicionar uma receita. Cada refeição pode ser ajustada.</span>
        </div>
        <div class="field">
          <span class="label">Dias de mercado</span>
          <div class="chip-row" role="group" aria-label="Dias de mercado">
            {MARKET_ORDER.map((d) => (
              <Chip key={d} pressed={s.settings.marketDays.includes(d)} onClick={() => toggleMarket(d)}>
                {WEEKDAY_SHORT[d]}
              </Chip>
            ))}
          </div>
          <span class="hint">A lista da semana é dividida pelo último dia de mercado antes de cada refeição.</span>
        </div>
        <label class="switch">
          <input type="checkbox" checked={s.settings.trackSnacks} onChange={(e) => updateSettings({ trackSnacks: e.currentTarget.checked })} />
          <span>
            Contar lanches vazios como pendência
            <span class="xsmall muted" style="display:block">Por padrão, apenas almoço e jantar contam no indicador de planejamento.</span>
          </span>
        </label>
        <div class="field">
          <span class="label">Cardápio no celular abre em</span>
          <Segmented
            options={[
              { id: 'day', label: 'Um dia por vez' },
              { id: 'week', label: 'Resumo da semana' },
            ]}
            value={mobileView}
            onChange={setMobileView}
            label="Visualização padrão no celular"
          />
        </div>
      </section>

      <section class="card card-pad form-section" style="margin-top:16px" aria-labelledby="dados">
        <h2 id="dados" class="section-title" style="margin:0">Dados e backup</h2>
        <div class="notice info">
          <HardDrive size={18} />
          <span>
            Tudo fica salvo neste navegador (IndexedDB) e funciona sem internet. Não há sincronização automática entre aparelhos: para levar seus dados a outro aparelho, exporte aqui e importe lá.
            {usage?.usage != null && ` Uso atual: ${fmtMB(usage.usage)}.`}
          </span>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" onClick={doExport}>
            <Download size={16} /> Exportar (JSON)
          </button>
          <button type="button" class="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Importar
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" class="sr-only" onChange={doImport} aria-label="Arquivo de backup" />
        </div>
        {importErrors.length > 0 && (
          <div class="notice" role="alert" style="background:var(--danger-light);color:var(--danger)">
            <div>
              <strong>O arquivo não foi importado:</strong>
              <ul style="margin:4px 0 0;padding-left:18px">
                {importErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div class="divider" />
        <div class="toolbar">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Restaurar demonstração',
                message: 'Substitui todos os dados atuais pelas receitas, despensa e cardápio de exemplo.',
                confirmLabel: 'Restaurar',
                danger: true,
              });
              if (ok) {
                await resetDemo();
                toast('Dados de demonstração restaurados');
              }
            }}
          >
            <RotateCcw size={16} /> Restaurar demonstração
          </button>
          <button
            type="button"
            class="btn btn-danger-ghost"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Começar do zero',
                message: 'Apaga cardápios, despensa, marmitas e histórico. Receitas e catálogo de ingredientes são mantidos.',
                confirmLabel: 'Apagar',
                danger: true,
              });
              if (ok) {
                await startFresh();
                toast('Pronto para começar');
              }
            }}
          >
            <Eraser size={16} /> Começar do zero
          </button>
        </div>
      </section>

      <section class="card card-pad form-section" style="margin-top:16px" aria-labelledby="app">
        <h2 id="app" class="section-title" style="margin:0">Aplicativo</h2>
        <div class="toolbar">
          {installable && (
            <button
              type="button"
              class="btn btn-soft"
              onClick={async () => {
                const p = getInstallPrompt();
                if (!p) return;
                p.prompt();
                await p.userChoice.catch(() => {});
              }}
            >
              <Smartphone size={16} /> Instalar PanelAI
            </button>
          )}
          <button type="button" class="btn btn-secondary hide-mobile" onClick={() => setShortcuts(true)}>
            <Keyboard size={16} /> Atalhos de teclado
          </button>
        </div>
        {!installable && (
          <p class="small muted">
            Para instalar: no Android/Chrome use "Instalar app" no menu do navegador; no iPhone, toque em Compartilhar → "Adicionar à Tela de Início".
          </p>
        )}
        <p class="small muted" style="display:flex;gap:6px;align-items:center">
          <Info size={14} /> PanelAI 1.0 · dados locais · sem envio de informações para servidores.
        </p>
      </section>
      <ShortcutsModal open={shortcuts} onClose={() => setShortcuts(false)} />
    </div>
  );
}
