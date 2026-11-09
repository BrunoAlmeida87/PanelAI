import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// O site é publicado em https://brunoalmeida87.github.io/PanelAI/,
// por isso todos os caminhos partem de /PanelAI/.
const base = process.env.PANELAI_BASE ?? '/PanelAI/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'logo.svg', 'logo-horizontal.svg', 'apple-touch-icon.png'],
      manifest: false, // usamos public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Só os subconjuntos latinos da fonte (português) entram no cache offline.
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
  },
});
