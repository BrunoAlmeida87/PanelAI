// Testes de ponta a ponta e de responsividade com Playwright.
// Uso: npm run build && npm run test:e2e
// Requer o pacote "playwright" com Chromium disponível no ambiente
// (não é dependência do projeto para manter o CI leve).

import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

  await step(`[${label}] 3b. comida escrita vira sugestão e sai pela lixeira`, async () => {
    const openPicker = async (day, slotLabel, slotAria) => {
      await page.goto(`${BASE}#/cardapio`);
      if (mobile) {
        await page.getByRole('tab', { name: new RegExp(`^${day}`) }).click();
        await page.getByRole('region', { name: slotLabel }).getByRole('button', { name: /Adicionar|Definir/ }).click();
      } else {
        await page.getByRole('button', { name: `Adicionar ${slotAria} em ${day}` }).click();
      }
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('tab', { name: 'Escrever' }).click();
      return dialog;
    };
    let dialog = await openPicker('Domingo', 'Café da manhã', 'café da manhã');
    await dialog.getByLabel('O que vai ter?').fill('Macarrão teste E2E');
    // Categoria opcional: marca "Massa".
    await dialog.getByRole('group', { name: 'Categorias da comida' }).getByRole('button', { name: 'Massa' }).click();
    await dialog.getByRole('button', { name: /^Adicionar$/ }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });

    dialog = await openPicker('Sábado', 'Café da manhã', 'café da manhã');
    await dialog.getByLabel('O que vai ter?').fill('macarrao te');
    const row = dialog.getByRole('listitem').filter({ hasText: 'Macarrão teste E2E' });
    await row.waitFor({ timeout: 3000 });
    await shot('written-suggestion');
    await row.getByRole('button', { name: /^Macarrão teste E2E/ }).click();
    const v = await dialog.getByLabel('O que vai ter?').inputValue();
    assert(v === 'Macarrão teste E2E', `campo = ${v}`);
    // A categoria escolhida da outra vez já vem marcada.
    const massa = await dialog.getByRole('group', { name: 'Categorias da comida' }).getByRole('button', { name: 'Massa' }).getAttribute('aria-pressed');
    assert(massa === 'true', `Massa marcada = ${massa}`);
    await dialog.getByLabel('O que vai ter?').fill('macarrao te');
    await row.getByRole('button', { name: 'Apagar “Macarrão teste E2E” das sugestões' }).click();
    await row.waitFor({ state: 'detached', timeout: 3000 });
    await page.getByText('apagada das sugestões').waitFor();
    // Volta para a aba Receita (o seletor lembra a última aba usada).
    await dialog.getByRole('tab', { name: 'Receita' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    return 'sugerida ao digitar "macarrao te" já com a categoria Massa, usada e apagada';
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

  await step(`[${label}] 11b. Montessori: cadastrar criança e ver as sugestões do dia`, async () => {
    await page.goto(`${BASE}#/montessori`);
    await page.getByRole('heading', { name: 'Montessori', level: 1 }).waitFor();
    // Sem cadastro, a biblioteca já pode ser consultada.
    await page.getByRole('button', { name: /Regar as plantas/ }).waitFor();
    await page.getByLabel('Nome da criança').fill('Ana');
    await page.getByLabel('Data de nascimento').fill('2025-07-10');
    await page.getByRole('button', { name: 'Salvar cadastro' }).click();
    await page.getByRole('heading', { name: 'Sugestões para hoje' }).waitFor();
    await page.getByText('12 a 18 meses', { exact: true }).first().waitFor();
    const n = await page.locator('.mt-today-item').count();
    assert(n === 3, `${n} sugestões`);
    await shot('montessori');
    return `${n} sugestões para 1 ano e 4 meses`;
  });

  await step(`[${label}] 11c. Montessori: registrar, trocar e novas sugestões (a feita continua)`, async () => {
    const first = page.locator('.mt-today-item').first();
    const name = await first.locator('.mt-card-name').innerText();
    await first.getByRole('button', { name: /^Registrar/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar atividade' });
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await dialog.getByText('Escolha o interesse.').waitFor(); // obrigatório
    await dialog.getByRole('button', { name: 'Alto' }).click();
    await dialog.getByRole('button', { name: 'Realizou sozinha' }).click();
    await dialog.getByLabel('Observações').fill('Pediu para repetir');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await page.getByText(`Registrado: ${name} (hoje)`).waitFor();
    await first.getByText('Feita hoje').waitFor();
    // Trocar a segunda sugestão.
    const second = page.locator('.mt-today-item').nth(1);
    const before = await second.locator('.mt-card-name').innerText();
    await second.getByRole('button', { name: /^Trocar/ }).click();
    await page.waitForFunction((b) => document.querySelectorAll('.mt-today-item .mt-card-name')[1]?.textContent !== b, before);
    // Novas sugestões: a feita hoje fica na lista.
    await page.getByRole('button', { name: 'Novas sugestões' }).click();
    await page.getByText('Novas sugestões para hoje').waitFor();
    const names = await page.locator('.mt-today-item .mt-card-name').allInnerTexts();
    assert(names.length === 3 && names[0] === name, names.join(' / '));
    await page.getByRole('button', { name: 'Voltar às sugestões automáticas' }).waitFor();
    return `feita: ${name}`;
  });

  await step(`[${label}] 11d. Montessori: biblioteca (filtros, busca e detalhe) e histórico`, async () => {
    await page.getByRole('button', { name: 'Todas as idades' }).click();
    await page.getByRole('searchbox', { name: 'Buscar atividades' }).fill('regador');
    await page.locator('.mt-card').filter({ hasText: 'Regar as plantas' }).click();
    const dialog = page.getByRole('dialog', { name: 'Regar as plantas' });
    await dialog.getByText('Como fazer').waitFor();
    await dialog.getByText('Cuidados de segurança').waitFor();
    await dialog.getByText(/comigo-ninguém-pode/).waitFor();
    await shot('montessori-detalhe');
    const inToday = (await dialog.getByRole('button', { name: 'Tirar das atividades de hoje' }).count()) > 0;
    if (!inToday) {
      await dialog.getByRole('button', { name: 'Incluir nas atividades de hoje' }).click();
      await dialog.getByRole('button', { name: 'Tirar das atividades de hoje' }).waitFor();
    }
    await dialog.getByRole('button', { name: 'Fechar' }).click();
    await page.locator('.mt-today-item').filter({ hasText: 'Regar as plantas' }).waitFor();
    // Filtro por categoria e status.
    await page.getByRole('searchbox', { name: 'Buscar atividades' }).fill('');
    await page.getByRole('group', { name: 'Categoria' }).getByRole('button', { name: /Percepção tátil/ }).click();
    const cats = await page.locator('.mt-card .mt-card-meta').allInnerTexts();
    assert(cats.length > 0 && cats.every((t) => t.startsWith('Tato')), cats.join(' / '));
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Preferidas' }).click();
    // Histórico.
    await page.getByRole('tab', { name: /Histórico/ }).click();
    await page.getByText('Interesse alto').waitFor();
    await page.getByText('Pediu para repetir').waitFor();
    await shot('montessori-historico');
    await page.getByRole('tab', { name: /Biblioteca/ }).click();
  });

  await step(`[${label}] 11e. Montessori: card na página inicial`, async () => {
    await page.goto(`${BASE}#/cardapio`);
    const card = page.locator('.mt-home');
    await card.getByText('Ana').waitFor();
    const items = await card.locator('.mt-home-items a').count();
    assert(items >= 3, `${items} atividades no card`);
    await card.locator('.mt-home-items a').first().click();
    await page.getByRole('dialog').getByText('Como fazer').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
    return `${items} atividades no card do Cardápio`;
  });

  await step(`[${label}] 11f. Montessori: com duas crianças, o card abre a atividade da criança certa`, async () => {
    await page.goto(`${BASE}#/montessori`);
    await page.getByRole('button', { name: /^Mais|Mais ações/ }).click();
    await page.getByRole('menuitem', { name: 'Cadastrar outra criança' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cadastrar criança' });
    await dialog.getByLabel('Nome da criança').fill('Bia');
    await dialog.getByLabel('Data de nascimento').fill('2026-06-01');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await page.getByRole('heading', { name: 'Bia' }).waitFor();
    // Volta a selecionar a Ana e abre, pelo Cardápio, uma atividade da Bia.
    await page.getByRole('group', { name: 'Criança' }).getByRole('button', { name: /Ana/ }).click();
    await page.getByRole('heading', { name: 'Ana' }).waitFor();
    await page.goto(`${BASE}#/cardapio`);
    const bia = page.locator('.mt-home-kid').filter({ hasText: 'Bia' });
    await bia.locator('.mt-home-items a').first().click();
    await page.getByRole('dialog').getByText(/Ainda não apresentada para Bia|Bia fez esta atividade/).waitFor();
    await page.getByRole('heading', { name: 'Bia', level: 2 }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
    // Fechando o detalhe, a Bia continua selecionada.
    await page.getByRole('heading', { name: 'Bia', level: 2 }).waitFor();
  });

  let exported = null;
  await step(`[${label}] 12. exportar dados`, async () => {
    await page.goto(`${BASE}#/ajustes`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar (JSON)' }).click()]);
    exported = path.join(outDir, `${label}-backup.json`);
    await download.saveAs(exported);
    const json = JSON.parse(await readFile(exported, 'utf8'));
    assert(json.app === 'PanelAI' && json.data.recipes.some((r) => r.name === RECIPE), 'conteúdo inesperado');
    assert(json.data.children.length === 2 && json.data.montessoriLogs.length === 1, 'Montessori fora do backup');
    return `${json.data.recipes.length} receitas, ${json.data.movements.length} movimentações, ${json.data.montessoriLogs.length} registro Montessori`;
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
    // A criança e o histórico continuam lá (restaurar a demonstração não apaga).
    await page.goto(`${BASE}#/montessori`);
    await page.getByRole('group', { name: 'Criança' }).getByRole('button', { name: /Ana/ }).click();
    await page.getByRole('heading', { name: 'Ana' }).waitFor();
    await page.getByRole('tab', { name: /Histórico 1/ }).waitFor();
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

  await step(`[${label}] 14b. tela e-ink: horários de atualização`, async () => {
    await page.goto(`${BASE}#/ajustes`);
    const section = page.locator('section[aria-labelledby="tela-eink"]');
    await section.getByRole('button', { name: 'Remover o horário 06:00' }).waitFor();
    await section.getByLabel('Novo horário de atualização').fill('18:30');
    await section.getByRole('button', { name: 'Adicionar horário' }).click();
    await section.getByRole('button', { name: 'Remover o horário 18:30' }).waitFor();
    await section.getByRole('button', { name: 'Remover o horário 06:00' }).click();
    await page.waitForTimeout(200);
    assert((await section.getByRole('button', { name: 'Remover o horário 06:00' }).count()) === 0, '06:00 deveria sair');
    await section.getByText(/Próximas: .*18:30/).waitFor();
    // Sem a nuvem (build de teste), o endereço da imagem não pode ser ativado.
    await section.getByText('Entre na conta da casa para ativar').waitFor();
    // A aba Display mostra os horários escolhidos.
    await page.goto(`${BASE}#/display`);
    await page.getByText('Horários de atualização da tela').waitFor();
    await page.locator('.display-inspector').getByText('18:30', { exact: true }).waitFor();
    // Continua salvo depois de recarregar.
    await page.goto(`${BASE}#/ajustes`);
    await page.reload();
    await page.locator('section[aria-labelledby="tela-eink"]').getByRole('button', { name: 'Remover o horário 18:30' }).waitFor();
    await shot('tela-eink');
  });

  await step(`[${label}] 14d. pôr e tirar cards (Montessori com a tela cheia)`, async () => {
    await page.goto(`${BASE}#/display`);
    const insp = page.locator('.display-inspector');
    const list = insp.getByRole('list', { name: 'Cards nesta tela' });
    await list.waitFor();
    const before = await list.getByRole('listitem').count();
    // Tela cheia: o app pergunta qual card substituir.
    await page.locator('.display-toolbar').getByRole('button', { name: 'Adicionar card' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Montessori de hoje/ }).click();
    const ask = page.getByRole('dialog', { name: 'A tela está cheia' });
    await ask.waitFor();
    await shot('tela-cheia');
    await ask.getByRole('button', { name: /^No lugar de: Tarefas de hoje/ }).click();
    await page.locator('.display-stage .eink-card[data-type="montessori"]').waitFor();
    assert((await page.locator('.display-stage .eink-card[data-type="tasksDay"]').count()) === 0, 'tarefas continuam na tela');
    // Volta ao painel da tela e tira as pendências pela lixeira.
    await insp.getByRole('button', { name: 'Tela', exact: true }).click();
    await list.getByRole('button', { name: 'Tirar Pendências e atrasadas da tela' }).click();
    await page.getByText('Card removido').waitFor();
    assert((await list.getByRole('listitem').count()) === before - 1, 'card não saiu');
    // "Trocar por": lista de compras vira Recado no mesmo lugar.
    await list.getByLabel('Trocar Lista de compras por').selectOption('note');
    await page.locator('.display-stage .eink-card[data-type="note"]').waitFor();
    await shot('cards-lista');
    // Desfaz tudo (o layout volta como estava para os próximos testes).
    for (let i = 0; i < 3; i++) await page.locator('.display-toolbar').getByRole('button', { name: 'Desfazer' }).click();
    await page.locator('.display-stage .eink-card[data-type="tasksDay"]').waitFor();
    return 'Montessori no lugar das tarefas, pendências tiradas, compras trocadas por recado';
  });

  await step(`[${label}] 14c. letras da tela: fonte, peso, aviso e prévia fiel`, async () => {
    await page.goto(`${BASE}#/display`);
    const insp = page.locator('.display-inspector');
    await insp.getByRole('heading', { name: 'Letras' }).waitFor();
    await insp.getByLabel('Fonte dos títulos').selectOption('lexend');
    await insp.getByLabel('Peso dos textos').selectOption('700');
    await insp.getByRole('tablist', { name: 'Tamanho dos textos' }).getByRole('tab', { name: 'P', exact: true }).click();
    // A tela usa a fonte escolhida.
    const fam = await page.locator('.display-stage .eink-title').first().evaluate((el) => getComputedStyle(el).fontFamily);
    assert(fam.includes('Lexend'), `fonte do título: ${fam}`);
    await insp.locator('.type-warn').first().waitFor();
    await page.getByRole('button', { name: 'Prévia fiel' }).click();
    const filter = await page.locator('.display-stage .eink-frame').evaluate((el) => el.style.filter);
    assert(filter.includes('eink-1bit-150'), `filtro: ${filter}`);
    await shot('letras');
    await page.getByRole('button', { name: 'Prévia fiel' }).click();
    await insp.getByRole('button', { name: 'Voltar às letras padrão' }).click();
    await insp.getByRole('button', { name: 'Voltar às letras padrão' }).waitFor({ state: 'detached' });
    return 'Lexend nos títulos, aviso de negrito pequeno, prévia em preto e branco';
  });

  if (mobile) {
    await step(`[${label}] 15. navegação inferior não cobre o conteúdo`, async () => {
      await page.goto(`${BASE}#/compras`);
      // Espera a lista aparecer antes de rolar (vindo de outra tela, ela redesenha depois do goto).
      await page.locator('#conteudo .cat-block').first().waitFor();
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
      await page.keyboard.press('6');
      await page.getByRole('heading', { name: 'Montessori', level: 1 }).waitFor();
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
  const widths = [360, 390, 430, 768, 960, 1024, 1200, 1440];
  const routes = ['cardapio', 'compras', 'despensa/estoque', 'despensa/contagem', 'despensa/mercado', 'receitas', 'receitas/strogonoff-frango', 'receitas/nova', 'ajustes', 'historico', 'montessori'];
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
      if (['cardapio', 'compras', 'despensa/estoque', 'receitas', 'montessori'].includes(r)) {
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
  await flows(browser, 'desktop', { viewport: { width: 1440, height: 900 } });
  await flows(browser, 'mobile', { ...devices['Pixel 7'] });
  await responsive(browser);
  await offline(browser);
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
