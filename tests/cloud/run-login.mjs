// Teste do login obrigatório no navegador, com o app apontando para os
// emuladores do Firebase (nada toca o projeto real).
//
// Uso: npm run test:cloud   (roda depois de tests/cloud/run-cloud.mjs)
// Requer o pacote "playwright" com Chromium, como os testes de ponta a ponta.
//
// Gera um build próprio (com a nuvem dos emuladores) em tests/cloud/dist e
// confere: sem login só aparece a tela de entrar (inclusive no display), quem
// não está na casa vê o aviso, a casa abre depois do login e "Sair" volta
// para a tela de entrar.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/cloud/dist');
const HOST = '127.0.0.1';
const PROJECT = 'demo-panelai';
const API_KEY = 'demo-key';
const PORT = 4398;
const BASE = `http://localhost:${PORT}/PanelAI/`;
const AUTH = `http://${HOST}:9099`;
const FS = `http://${HOST}:8080`;
const CONFIG = JSON.stringify({ apiKey: API_KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, appId: '1:1:web:demo' });

const results = [];
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push(true);
    console.log(`✔ [login] ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push(false);
    console.log(`✘ [login] ${name} — ${String(err?.message ?? err).split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'ignore', shell: process.platform === 'win32' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} saiu com ${code}`))));
  });
}

async function createVerifiedUser(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'segredo123', returnSecureToken: true }),
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

async function signIn(page, email) {
  await page.getByRole('button', { name: 'Entrar com e-mail e senha' }).click();
  await page.locator('form input[type=email]').fill(email);
  await page.locator('form input[type=password]').fill('segredo123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

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

await createVerifiedUser('dona@exemplo.com');
await createVerifiedUser('visita@exemplo.com');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await step('sem login só aparece a tela de entrar', async () => {
  await page.goto(`${BASE}#/cardapio`);
  await page.getByRole('heading', { name: 'Entrar no PanelAI' }).waitFor({ timeout: 20000 });
  assert((await page.getByRole('heading', { name: 'Cardápio' }).count()) === 0, 'o cardápio não deveria aparecer');
  await page.goto(`${BASE}#/display/tela`);
  await page.getByRole('heading', { name: 'Entrar no PanelAI' }).waitFor();
  assert((await page.locator('.eink-frame').count()) === 0, 'o display não deveria aparecer');
});

await step('modo de teste: dados de exemplo só no navegador, sem falar com a nuvem', async () => {
  const cloudRequests = [];
  const onRequest = (r) => {
    if (r.url().includes(':8080/') || r.url().includes(':9099/')) cloudRequests.push(r.url());
  };
  // Página nova: o Firebase ainda não foi carregado nela.
  const demo = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  demo.on('pageerror', (e) => errors.push(String(e)));
  await demo.goto(`${BASE}#/cardapio`);
  await demo.getByRole('heading', { name: 'Entrar no PanelAI' }).waitFor({ timeout: 20000 });
  demo.on('request', onRequest);
  await demo.getByRole('button', { name: 'Experimentar sem conta' }).click();
  await demo.getByRole('heading', { name: 'Cardápio' }).waitFor({ timeout: 20000 });
  await demo.getByText('Modo de teste').first().waitFor();
  // Continua no teste depois de recarregar, com os dados de exemplo.
  await demo.reload();
  await demo.getByRole('heading', { name: 'Cardápio' }).waitFor({ timeout: 20000 });
  await demo.goto(`${BASE}#/receitas`);
  await demo.getByRole('heading', { name: 'Receitas' }).waitFor({ timeout: 20000 });
  const n = await demo.locator('.recipe-card').count();
  assert(n > 0, 'deveria haver receitas de exemplo');
  // Em Configurações não há como enviar os dados de teste para a nuvem.
  await demo.goto(`${BASE}#/ajustes`);
  await demo.getByText('Você está no').waitFor({ timeout: 20000 });
  assert((await demo.getByRole('button', { name: /Criar casa/ }).count()) === 0, 'não deveria oferecer criar casa');
  assert(!cloudRequests.length, `o modo de teste falou com a nuvem: ${cloudRequests[0]}`);
  // "Entrar na conta" sai do teste e volta para a tela de entrar.
  await demo.getByRole('button', { name: 'Entrar na conta', exact: true }).click();
  await demo.getByRole('heading', { name: 'Entrar no PanelAI' }).waitFor({ timeout: 20000 });
  await demo.close();
  return `${n} receitas de exemplo`;
});

await step('e-mail fora da casa vê o aviso e não cria casa (regras publicadas)', async () => {
  await loadRules(false);
  await page.goto(`${BASE}#/cardapio`);
  await signIn(page, 'visita@exemplo.com');
  await page.getByText('ainda não tem acesso').waitFor({ timeout: 20000 });
  await page.getByText('Primeira configuração: criar uma casa nova').click();
  await page.getByRole('button', { name: 'Criar casa' }).click();
  await page.getByText('Sem permissão no Firestore').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Entrar com outra conta' }).click();
  await page.getByRole('heading', { name: 'Entrar no PanelAI' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Entrar com e-mail e senha' }).waitFor({ timeout: 20000 });
});

await step('primeira configuração: cria a casa e abre o app com os dados', async () => {
  await loadRules(true);
  await signIn(page, 'dona@exemplo.com');
  await page.getByText('Primeira configuração: criar uma casa nova').click({ timeout: 20000 });
  await page.getByRole('button', { name: 'Criar casa' }).click();
  await page.getByRole('heading', { name: 'Cardápio' }).waitFor({ timeout: 30000 });
  await page.getByText('Sincronizado').first().waitFor({ timeout: 20000 });
});

await step('com login, o app reabre direto na casa', async () => {
  await page.reload();
  await page.getByRole('heading', { name: 'Cardápio' }).waitFor({ timeout: 30000 });
  await page.goto(`${BASE}#/receitas`);
  await page.getByRole('heading', { name: 'Receitas' }).waitFor({ timeout: 20000 });
  const n = await page.locator('.recipe-card').count();
  assert(n > 0, 'deveria haver receitas');
  return `${n} receitas`;
});

await step('responsável vê importar e restaurar; sair volta para a tela de entrar', async () => {
  await page.goto(`${BASE}#/ajustes`);
  await page.getByRole('button', { name: 'Importar' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Sair da conta neste aparelho' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('heading', { name: 'Entrar no PanelAI' }).waitFor({ timeout: 30000 });
});

await step('sem erros na página', async () => {
  assert(!errors.length, errors.slice(0, 2).join(' | '));
});

await browser.close();
server.kill();
await rm(outDir, { recursive: true, force: true });
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações do login passaram`);
process.exit(failed ? 1 : 0);
