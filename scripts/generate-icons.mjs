// Gera os ícones PNG a partir dos SVGs usando o Chromium do Playwright.
// Uso: npm run icons (requer playwright instalado no ambiente).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = path.join(root, 'public');

const logo = await readFile(path.join(pub, 'logo.svg'), 'utf8');
// Versão "maskable": fundo ocupando tudo e símbolo dentro da zona segura (80%).
const maskable = logo
  .replace('<rect width="512" height="512" rx="120" fill="#E7EFE8"/>', '<rect width="512" height="512" fill="#E7EFE8"/><g transform="translate(64 64) scale(.75)">')
  .replace('</svg>', '</g></svg>');

const targets = [
  { file: 'icon-192.png', svg: logo, size: 192, transparent: true },
  { file: 'icon-512.png', svg: logo, size: 512, transparent: true },
  { file: 'apple-touch-icon.png', svg: logo.replace('rx="120"', 'rx="0"'), size: 180, transparent: false },
  { file: 'icon-maskable-512.png', svg: maskable, size: 512, transparent: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.svg.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: path.join(pub, t.file), omitBackground: t.transparent });
  console.log('gerado', t.file);
}
await browser.close();
