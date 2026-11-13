// Testes de ponta a ponta e de responsividade com Playwright.
// Uso: npm run build && npm run test:e2e
// Requer o pacote "playwright" com Chromium disponível no ambiente
// (não é dependência do projeto para manter o CI leve).

import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeInvite } from '../../src/services/sync.js';
import { startSyncServer } from './sync-server.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/output');
const PORT = 4321;
const BASE = `http://localhost:${PORT}/PanelAI/`;

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}
let currentPage = null;
async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail ?? '');
  } catch (err) {
    record(name, false, String(err?.message ?? err).split('\n')[0]);
    const file = `FALHA-${name.replace(/[^a-z0-9]+/gi, '-')}.png`;
    await currentPage?.screenshot({ path: path.join(outDir, file) }).catch(() => {});
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return proc;
    } catch {
      /* aguardando */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error('Servidor de preview não iniciou');
}

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function newPage(browser, opts) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text()));
  await page.goto(`${BASE}#/cardapio`);
  await page.getByRole('heading', { name: 'Cardápio' }).waitFor();
  return { ctx, page };
}

const RECIPE = 'Frango teste E2E';

async function flows(browser, label, opts) {
  const mobile = label === 'mobile';
  const { ctx, page } = await newPage(browser, opts);
  currentPage = page;
  const shot = (n) => page.screenshot({ path: path.join(outDir, `${label}-${n}.png`) });

  await step(`[${label}] 1. criar receita`, async () => {
    await page.goto(`${BASE}#/receitas/nova`);
    await page.getByLabel('Nome *').fill(RECIPE);
    await page.getByLabel('Rende (porções) *').fill('4');
    await page.getByLabel('Proteína principal').selectOption('frango');
    await page.getByRole('button', { name: 'Adicionar ingrediente' }).click();
    const ing = page.getByLabel('Ingrediente 1', { exact: true });
    await ing.fill('Peito de frango');
    await ing.blur();
    await page.getByLabel('Quantidade do ingrediente 1').fill('300');
    await page.getByLabel('Um passo por linha').fill('Tempere\nGrelhe');
    await shot('recipe-form');
    await page.getByRole('button', { name: 'Salvar receita' }).click();
    await page.getByRole('heading', { name: RECIPE, level: 1 }).waitFor({ timeout: 4000 });
    await shot('recipe-detail');
  });

  await step(`[${label}] 2. selecionar refeição (Domingo, jantar)`, async () => {
    await page.goto(`${BASE}#/cardapio`);
    if (mobile) {
      await page.getByRole('tab', { name: /^Domingo/ }).click();
      await page.getByRole('region', { name: 'Jantar' }).getByRole('button', { name: /Definir refeição/ }).click();
    } else {
      await page.getByRole('button', { name: 'Adicionar jantar em Domingo' }).click();
    }
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox', { name: 'Buscar receita' }).fill('teste E2E');
    await dialog.getByRole('option', { name: new RegExp(RECIPE) }).click();
    await shot('picker');
    await dialog.getByRole('button', { name: /^Adicionar$/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${RECIPE}`) }).first().waitFor();
  });

  await step(`[${label}] 3. alterar porções (2 → 3)`, async () => {
    await page.getByRole('button', { name: new RegExp(`^${RECIPE}`) }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Aumentar Porções' }).click();
    const v = await dialog.getByRole('textbox', { name: 'Porções' }).inputValue();
    assert(v === '3', `porções = ${v}`);
    await shot('entry-detail');
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  });

  await step(`[${label}] 4. navegar entre semanas`, async () => {
    const before = await page.getByRole('button', { name: /Escolher outra semana/ }).innerText();
    await page.getByRole('button', { name: 'Próxima semana' }).click();
    const after = await page.getByRole('button', { name: /Escolher outra semana/ }).innerText();
    assert(before !== after && after.includes('Próxima semana'), `${before} → ${after}`);
    await page.getByRole('button', { name: 'Semana anterior' }).click();
    return after.replace(/\n/g, ' ');
  });

  await step(`[${label}] 5. gerar lista (peito de frango consolidado)`, async () => {
    await page.goto(`${BASE}#/compras`);
    const row = page.getByRole('checkbox', { name: /^Peito de frango/ });
    await row.waitFor();
    const text = await row.innerText();
    // Demo: 600×2/4 (frango grelhado) + 600×2/4 (strogonoff) + 150×2/2 (sanduíche) + 300×3/4 (teste) = 975 g; estoque 500 g → 475 → 480 g
    assert(/480 g/.test(text), text.replace(/\n/g, ' '));
    await shot('shopping');
    return '480 g a comprar (975 g − 500 g em estoque)';
  });

  await step(`[${label}] 6. rastreabilidade do ingrediente`, async () => {
    await page.getByRole('button', { name: 'Detalhes de Peito de frango' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText(RECIPE).waitFor();
    const total = await dialog.getByText('975 g').count();
    assert(total >= 1, 'total 975 g não encontrado');
    await shot('trace');
    await dialog.getByRole('button', { name: 'Fechar' }).click();
  });

  await step(`[${label}] 7. marcar itens comprados`, async () => {
    const row = page.getByRole('checkbox', { name: /^Peito de frango/ });
    await row.click();
    assert((await row.getAttribute('aria-checked')) === 'true', 'não marcou');
    const cebola = page.getByRole('checkbox', { name: /^Cebola/ }).first();
    await cebola.click();
    await shot('shopping-checked');
  });

  await step(`[${label}] 8. registrar compra (atualiza estoque, sem duplicar)`, async () => {
    await page.getByRole('button', { name: /Registrar/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Atualizar estoque' }).click();
    await page.getByText(/Estoque atualizado com 2 itens/).waitFor();
    const disabled = await page.getByRole('button', { name: /Registrar/ }).first().isDisabled();
    assert(disabled, 'botão de registro deveria ficar desabilitado após o lançamento');
  });

  await step(`[${label}] 9. atualizar estoque (stepper + histórico)`, async () => {
    await page.goto(`${BASE}#/despensa/estoque`);
    await page.getByRole('searchbox', { name: 'Buscar produto' }).fill('Ovos');
    const input = page.getByRole('textbox', { name: 'Quantidade de Ovos' });
    const before = Number(await input.inputValue());
    await page.getByRole('button', { name: 'Aumentar Quantidade de Ovos' }).click();
    await page.waitForTimeout(1000);
    const after = Number(await input.inputValue());
    assert(after === before + 1, `${before} → ${after}`);
    await shot('pantry');
  });

  await step(`[${label}] 10. contagem da despensa`, async () => {
    await page.goto(`${BASE}#/despensa/contagem`);
    await page.getByRole('textbox', { name: /Quantidade contada de Sal/ }).fill('0,8');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Atualizar estoque' }).click();
    await page.getByText(/Contagem registrada/).waitFor();
  });

  await step(`[${label}] 11. compra mensal (finalizar uma única vez)`, async () => {
    await page.goto(`${BASE}#/despensa/mercado`);
    await page.getByRole('checkbox', { name: 'Comprado: Detergente' }).check();
    await shot('monthly');
    await page.getByRole('button', { name: 'Finalizar compra' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Atualizar estoque' }).click();
    await page.getByText(/Compra registrada/).waitFor();
    assert(await page.getByRole('button', { name: 'Finalizar compra' }).isDisabled(), 'deveria esvaziar o carrinho');
  });

  let exported = null;
  await step(`[${label}] 12. exportar dados`, async () => {
    await page.goto(`${BASE}#/ajustes`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar (JSON)' }).click()]);
    exported = path.join(outDir, `${label}-backup.json`);
    await download.saveAs(exported);
    const json = JSON.parse(await readFile(exported, 'utf8'));
    assert(json.app === 'PanelAI' && json.data.recipes.some((r) => r.name === RECIPE), 'conteúdo inesperado');
    return `${json.data.recipes.length} receitas, ${json.data.movements.length} movimentações`;
  });

  await step(`[${label}] 13. importar dados (inválido é recusado; válido restaura)`, async () => {
    await page.getByLabel('Arquivo de backup').setInputFiles({ name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"x"}') });
    await page.getByText('O arquivo não foi importado:').waitFor();
    // Restaura a demonstração e importa o backup: a receita criada deve voltar.
    await page.getByRole('button', { name: 'Restaurar demonstração' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restaurar' }).click();
    await page.getByText('Dados de demonstração restaurados').waitFor();
    await page.getByLabel('Arquivo de backup').setInputFiles(exported);
    await page.getByRole('dialog').getByRole('button', { name: 'Substituir dados' }).click();
    await page.getByText('Dados importados').waitFor();
    await page.goto(`${BASE}#/receitas`);
    await page.getByRole('searchbox', { name: 'Buscar receitas' }).fill('teste E2E');
    await page.getByRole('heading', { name: RECIPE }).waitFor();
  });

  await step(`[${label}] 14. persistência após recarregar`, async () => {
    await page.goto(`${BASE}#/cardapio`);
    await page.reload();
    const ready = await page.getByRole('heading', { name: 'Cardápio' }).waitFor({ timeout: 6000 }).then(() => true, () => false);
    if (!ready && process.env.E2E_DEBUG) {
      const diag = await page.evaluate(async () => {
        const res = performance.getEntriesByType('resource').map((r) => r.name.split('/').pop() + ':' + Math.round(r.duration));
        const idb = await Promise.race([
          new Promise((ok) => { const r = indexedDB.open('panelai', 1); r.onsuccess = () => { r.result.close(); ok('open ok'); }; r.onerror = () => ok('err ' + r.error); r.onblocked = () => ok('blocked'); }),
          new Promise((ok) => setTimeout(() => ok('open timeout'), 3000)),
        ]);
        return { res, idb, ctrl: !!navigator.serviceWorker.controller, boot: globalThis.__panelaiBoot };
      });
      console.log('DIAG', JSON.stringify(diag));
    }
    if (mobile) await page.getByRole('tab', { name: /^Domingo/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${RECIPE}`) }).first().waitFor({ timeout: 4000 });
  });

  if (mobile) {
    await step(`[${label}] 15. navegação inferior não cobre o conteúdo`, async () => {
      await page.goto(`${BASE}#/compras`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
        // Último bloco visível do conteúdo (cartões e seções)
        const blocks = [...document.querySelectorAll('#conteudo .card, #conteudo .cat-block')].filter((el) => el.offsetParent);
        const lastBottom = Math.max(...blocks.map((el) => el.getBoundingClientRect().bottom));
        return { navTop: nav.top, lastBottom };
      });
      assert(r.lastBottom <= r.navTop, JSON.stringify(r));
      return `último controle termina em ${Math.round(r.lastBottom)}px, navegação começa em ${Math.round(r.navTop)}px`;
    });

    await step(`[${label}] 16. modal com teclado virtual (viewport reduzido)`, async () => {
      await page.goto(`${BASE}#/cardapio`);
      await page.getByRole('region', { name: 'Almoço' }).getByRole('button', { name: /Adicionar mais|Definir/ }).click();
      const search = page.getByRole('dialog').getByRole('searchbox', { name: 'Buscar receita' });
      await search.focus();
      // Simula o teclado ocupando ~45% da tela (o layout é redimensionado: interactive-widget=resizes-content).
      const vp = page.viewportSize();
      await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
      await page.waitForTimeout(400);
      const box = await page.getByRole('dialog').getByRole('button', { name: /^Adicionar$/ }).boundingBox();
      const h = page.viewportSize().height;
      await shot('picker-keyboard');
      await page.setViewportSize(vp);
      assert(box && box.y + box.height <= h, `botão em ${box?.y}, viewport ${h}`);
      await page.keyboard.press('Escape');
    });

    await step(`[${label}] 17. orientação paisagem preserva estado`, async () => {
      await page.goto(`${BASE}#/compras`);
      const row = page.getByRole('checkbox', { name: /^Alface/ }).first();
      await row.click();
      const vp = page.viewportSize();
      await page.setViewportSize({ width: vp.height, height: vp.width });
      await page.waitForTimeout(300);
      const ov = await overflowX(page);
      const still = await page.getByRole('checkbox', { name: /^Alface/ }).first().getAttribute('aria-checked');
      await shot('landscape');
      await page.setViewportSize(vp);
      assert(ov <= 0 && still === 'true', `overflow ${ov}, marcado ${still}`);
    });

    await step(`[${label}] 18. gesto de deslizar troca o dia (complementar)`, async () => {
      await page.goto(`${BASE}#/cardapio`);
      await page.getByRole('tab', { name: /^Quarta/ }).click();
      const panel = page.getByRole('tabpanel');
      const b = await panel.boundingBox();
      await page.evaluate(({ x, y }) => {
        const el = document.querySelector('.day-view');
        const t = (cx) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: y });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(x + 150)], changedTouches: [t(x + 150)], bubbles: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(x)], bubbles: true }));
      }, { x: b.x + 50, y: b.y + 100 });
      const sel = await page.locator('.day-strip [aria-selected="true"]').getAttribute('aria-label');
      assert(sel.startsWith('Quinta'), sel);
    });
  } else {
    await step(`[${label}] 15. atalhos de teclado`, async () => {
      await page.goto(`${BASE}#/cardapio`);
      await page.locator('body').click({ position: { x: 5, y: 300 } });
      await page.keyboard.press('2');
      await page.getByRole('heading', { name: 'Lista da semana' }).waitFor();
      await page.keyboard.press('4');
      await page.getByRole('heading', { name: 'Receitas', level: 1 }).waitFor();
      await page.keyboard.press('5');
      await page.getByRole('heading', { name: 'Recados', level: 1 }).waitFor();
      await page.keyboard.press('4');
      await page.getByRole('heading', { name: 'Receitas', level: 1 }).waitFor();
      await page.keyboard.press('/');
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      assert(focused === 'Buscar receitas', `foco em ${focused}`);
      await page.keyboard.press('Escape');
      await page.locator('body').click({ position: { x: 5, y: 300 } });
      await page.keyboard.press('?');
      await page.getByRole('dialog', { name: 'Atalhos de teclado' }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    });

    await step(`[${label}] 16. foco visível e navegação por Tab`, async () => {
      await page.goto(`${BASE}#/cardapio`);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const shadow = await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
      assert(shadow && shadow !== 'none', 'sem indicador de foco');
    });
  }

  record(`[${label}] sem erros no console`, page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function responsive(browser) {
  const widths = [360, 390, 430, 768, 1024, 1440];
  const routes = ['cardapio', 'compras', 'despensa/estoque', 'despensa/contagem', 'despensa/mercado', 'receitas', 'receitas/strogonoff-frango', 'receitas/nova', 'recados', 'ajustes', 'historico'];
  for (const w of widths) {
    const touch = w < 900;
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 800 : 900 }, hasTouch: touch, isMobile: w < 600 });
    const page = await ctx.newPage();
    const bad = [];
    for (const r of routes) {
      await page.goto(`${BASE}#/${r}`);
      await page.waitForTimeout(350);
      const ov = await overflowX(page);
      if (ov > 0) bad.push(`${r}:+${ov}px`);
      if (['cardapio', 'compras', 'despensa/estoque', 'receitas'].includes(r)) {
        await page.screenshot({ path: path.join(outDir, `w${w}-${r.replace('/', '-')}.png`) });
      }
    }
    // Alvos de toque mínimos nos controles principais (telas de toque)
    let small = 0;
    if (touch) {
      await page.goto(`${BASE}#/compras`);
      await page.waitForTimeout(300);
      small = await page.evaluate(() =>
        [...document.querySelectorAll('.bottom-nav a, .shop-item .toggle, .shop-item .more, .week-selector .icon-btn')]
          .filter((el) => el.offsetParent)
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height < 40 || r.width < 40).length,
      );
    }
    record(`[${w}px] sem rolagem horizontal em ${routes.length} telas${touch ? ' e alvos de toque ≥ 40px' : ''}`, bad.length === 0 && small === 0, [...bad, small ? `${small} alvos pequenos` : ''].filter(Boolean).join(', '));
    await ctx.close();
  }
}

// Recados e sincronização entre dois aparelhos (computador A e celular B).
// Por padrão usa o servidor de teste em memória; PANELAI_SYNC_TEST_URL/KEY
// apontam para um servidor real com supabase/panelai.sql instalado.
async function notesAndSync(browser) {
  const fake = process.env.PANELAI_SYNC_TEST_URL ? null : await startSyncServer(4322);
  const srv = fake ?? { url: process.env.PANELAI_SYNC_TEST_URL, apiKey: process.env.PANELAI_SYNC_TEST_KEY ?? 'chave-de-teste' };
  const a = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  const b = await newPage(browser, { ...devices['Pixel 7'] });
  const A = a.page;
  const B = b.page;
  currentPage = A;

  const addNote = async (page, text) => {
    await page.goto(`${BASE}#/recados`);
    await page.getByRole('button', { name: 'Novo recado' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Recado', { exact: true }).fill(text);
    await dlg.getByRole('button', { name: 'Salvar' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.locator('.note-card', { hasText: text }).waitFor();
  };
  const syncNow = async (page) => {
    await page.goto(`${BASE}#/ajustes`);
    await page.getByRole('button', { name: 'Sincronizar agora' }).click();
    await page.waitForFunction(() => /Última sincronização/.test(document.querySelector('.sync-status')?.textContent ?? ''));
    await page.waitForTimeout(300);
  };
  const hasNote = async (page, text) => {
    await page.goto(`${BASE}#/recados`);
    await page.getByRole('heading', { name: 'Recados', level: 1 }).waitFor();
    return (await page.locator('.note-card', { hasText: text }).count()) > 0;
  };

  await step('[recados] criar, fixar, aparecer no cardápio e sobreviver ao recarregar', async () => {
    await addNote(A, 'Recado E2E do computador');
    await A.locator('.note-card', { hasText: 'Recado E2E' }).getByRole('button', { name: 'Fixar recado no topo' }).click();
    assert((await A.locator('.note-card').first().textContent()).includes('Recado E2E'), 'fixado não foi para o topo');
    await A.goto(`${BASE}#/cardapio`);
    await A.locator('.today-notes', { hasText: 'Recado E2E do computador' }).waitFor();
    await A.reload();
    await A.locator('.today-notes', { hasText: 'Recado E2E do computador' }).waitFor();
    await A.screenshot({ path: path.join(outDir, 'recados-cardapio.png') });
  });

  await step('[recados] programado para outro dia não aparece hoje; excluir e desfazer', async () => {
    await A.goto(`${BASE}#/recados`);
    await A.getByRole('button', { name: 'Novo recado' }).click();
    const dlg = A.getByRole('dialog');
    await dlg.getByLabel('Recado', { exact: true }).fill('Recado de amanhã');
    const tomorrow = await A.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await dlg.getByLabel('Aparece a partir de').fill(tomorrow);
    await dlg.getByRole('button', { name: 'Salvar' }).click();
    await A.getByRole('region', { name: 'Programados' }).locator('.note-card', { hasText: 'Recado de amanhã' }).waitFor();
    await A.locator('.note-card', { hasText: 'Recado de amanhã' }).getByRole('button', { name: 'Excluir recado' }).click();
    assert((await A.locator('.note-card', { hasText: 'Recado de amanhã' }).count()) === 0, 'não excluiu');
    await A.getByRole('button', { name: 'Desfazer' }).click();
    await A.locator('.note-card', { hasText: 'Recado de amanhã' }).waitFor();
    await A.screenshot({ path: path.join(outDir, 'recados-desktop.png') });
  });

  let invite = '';
  await step('[nuvem] A cria a casa e envia os dados', async () => {
    await A.goto(`${BASE}#/ajustes`);
    await A.locator('#sync-url').fill(srv.url);
    await A.locator('#sync-key').fill(srv.apiKey);
    await A.getByRole('button', { name: 'Criar casa com os dados deste aparelho' }).click();
    await A.getByRole('button', { name: 'Criar e enviar' }).click();
    await A.getByRole('button', { name: 'Copiar link de convite' }).waitFor({ timeout: 15000 });
    await A.locator('.sync-status', { hasText: 'Última sincronização' }).waitFor({ timeout: 15000 }); // envio inicial concluído
    const cfg = await A.evaluate(() => JSON.parse(localStorage.getItem('panelai.sync')));
    assert(cfg.cursor > 0, 'cursor não avançou');
    invite = encodeInvite(cfg);
    await A.screenshot({ path: path.join(outDir, 'nuvem-conectado.png') });
    return `cursor ${cfg.cursor}`;
  });

  await step('[nuvem] B entra pelo link de convite e recebe os dados de A', async () => {
    currentPage = B;
    await B.goto(`${BASE}#/ajustes?casa=${invite}`);
    await B.getByRole('button', { name: 'Entrar e substituir' }).click();
    await B.getByRole('button', { name: 'Copiar link de convite' }).waitFor({ timeout: 15000 });
    assert(!(await B.evaluate(() => location.hash)).includes('casa='), 'convite ficou no endereço');
    assert(await hasNote(B, 'Recado E2E do computador'), 'recado de A não chegou em B');
    await B.goto(`${BASE}#/receitas`);
    await B.getByText('Strogonoff de frango').first().waitFor();
    await B.screenshot({ path: path.join(outDir, 'nuvem-celular.png') });
  });

  await step('[nuvem] alteração em B chega em A sozinha (sem tocar em nada)', async () => {
    await addNote(B, 'Recado do celular');
    await B.waitForTimeout(2500); // envio automático após a alteração
    await A.goto(`${BASE}#/recados`);
    await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // voltar para o app
    await A.locator('.note-card', { hasText: 'Recado do celular' }).waitFor({ timeout: 8000 });
  });

  await step('[nuvem] exclusão em A some em B', async () => {
    currentPage = A;
    await A.locator('.note-card', { hasText: 'Recado do celular' }).getByRole('button', { name: 'Excluir recado' }).click();
    await syncNow(A);
    await syncNow(B);
    assert(!(await hasNote(B, 'Recado do celular')), 'recado excluído continua em B');
  });

  await step('[nuvem] alteração feita offline é enviada quando a conexão volta', async () => {
    currentPage = B;
    await b.ctx.setOffline(true);
    await addNote(B, 'Recado sem internet');
    await B.waitForTimeout(2500);
    await b.ctx.setOffline(false);
    await B.evaluate(() => window.dispatchEvent(new Event('online')));
    await B.waitForTimeout(2000);
    await syncNow(A);
    assert(await hasNote(A, 'Recado sem internet'), 'recado offline não chegou em A');
  });

  await step('[nuvem] cardápio e configurações também sincronizam; conflito: vence a alteração mais recente', async () => {
    await A.goto(`${BASE}#/ajustes`);
    await A.getByRole('button', { name: 'Aumentar Pessoas na casa' }).click();
    await A.waitForTimeout(100);
    await B.goto(`${BASE}#/ajustes`);
    await B.getByRole('button', { name: 'Aumentar Pessoas na casa' }).click();
    await B.getByRole('button', { name: 'Aumentar Pessoas na casa' }).click();
    await syncNow(B);
    await syncNow(A);
    await syncNow(B);
    const people = (p) => p.getByRole('textbox', { name: 'Pessoas na casa' }).inputValue();
    const [pa, pb] = [await people(A), await people(B)];
    assert(pa === '4' && pb === '4', `A=${pa} B=${pb}`);
  });

  await step('[quadro] token só de leitura devolve refeições e recados do dia', async () => {
    currentPage = A;
    await A.goto(`${BASE}#/ajustes`);
    await A.getByRole('button', { name: 'Dados para o quadro' }).click();
    const dlg = A.getByRole('dialog', { name: 'Dados para o quadro' });
    await dlg.waitFor({ timeout: 15000 });
    const text = await dlg.locator('.panel-access').textContent();
    const endpoint = /Endereço: (\S+)/.exec(text)[1];
    const token = /Token do quadro: (\S+)/.exec(text)[1];
    assert((await dlg.textContent()).includes('Recado E2E do computador'), 'prévia sem o recado');
    await A.screenshot({ path: path.join(outDir, 'quadro-dados.png') });
    await dlg.getByRole('button', { name: 'Fechar', exact: true }).last().click();

    const call = (body) => fetch(endpoint, { method: 'POST', headers: { apikey: srv.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const panel = await (await call({ p_token: token })).json();
    assert(panel.notes.some((n) => n.text === 'Recado E2E do computador' && n.pinned), 'recado fixado ausente');
    assert(!panel.notes.some((n) => n.text === 'Recado de amanhã'), 'recado de amanhã não deveria aparecer hoje');
    assert(Array.isArray(panel.meals) && Array.isArray(panel.tomorrow) && panel.version && panel.date, 'formato inesperado');
    // A semana de demonstração tem strogonoff no almoço de terça.
    const monday = new Date(`${panel.date}T12:00:00`);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 1);
    const tue = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const tuesday = await (await call({ p_token: token, p_date: tue })).json();
    const lunch = tuesday.meals.find((m) => m.slot === 'almoco');
    assert(lunch?.items.includes('Strogonoff de frango'), `almoço de terça: ${JSON.stringify(tuesday.meals)}`);
    assert((await call({ p_token: 'token-errado' })).status === 400, 'token errado deveria ser recusado');
    const cfg = await A.evaluate(() => JSON.parse(localStorage.getItem('panelai.sync')));
    assert((await call({ p_token: cfg.code })).status === 400, 'o código da casa não deveria servir como token');
    return `${panel.meals.length} refeições hoje, ${panel.notes.length} recados`;
  });

  await step('[nuvem] desconectar mantém os dados e para de sincronizar', async () => {
    await B.goto(`${BASE}#/ajustes`);
    await B.getByRole('button', { name: 'Desconectar' }).click();
    await B.getByRole('dialog').getByRole('button', { name: 'Desconectar' }).click();
    await B.getByRole('button', { name: 'Criar casa com os dados deste aparelho' }).waitFor();
    assert((await B.evaluate(() => localStorage.getItem('panelai.sync'))) === null, 'configuração não foi removida');
    assert(await hasNote(B, 'Recado sem internet'), 'dados locais sumiram');
  });

  await step('[nuvem] chave errada mostra erro claro e não altera nada', async () => {
    await B.goto(`${BASE}#/ajustes`);
    await B.locator('#sync-url').fill(srv.url);
    await B.locator('#sync-key').fill('chave-errada');
    await B.getByRole('button', { name: 'Criar casa com os dados deste aparelho' }).click();
    await B.getByRole('button', { name: 'Criar e enviar' }).click();
    await B.getByRole('alert').filter({ hasText: /chave pública|Erro do servidor/ }).waitFor();
    assert((await B.evaluate(() => localStorage.getItem('panelai.sync'))) === null, 'conectou com chave errada');
  });

  const ignore = (e) => /Failed to load resource|ERR_INTERNET_DISCONNECTED|401/.test(e);
  const errs = [...A.errors, ...B.errors].filter((e) => !ignore(e));
  record('[nuvem] sem erros no console', errs.length === 0, errs.slice(0, 3).join(' | '));
  await a.ctx.close();
  await b.ctx.close();
  fake?.close();
}

async function offline(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  await step('[pwa] funciona offline após o primeiro acesso', async () => {
    await page.goto(`${BASE}#/cardapio`);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    });
    await page.waitForTimeout(1000);
    await ctx.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Cardápio' }).waitFor({ timeout: 5000 });
    await page.goto(`${BASE}#/receitas`);
    await page.getByRole('heading', { name: 'Receitas', level: 1 }).waitFor();
    await page.screenshot({ path: path.join(outDir, 'offline.png') });
    await ctx.setOffline(false);
  });
  await step('[pwa] manifesto e ícones', async () => {
    const res = await page.request.get(`${BASE}manifest.webmanifest`);
    const m = await res.json();
    assert(m.name.startsWith('PanelAI') && m.icons.length >= 3, 'manifesto incompleto');
    for (const i of m.icons) {
      const r = await page.request.get(`${BASE}${i.src}`);
      assert(r.ok(), `${i.src} ${r.status()}`);
    }
  });
  await ctx.close();
}

await mkdir(outDir, { recursive: true });
const server = await startServer();
const browser = await chromium.launch();
try {
  // PANELAI_E2E_ONLY=nuvem roda só recados e sincronização (mais rápido ao mexer nessa parte).
  const only = process.env.PANELAI_E2E_ONLY;
  if (!only) {
    await flows(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
    await flows(browser, 'mobile', { ...devices['Pixel 7'] });
  }
  await notesAndSync(browser);
  if (!only) {
    await responsive(browser);
    await offline(browser);
  }
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
