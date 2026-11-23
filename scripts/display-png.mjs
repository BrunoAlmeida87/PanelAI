// Gera a imagem (PNG) da tela do display e-ink a partir de #/display/tela.
// Aparelhos e-ink como o reTerminal E1001 não rodam o PanelAI: eles só baixam
// a imagem pronta. Este script abre a tela num navegador sem janela, já logado
// na casa, e tira a "foto".
//
// ── 1. Publicação pelo GitHub (como o PanelAI atende o reTerminal E1001) ──
//
//   node scripts/display-png.mjs --publicar dist
//
// Roda no workflow .github/workflows/display.yml a cada 30 minutos. Entra no
// site publicado com a CONTA DE TELA da casa (só leitura), tira a foto e grava,
// para o aparelho baixar pela internet:
//   dist/tela/<código>/tela.png      1 bit (preto e branco), no tamanho exato da tela
//   dist/tela/<código>/config.json   próximas atualizações (formato: src/display/schedule.js)
// O código secreto e os horários vêm de Configurações → Tela e-ink. Com a
// publicação desligada (sem código), não grava nada. E-mail e senha da conta de
// tela vêm SÓ das variáveis de ambiente PANELAI_TELA_EMAIL e PANELAI_TELA_SENHA
// (segredos do GitHub), nunca da linha de comando. Passo a passo: docs/DISPLAY.md.
//
// ── 2. Num computador da casa que fica ligado (Raspberry Pi, PC) ──
//
//   npm run display:png -- --entrar                    # uma vez: abre o navegador para entrar na conta
//   npm run display:png -- --saida tela.png            # gera uma imagem
//   npm run display:png -- --servir 8080 --a-cada 15   # gera a cada 15 min em http://<ip>:8080/tela.png
//
// Opções:
//   --site URL      endereço do PanelAI (padrão: o site publicado)
//   --layout ID     layout a usar (padrão: o escolhido para o display)
//   --perfil PASTA  onde guardar o login do navegador no modo 2 (padrão: ~/.panelai-display)
//   --cinza         tons de cinza (modo 2)
//   --pb            preto e branco puro, 1 bit (modo 2; no modo 1 é sempre assim)
//   --limiar N      claridade (0–255) a partir da qual o pixel fica branco no preto e branco (padrão: 150)
//   --girar 90      gira a imagem (90, 180 ou 270), para telas montadas de lado (modo 2)
//   --fuso ZONA     fuso usado até ler o da casa (padrão: America/Sao_Paulo)
//
// Requisitos: Node.js 20+ e Playwright com Chromium:
//   npm i -g playwright && npx playwright install chromium

import { createServer } from 'node:http';
import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { encodePng1Bit, pngSize, rgbaToBits } from './lib/png.mjs';
import {
  CONFIG_FILE,
  DEFAULT_TIMEZONE,
  IMAGE_FILE,
  PUBLISH_DIR,
  buildDeviceConfig,
  isValidPublishCode,
  isValidTimeZone,
  renderMoment,
  zonedParts,
} from '../src/display/schedule.js';

const require = createRequire(import.meta.url);

