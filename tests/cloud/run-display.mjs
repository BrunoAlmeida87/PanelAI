// Teste da publicação da imagem do display (scripts/display-png.mjs --publicar),
// com o app e a conta de tela apontando para os emuladores do Firebase (nada
// toca o projeto real).
//
// Uso: npm run test:cloud   (roda depois de run-cloud.mjs e run-login.mjs)
// Requer o pacote "playwright" com Chromium, como os testes de ponta a ponta.
//
// Confere: a conta de tela entra pela tela de entrar e só vê o display; o
// script grava tela.png e as imagens de cada horário (1 bit, 800 × 480) e
// config.json no endereço secreto; nada é gravado na casa pela conta de tela;
// "Atualizar a tela agora" salva a chave do GitHub, pede a imagem (GitHub
// simulado) e marca o pedido; publicação desligada não grava nada; senha
// errada falha com mensagem clara.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/cloud/dist-display');
const HOST = '127.0.0.1';
const PROJECT = 'demo-panelai';
const API_KEY = 'demo-key';
const PORT = 4399;
const BASE = `http://localhost:${PORT}/PanelAI/`;
const AUTH = `http://${HOST}:9099`;
const FS = `http://${HOST}:8080`;
const CONFIG = JSON.stringify({ apiKey: API_KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:1:web:demo' });
const OWNER = 'casa@exemplo.com';
const SCREEN = 'painel@exemplo.com';
const PASSWORD = 'segredo123';

process.env.VITE_FIREBASE_CONFIG = CONFIG;

const results = [];
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push(true);
    console.log(`✔ [display] ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push(false);
    console.log(`✘ [display] ${name} — ${String(err?.message ?? err).split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run(cmd, args, env = {}, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'ignore', shell: process.platform === 'win32' });
    let out = '';
    if (capture) {
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
    }
    p.on('exit', (code) => (capture ? resolve({ code, out }) : code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} saiu com ${code}`))));
  });
}

async function createVerifiedUser(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { localId } = await r.json();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
}

async function loadRules(firstSetup) {
  let rules = await readFile(path.join(root, 'firestore.rules'), 'utf8');
  if (firstSetup) rules = rules.replace('allow create: if false;', 'allow create: if canCreateHousehold(casa);');
  await fetch(`${FS}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ content: rules }] } }),
  });
}

