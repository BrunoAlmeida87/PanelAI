// Gera a imagem (PNG) da tela do display e-ink e, opcionalmente, a serve na
// rede de casa. Para aparelhos que não rodam o PanelAI (Kindle, Inkplate,
// TRMNL, ESP32…): eles só baixam a imagem pronta.
//
// Roda num computador da casa que fica ligado (ex.: Raspberry Pi ou um PC).
// Os dados não saem da sua rede: o navegador deste computador entra na conta
// da casa, abre a tela do display e tira a "foto".
//
// Requisitos: Node.js 20+ e Playwright com Chromium:
//   npm i -g playwright && npx playwright install chromium
//
// Uso:
//   1. Entrar na conta (só uma vez; abre uma janela do navegador):
//        npm run display:png -- --entrar
//   2. Gerar uma imagem:
//        npm run display:png -- --saida tela.png
//   3. Gerar a cada 15 minutos e servir em http://<ip-deste-computador>:8080/tela.png
//        npm run display:png -- --servir 8080 --a-cada 15
//
// Opções:
//   --site URL      endereço do PanelAI (padrão: o site publicado)
//   --layout ID     layout a usar (padrão: o ativo em Configurações do display)
//   --perfil PASTA  onde guardar o login do navegador (padrão: ~/.panelai-display)
//   --cinza         converte para tons de cinza
//   --pb            converte para preto e branco puro (1 bit)
//   --girar 90      gira a imagem (90, 180 ou 270), para telas montadas de lado
//
// A página fica aberta entre uma imagem e outra: as alterações chegam pela
// sincronização em tempo real e cada nova imagem não relê todos os dados.

import { createServer } from 'node:http';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

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
const FILTER = args.pb ? 'grayscale(1) contrast(1000%)' : args.cinza ? 'grayscale(1)' : '';

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com:\n  npm i -g playwright && npx playwright install chromium');
  process.exit(1);
}

const screenUrl = () => `${SITE}#/display/tela?exato=1${args.layout ? `&id=${encodeURIComponent(args.layout)}` : ''}`;

async function login() {
  await mkdir(PROFILE, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${SITE}#/ajustes`);
  console.log('Entre na conta da casa em Configurações → Sincronização na nuvem e toque em "Usar os dados da casa".');
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
  page.on('pageerror', (e) => console.warn('Erro na página:', String(e).split('\n')[0]));
  await page.goto(screenUrl());
  openedAt = Date.now();
  return page;
}

async function render() {
  const p = await ensurePage();
  const frame = p.locator('.display-fullscreen .eink-frame').first();
  try {
    await frame.waitFor({ timeout: 90_000 });
  } catch {
    const text = (await p.locator('body').innerText().catch(() => '')).slice(0, 300);
    throw new Error(`a tela do display não apareceu. Na página: "${text.replace(/\s+/g, ' ')}". Rode com --entrar se ainda não entrou na conta.`);
  }
  await p.evaluate(() => document.fonts?.ready);
  await p.waitForTimeout(800);
  // Coloca a tela no canto (girada, se pedido), tira a foto e desfaz.
  const size = await p.evaluate(
    ({ filter, rotate }) => {
      const el = document.querySelector('.display-fullscreen .eink-frame');
      const { width: w, height: h } = el.getBoundingClientRect();
      const t = { 0: 'none', 90: `translate(${h}px,0) rotate(90deg)`, 180: `translate(${w}px,${h}px) rotate(180deg)`, 270: `translate(0,${w}px) rotate(270deg)` }[rotate];
      Object.assign(el.style, { position: 'fixed', left: '0', top: '0', margin: '0', zIndex: '10', transformOrigin: 'top left', transform: t, filter: filter || 'none' });
      document.querySelector('.fs-hint')?.remove();
      return { w: Math.round(w), h: Math.round(h) };
    },
    { filter: FILTER, rotate: ROTATE },
  );
  const rotated = ROTATE === 90 || ROTATE === 270;
  const clip = { x: 0, y: 0, width: rotated ? size.h : size.w, height: rotated ? size.w : size.h };
  const png = await p.screenshot({ clip, type: 'png' });
  await p.evaluate(() => {
    const el = document.querySelector('.display-fullscreen .eink-frame');
    for (const k of ['position', 'left', 'top', 'margin', 'z-index', 'transform-origin', 'transform', 'filter']) el?.style.removeProperty(k);
  });
  return png;
}

let latest = null;
let latestAt = null;

async function renderAndSave() {
  const png = await render();
  latest = png;
  latestAt = new Date();
  if (OUT) {
    await mkdir(path.dirname(OUT), { recursive: true });
    const tmp = `${OUT}.tmp`;
    await writeFile(tmp, png);
    await rename(tmp, OUT);
  }
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

if (args.entrar) {
  await login();
  process.exit(0);
}

try {
  await renderAndSave();
} catch (err) {
  console.error('Não foi possível gerar a imagem:', err.message);
  if (!PORT) process.exit(1);
}

if (!PORT && !args['a-cada']) {
  await ctx?.close();
  process.exit(0);
}

if (PORT) serve(PORT);
setInterval(() => {
  renderAndSave().catch((err) => console.error('Não foi possível gerar a imagem:', err.message));
}, Math.max(1, EVERY_MIN) * 60_000);