/** Erro com mensagem para a pessoa (sem pilha de chamadas). */
class UserError extends Error {}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const SITE = String(args.site ?? 'https://brunoalmeida87.github.io/PanelAI/').replace(/#.*$/, '');
const PROFILE = path.resolve(String(args.perfil ?? path.join(os.homedir(), '.panelai-display')));
const OUT = args.saida ? path.resolve(String(args.saida)) : null;
const PORT = args.servir ? Number(args.servir === true ? 8080 : args.servir) : null;
const EVERY_MIN = Number(args['a-cada'] ?? 15);
const ROTATE = [90, 180, 270].includes(Number(args.girar)) ? Number(args.girar) : 0;
const THRESHOLD = Math.min(255, Math.max(1, Number(args.limiar ?? 150) || 150));
const MODE = args.pb ? 'bw' : args.cinza ? 'gray' : 'color';
const START_TZ = String(args.fuso ?? process.env.PANELAI_FUSO ?? DEFAULT_TIMEZONE);

const FRAME = '.display-fullscreen .eink-frame';
const INFO = 'panelai-publicacao';
const firstLine = (e) => String(e?.message ?? e).split('\n')[0];
const inGitHub = process.env.GITHUB_ACTIONS === 'true';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com:\n  npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

/** Endereço da tela pronta (parâmetros explicados em src/pages/DisplayPage.jsx). */
function screenUrl({ publish = false, moment = null } = {}) {
  const q = new URLSearchParams({ exato: '1' });
  if (args.layout) q.set('id', String(args.layout));
  if (publish) q.set('publicar', '1');
  if (moment != null) q.set('momento', String(moment));
  return `${SITE}#/display/tela?${q}`;
}

// ---------- Tela ----------

/** Espera a tela do display aparecer (com os dados da casa já carregados). */
async function waitForScreen(page, timeout = 90_000) {
  try {
    await page.locator(FRAME).first().waitFor({ timeout });
  } catch {
    const text = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    throw new UserError(`a tela do display não apareceu. Na página: "${text}"`);
  }
  await page.evaluate(() => document.fonts?.ready);
}

/**
 * Abre a tela com publicar=1 e lê o que o app expõe para a publicação:
 * { device, layout: { id, name, width, height, colorMode }, moment }.
 * Com `moment` (ms), espera a tela já mostrar os dados daquele instante.
 */
async function readScreenInfo(page, url, moment = null) {
  await page.goto(url);
  await waitForScreen(page);
  const handle = await page.waitForFunction(
    ({ id, m }) => {
      const raw = document.getElementById(id)?.dataset.json;
      if (!raw) return null;
      const info = JSON.parse(raw);
      return m == null || info.moment === m ? info : null;
    },
    { id: INFO, m: moment },
    { timeout: 30_000 },
  );
  return handle.jsonValue();
}

/** Foto da tela (PNG colorido), com filtro CSS e rotação opcionais. */
async function shoot(page, { filter = '', rotate = 0 } = {}) {
  await page.waitForTimeout(800); // últimas medidas de texto e imagens
  const size = await page.evaluate(
    ({ selector, filter, rotate }) => {
      const el = document.querySelector(selector);
      const { width: w, height: h } = el.getBoundingClientRect();
      const t = { 0: 'none', 90: `translate(${h}px,0) rotate(90deg)`, 180: `translate(${w}px,${h}px) rotate(180deg)`, 270: `translate(0,${w}px) rotate(270deg)` }[rotate];
      Object.assign(el.style, { position: 'fixed', left: '0', top: '0', margin: '0', zIndex: '10', transformOrigin: 'top left', transform: t, filter: filter || 'none' });
      document.querySelector('.fs-hint')?.remove();
      return { w: Math.round(w), h: Math.round(h) };
    },
    { selector: FRAME, filter, rotate },
  );
  const rotated = rotate === 90 || rotate === 270;
  const clip = { x: 0, y: 0, width: rotated ? size.h : size.w, height: rotated ? size.w : size.h };
  const png = await page.screenshot({ clip, type: 'png' });
  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    for (const k of ['position', 'left', 'top', 'margin', 'z-index', 'transform-origin', 'transform', 'filter']) el?.style.removeProperty(k);
  }, FRAME);
  return png;
}

/** PNG colorido → PNG de 1 bit. A decodificação usa uma página em branco do próprio navegador. */
async function toOneBit(context, png, threshold) {
  const scratch = await context.newPage();
  try {
    const { width, height, rgba } = await scratch.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let bin = '';
      for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
      return { width: bmp.width, height: bmp.height, rgba: btoa(bin) };
    }, png.toString('base64'));
    return encodePng1Bit(width, height, rgbaToBits(Buffer.from(rgba, 'base64'), width, height, threshold));
  } finally {
    await scratch.close();
  }
}

async function writeAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

// ---------- 1. Publicação pelo GitHub ----------