/** Todos os documentos de uma coleção da casa, ignorando as regras. */
async function adminList(p) {
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${p}?pageSize=1000`, { headers: { authorization: 'Bearer owner' } });
  return (await r.json()).documents ?? [];
}

const publishScript = (dir, env = {}) =>
  run('node', ['scripts/display-png.mjs', '--publicar', dir, '--site', BASE], { PANELAI_TELA_EMAIL: SCREEN, PANELAI_TELA_SENHA: PASSWORD, GITHUB_ACTIONS: '', GITHUB_OUTPUT: '', ...env }, { capture: true });

// ---------- preparação: app dos emuladores e casa com conta de tela ----------

await run('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { VITE_FIREBASE_CONFIG: CONFIG, VITE_FIREBASE_EMULATOR: HOST });
const server = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* ainda subindo */
  }
  await new Promise((r) => setTimeout(r, 200));
}

await createVerifiedUser(OWNER);
await createVerifiedUser(SCREEN);
await loadRules(true);

const cloud = await import('../../src/cloud/cloud.js?display=dona');
cloud.configureCloud({ appName: 'dona', emulatorHost: HOST, deviceId: 'dona' });
await cloud.signInEmail(OWNER, PASSWORD);
const { buildSeed } = await import('../../src/data/seed.js');
const { seedOps } = await import('../../src/storage/store.js');
const { newLayout } = await import('../../src/display/model.js');
const { newPublishCode, slotImageFile } = await import('../../src/display/schedule.js');
const { pngSize } = await import('../../scripts/lib/png.mjs');

const CODE = newPublishCode();
const seed = buildSeed();
const layout = newLayout({ name: 'Cozinha teste' }, { name: 'Dona' });
seed.displayLayouts = { [layout.id]: layout };
// Último "Atualizar a tela agora": há 20 min (a tela de Configurações já não acompanha esse pedido).
const REQUESTED = Date.now() - 20 * 60_000;
seed.settings = {
  ...seed.settings,
  displayLayoutId: layout.id,
  displayDevice: { times: ['06:00', '18:00'], timeZone: 'America/Sao_Paulo', code: CODE, checkMinutes: 15, requestedAt: REQUESTED },
};
// Chave do GitHub da casa (meta/github): a conta de tela lê junto, sem efeito no display.
seed.githubToken = `github_pat_${'T3st'.repeat(20)}`;
const hid = await cloud.createHousehold('Casa do display', seedOps(seed));
await cloud.addViewer(hid, SCREEN);
await loadRules(false);

/** Grava as configurações da casa como o app grava (registro "settings" em meta). */
async function setSettings(patch) {
  cloud.startSync(hid, { onChanges() {}, onHousehold() {}, onPending() {}, onError() {} });
  seed.settings = { ...seed.settings, ...patch };
  await cloud.writeOps([{ store: 'meta', type: 'put', value: { key: 'settings', value: seed.settings } }]);
  await new Promise((r) => setTimeout(r, 1000));
  cloud.stopSync();
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'panelai-display-'));
const browser = await chromium.launch();

// ---------- testes ----------

await step('conta de tela entra pela tela de entrar e só vê o display', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}#/cardapio`);
  await page.getByRole('button', { name: 'Entrar com e-mail e senha' }).click({ timeout: 20000 });
  await page.locator('form input[type=email]').fill(SCREEN);
  await page.locator('form input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('conta de tela').first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Entrar na casa' }).click();
  await page.getByRole('heading', { name: 'Conta da tela' }).waitFor({ timeout: 30000 });
  assert((await page.getByRole('heading', { name: 'Cardápio' }).count()) === 0, 'o cardápio não deveria aparecer para a conta de tela');
  await page.getByRole('link', { name: 'Ver a tela' }).click();
  await page.locator('.display-fullscreen .eink-frame').waitFor({ timeout: 30000 });
  assert(!errors.length, errors[0]);
  await page.close();
});

await step('publica tela.png, as imagens de cada horário (1 bit, 800 × 480) e config.json no endereço secreto', async () => {
  const before = Date.now();
  const { code, out } = await publishScript(tmp);
  assert(code === 0, `o script falhou: ${out.trim().split('\n').pop()}`);
  assert(!out.includes(CODE), 'o código secreto apareceu no log');
  const dir = path.join(tmp, 'tela', CODE);
  const png = await readFile(path.join(dir, 'tela.png'));
  const size = pngSize(png);
  assert(size.width === 800 && size.height === 480, `tamanho ${size.width}×${size.height}`);
  assert(size.bitDepth === 1 && size.colorType === 0, `PNG deveria ser 1 bit em cinza (veio ${size.bitDepth}/${size.colorType})`);
  const cfg = JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'));
  assert(cfg.versao === 2 && cfg.largura === 800 && cfg.altura === 480, 'cabeçalho do config.json');
  assert(JSON.stringify(cfg.horarios) === '["06:00","18:00"]' && cfg.fuso === 'America/Sao_Paulo', 'horários e fuso');
  assert(cfg.gerado * 1000 >= before - 1000 && cfg.referencia >= cfg.gerado, 'momentos da imagem');
  assert(cfg.proximas.length >= 10 && cfg.proximas[0] > cfg.gerado, 'próximas atualizações');
  for (let i = 1; i < cfg.proximas.length; i++) assert(cfg.proximas[i] > cfg.proximas[i - 1], 'próximas em ordem');
  // Pedido de "Atualizar a tela agora" e conferência a cada 15 min, das 6h às 23h.
  assert(cfg.pedido === Math.floor(REQUESTED / 1000), `pedido: ${cfg.pedido}`);
  // 8 dias de janelas (6h–23h); depois das 23h a de hoje já passou e ficam 7 (14 números).
  assert(
    cfg.conferir_cada === 900 && [14, 16].includes(cfg.conferir.length) && cfg.conferir[1] - cfg.conferir[0] <= 17 * 3600,
    `janelas de conferência (${cfg.conferir.length})`,
  );
  // Uma imagem pronta para cada horário, no mesmo formato.
  const files = (await readdir(dir)).sort();
  const expected = ['config.json', 'tela.png', ...cfg.proximas.map(slotImageFile)].sort();
  assert(JSON.stringify(files) === JSON.stringify(expected), `arquivos: ${files.join(', ')}`);
  let differs = 0;
  for (const sec of cfg.proximas) {
    const slot = await readFile(path.join(dir, slotImageFile(sec)));
    const ss = pngSize(slot);
    assert(ss.width === 800 && ss.height === 480 && ss.bitDepth === 1, `imagem do horário ${sec}: ${ss.width}×${ss.height}`);
    if (!slot.equals(png)) differs++;
  }
  // Os horários de outros dias mostram outra data: as imagens não podem ser todas iguais à principal.
  assert(differs > 0, 'as imagens dos horários deveriam mostrar os seus dias');
  return `${png.length} bytes + ${cfg.proximas.length} imagens de horário`;
});

await step('a conta de tela não gravou nada na casa', async () => {
  for (const coll of ['tasks', 'meta', 'marks', 'displayLayouts', 'weeks']) {
    const docs = await adminList(`households/${hid}/${coll}`);
    const byScreen = docs.filter((d) => d.fields?.by?.stringValue === SCREEN);
    assert(!byScreen.length, `${coll}: ${byScreen.length} documento(s) gravado(s) pela conta de tela`);
  }
});

/** Entra pela tela de entrar, como uma pessoa faria. */
async function uiSignIn(page, email) {
  await page.goto(`${BASE}#/cardapio`);
  await page.getByRole('button', { name: 'Entrar com e-mail e senha' }).click({ timeout: 20000 });
  await page.locator('form input[type=email]').fill(email);
  await page.locator('form input[type=password]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.getByRole('button', { name: 'Entrar na casa' }).click({ timeout: 20000 })]);
}

/** Registro do app guardado num documento da casa ({ v: JSON }). */
async function readRecord(coll, id) {
  const doc = (await adminList(`households/${hid}/${coll}`)).find((d) => d.name.endsWith(`/${coll}/${id}`));
  return doc ? JSON.parse(doc.fields.v.stringValue) : null;
}

await step('"Atualizar a tela agora": salva a chave do GitHub, pede a imagem e marca o pedido', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // GitHub simulado: nada sai para a internet.
  const calls = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, accept, x-github-api-version',
  };
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'OPTIONS') calls.push({ url: req.url(), auth: req.headers().authorization, body: req.postData() });
    await route.fulfill({ status: 204, headers: cors });
  });
  await uiSignIn(page, OWNER);
  // Depois de entrar o app abre o cardápio; só então vai para as Configurações.
  await page.getByRole('heading', { name: 'Cardápio' }).first().waitFor({ timeout: 30000 });
  await page.goto(`${BASE}#/ajustes`);
  const tela = page.locator('section[aria-labelledby="tela-eink"]');
  await tela
    .getByRole('button', { name: 'Atualizar a tela agora' })
    .waitFor({ timeout: 30000 })
    .catch(async (e) => {
      const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
      throw new Error(`${e.message.split('\n')[0]} — na página: ${text.slice(0, 400)}`);
    });
  // A chave da casa aparece só mascarada.
  await tela.getByText(`github_pat_…${seed.githubToken.slice(-4)}`).waitFor({ timeout: 10000 });
  assert(!(await page.content()).includes(seed.githubToken), 'a chave apareceu inteira na página');
  // Trocar: recusa o que não é chave e salva a nova.
  const NEW_TOKEN = `github_pat_${'N0va'.repeat(20)}`;
  await tela.getByRole('button', { name: 'Trocar', exact: true }).click();
  await tela.locator('#chave-github').fill('minha-senha');
  await tela.getByRole('button', { name: 'Salvar chave' }).click();
  await tela.getByText('Isso não parece uma chave do GitHub').waitFor({ timeout: 5000 });
  await tela.locator('#chave-github').fill(NEW_TOKEN);
  await tela.getByRole('button', { name: 'Salvar chave' }).click();
  await tela.getByText(`github_pat_…${NEW_TOKEN.slice(-4)}`).waitFor({ timeout: 10000 });
  // Pedido.
  const before = Date.now();
  await tela.getByRole('button', { name: 'Atualizar a tela agora' }).click();
  await tela.getByText('Gerando a imagem nova no GitHub').waitFor({ timeout: 15000 });
  for (let i = 0; i < 50 && !calls.length; i++) await page.waitForTimeout(200);
  assert(calls.length === 1, `pedidos ao GitHub: ${calls.length}`);
  assert(calls[0].url === 'https://api.github.com/repos/BrunoAlmeida87/PanelAI/actions/workflows/display.yml/dispatches', `endereço: ${calls[0].url}`);
  assert(calls[0].auth === `Bearer ${NEW_TOKEN}`, 'o pedido não usou a chave nova');
  assert(JSON.parse(calls[0].body).ref === 'main', 'o pedido deveria rodar na main');
  assert(await tela.getByRole('button', { name: 'Atualizar a tela agora' }).isDisabled(), 'o botão deveria esperar 1 minuto');
  // Na nuvem: o pedido (lido pelo gerador) e a chave nova.
  const settings = await readRecord('meta', 'settings');
  assert(settings?.value?.displayDevice?.requestedAt >= before, `pedido salvo: ${settings?.value?.displayDevice?.requestedAt}`);
  assert((await readRecord('meta', 'github'))?.value?.token === NEW_TOKEN, 'chave nova não foi salva na casa');
  // Muda a conferência para 30 minutos.
  await tela.locator('select').selectOption('30');
  await page.waitForTimeout(1500);
  assert((await readRecord('meta', 'settings'))?.value?.displayDevice?.checkMinutes === 30, 'conferência não foi salva');
  // No celular: tudo cabe na largura (sem rolagem para o lado).
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `rolagem horizontal de ${overflow}px no celular`);
  if (process.env.PANELAI_CAPTURA) await tela.screenshot({ path: path.join(process.env.PANELAI_CAPTURA, 'tela-eink-celular.png') });
  assert(!errors.length, errors[0]);
  await page.close();
  seed.settings = settings.value; // as próximas verificações partem do que está na nuvem
});