/** Entra com e-mail e senha na tela de entrar e abre a casa (como uma pessoa faria). */
async function signIn(page, email, password) {
  await page.goto(screenUrl({ publish: true }));
  await page.locator(`${FRAME}, #nuvem`).first().waitFor({ timeout: 90_000 });
  if (await page.locator(FRAME).count()) return; // já estava logado
  await page.getByRole('button', { name: 'Entrar com e-mail e senha' }).click();
  await page.locator('form input[type=email]').fill(email);
  await page.locator('form input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  // Depois do login: "Entrar na casa", um erro ou um aviso.
  const outcome = await page
    .waitForFunction(
      () => {
        if ([...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Entrar na casa')) return 'casa';
        const alert = document.querySelector('[role=alert]')?.textContent.trim();
        if (alert) return `erro:${alert}`;
        const text = document.body.innerText;
        if (text.includes('Enviamos um e-mail de confirmação')) return 'confirmar';
        if (text.includes('ainda não tem acesso')) return 'sem-casa';
        return null;
      },
      null,
      { timeout: 60_000, polling: 250 },
    )
    .then((h) => h.jsonValue())
    .catch(() => 'tempo');
  if (outcome === 'confirmar') throw new UserError('a conta de tela ainda não confirmou o e-mail: abra o link de confirmação que chegou nesse e-mail.');
  if (outcome === 'sem-casa') throw new UserError('a conta de tela não está cadastrada na casa: o responsável adiciona em Configurações → Sincronização na nuvem → Contas de tela.');
  if (outcome === 'tempo') throw new UserError('o login não terminou em 60 segundos.');
  if (outcome.startsWith('erro:')) throw new UserError(`login recusado: ${outcome.slice(5)}`);
  await Promise.all([page.waitForEvent('load', { timeout: 60_000 }), page.getByRole('button', { name: 'Entrar na casa' }).click()]);
}

const hhmm = (ms, tz) => {
  const p = zonedParts(ms, tz);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/** Saída para os próximos passos do workflow (publicado=true|false). */
async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function publish(outRoot) {
  const email = (process.env.PANELAI_TELA_EMAIL ?? '').trim();
  const password = process.env.PANELAI_TELA_SENHA ?? '';
  if (!email || !password) {
    throw new UserError('defina PANELAI_TELA_EMAIL e PANELAI_TELA_SENHA (no GitHub: Settings → Secrets and variables → Actions). Veja docs/DISPLAY.md.');
  }
  if (!isValidTimeZone(START_TZ)) throw new UserError(`fuso inválido: ${START_TZ}`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 2000, height: 2000 },
      deviceScaleFactor: 1,
      locale: 'pt-BR',
      timezoneId: START_TZ,
      // Sempre a versão publicada mais recente, sem cache de service worker.
      serviceWorkers: 'block',
    });
    // App Check com reCAPTCHA (opcional): navegadores automáticos usam um token de depuração.
    const debugToken = process.env.PANELAI_APPCHECK_DEBUG_TOKEN;
    if (debugToken) {
      await context.addInitScript((t) => {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = t;
      }, debugToken);
    }
    const page = await context.newPage();
    page.on('pageerror', (e) => console.warn('Erro na página:', firstLine(e)));

    await signIn(page, email, password);
    let info = await readScreenInfo(page, screenUrl({ publish: true }));
    const { device } = info;
    if (!device.code) {
      console.log('Publicação desligada (Configurações → Tela e-ink): nenhuma imagem gravada.');
      await setOutput('publicado', 'false');
      return;
    }
    if (!isValidPublishCode(device.code)) throw new UserError('código do endereço inválido nas configurações da casa.');
    // O código é a chave do endereço: some de qualquer log do GitHub daqui em diante.
    if (inGitHub) console.log(`::add-mask::${device.code}`);

    // O relógio da página precisa ser o da casa ("hoje", "amanhã", hora do card).
    if (device.timeZone !== START_TZ) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setTimezoneOverride', { timezoneId: device.timeZone });
      await page.reload({ waitUntil: 'load' });
    }

    // Perto de um horário de atualização, a imagem já sai "para" ele.
    const nowMs = Date.now();
    const refMs = renderMoment(device, nowMs);
    const moment = Math.floor(refMs / 1000);
    info = await readScreenInfo(page, screenUrl({ publish: true, moment }), moment * 1000);

    const png = await toOneBit(context, await shoot(page), THRESHOLD);
    const size = pngSize(png);
    if (size.width !== info.layout.width || size.height !== info.layout.height) {
      throw new UserError(`imagem com tamanho inesperado: ${size.width}×${size.height} (layout ${info.layout.width}×${info.layout.height}).`);
    }
    const config = buildDeviceConfig({ device, nowMs, referenceMs: refMs, width: size.width, height: size.height });
    const dir = path.join(path.resolve(outRoot), PUBLISH_DIR, device.code);
    await writeAtomic(path.join(dir, IMAGE_FILE), png);
    await writeAtomic(path.join(dir, CONFIG_FILE), `${JSON.stringify(config)}\n`);
    await setOutput('publicado', 'true');
    console.log(
      `Imagem publicada: layout "${info.layout.name}", ${size.width}×${size.height}, ${png.length} bytes, ` +
        `feita para ${hhmm(refMs, device.timeZone)} (${device.timeZone}). Próximas atualizações: ` +
        `${config.proximas.slice(0, 3).map((s) => hhmm(s * 1000, device.timeZone)).join(', ') || 'nenhuma (só pelo botão)'}.`,
    );
    if (info.layout.colorMode !== 'bw') console.warn('Aviso: o layout não está em "Preto e branco"; cores e cinzas viram preto ou branco na tela.');
  } finally {
    await browser.close();
  }
}