await step('publicação desligada: não grava nada e termina sem erro', async () => {
  await setSettings({ displayDevice: { ...seed.settings.displayDevice, code: null } });
  const empty = await mkdtemp(path.join(os.tmpdir(), 'panelai-display-off-'));
  const { code, out } = await publishScript(empty);
  assert(code === 0, `o script falhou: ${out.trim().split('\n').pop()}`);
  assert(out.includes('Publicação desligada'), 'deveria avisar que está desligada');
  assert((await readdir(empty)).length === 0, 'não deveria gravar arquivos');
  await rm(empty, { recursive: true, force: true });
});

await step('senha errada: falha com mensagem clara', async () => {
  const { code, out } = await publishScript(tmp, { PANELAI_TELA_SENHA: 'senha-errada' });
  assert(code === 1, `deveria falhar (saiu com ${code})`);
  assert(out.includes('login recusado'), `mensagem: ${out.trim().split('\n').pop()}`);
});

await step('sem os segredos: falha explicando o que configurar', async () => {
  const { code, out } = await publishScript(tmp, { PANELAI_TELA_EMAIL: '', PANELAI_TELA_SENHA: '' });
  assert(code === 1 && out.includes('PANELAI_TELA_EMAIL'), `saída: ${out.trim().split('\n').pop()}`);
});

await browser.close();
server.kill();
await rm(outDir, { recursive: true, force: true });
await rm(tmp, { recursive: true, force: true });
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações do display passaram`);
process.exit(failed ? 1 : 0);