// ---------- 2. Computador da casa ----------

async function login() {
  await mkdir(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${SITE}#/cardapio`);
  console.log('Entre com um e-mail cadastrado na casa (tela de entrar) e toque em "Entrar na casa".');
  console.log('Depois feche a janela do navegador. O login fica guardado em', PROFILE);
  await new Promise((resolve) => ctx.on('close', resolve));
}

let ctx = null;
let page = null;
let openedAt = 0;

async function ensurePage() {
  // Reabre uma vez por dia para pegar versões novas do PanelAI.
  if (page && Date.now() - openedAt < 24 * 3600_000) return page;
  await ctx?.close().catch(() => {});
  await mkdir(PROFILE, { recursive: true });
  ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 2000, height: 2000 }, deviceScaleFactor: 1 });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.warn('Erro na página:', firstLine(e)));
  await page.goto(screenUrl());
  openedAt = Date.now();
  return page;
}

async function render() {
  const p = await ensurePage();
  try {
    await waitForScreen(p);
  } catch (err) {
    throw new UserError(`${err.message}. Rode com --entrar se ainda não entrou na conta.`);
  }
  if (MODE === 'bw') return toOneBit(ctx, await shoot(p, { rotate: ROTATE }), THRESHOLD);
  return shoot(p, { rotate: ROTATE, filter: MODE === 'gray' ? 'grayscale(1)' : '' });
}

let latest = null;
let latestAt = null;

async function renderAndSave() {
  const png = await render();
  latest = png;
  latestAt = new Date();
  if (OUT) await writeAtomic(OUT, png);
  console.log(`${latestAt.toLocaleString('pt-BR')} — imagem gerada (${png.length} bytes)${OUT ? ` em ${OUT}` : ''}`);
}

function serve(port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/tela.png') {
      if (!latest) {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Imagem ainda não gerada');
      }
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'last-modified': latestAt.toUTCString() });
      return res.end(latest);
    }
    if (url.pathname === '/') {
      // Página simples para navegadores de e-reader (Kindle): só a imagem, recarregando sozinha.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="${Math.max(60, EVERY_MIN * 60)}"><title>PanelAI</title><style>html,body{margin:0;background:#fff}img{display:block;width:100%;height:auto}</style></head><body><img src="/tela.png?t=${Date.now()}" alt="PanelAI"></body></html>`,
      );
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => {
    const ips = Object.values(os.networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => n.address);
    console.log(`Servindo em ${(ips.length ? ips : ['localhost']).map((ip) => `http://${ip}:${port}/tela.png`).join(' , ')}`);
  });
}

// ---------- Início ----------

const report = (err) => console.error('Não foi possível gerar a imagem:', err instanceof UserError ? err.message : (err?.stack ?? err));

if (args.publicar) {
  try {
    await publish(args.publicar === true ? 'dist' : String(args.publicar));
    process.exit(0);
  } catch (err) {
    report(err);
    process.exit(1);
  }
}

if (args.entrar) {
  await login();
  process.exit(0);
}

try {
  await renderAndSave();
} catch (err) {
  report(err);
  if (!PORT) process.exit(1);
}

if (!PORT && !args['a-cada']) {
  await ctx?.close();
  process.exit(0);
}

if (PORT) serve(PORT);
setInterval(() => {
  renderAndSave().catch(report);
}, Math.max(1, EVERY_MIN) * 60_000);
