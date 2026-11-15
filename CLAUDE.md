# PanelAI — contexto para o Claude

App da casa do Bruno (em português): cardápio da semana, receitas, lista de compras,
despensa, tarefas da casa e um editor do que aparece numa tela e-ink.
Site: https://brunoalmeida87.github.io/PanelAI/ (GitHub Pages, publica a partir da `main`).

## Preferências do usuário

- Responder e escrever a interface em **português do Brasil**, linguagem simples (não é desenvolvedor).
- O casal usa junto: Bruno (responsável pela casa na nuvem) e a esposa, cada um no seu celular.
- Publicar = juntar na `main` (PR + merge) **só quando ele pedir**; o workflow publica sozinho.
- Antes de publicar algo que precise de regras novas do Firestore, pedir para ele republicar `firestore.rules`.
- **Só quem tem login altera dados**: com a nuvem configurada, o app abre numa tela de login (`mode: 'gate'`),
  sem modo local. Criação de casas novas bloqueada nas regras. Importar/restaurar/começar do zero só para o responsável.

## Hardware do display

- **Tela e-ink: Seeed Studio reTerminal E1001** — 7,5" e-paper **preto e branco**, 800 × 480, ESP32-S3.
  Já é o modelo padrão do editor (`reterminal-e1001` em `src/display/model.js`).
- Não tem navegador: precisa receber uma **imagem** (ou ser programado via ESPHome/SenseCraft).
  O PanelAI já gera a tela em `#/display/tela?exato=1` (800 × 480); falta o caminho que transforma
  isso em imagem para o aparelho, com acesso **só de leitura** (sem usar a conta pessoal):
  - Raspberry Pi em casa gerando a imagem periodicamente; ou
  - Função no Firebase (exige plano Blaze) servindo a imagem num endereço secreto.
- Layouts do display ficam na coleção `displayLayouts`; o ativo em `settings.displayLayoutId`.

## Arquitetura

- Preact + Vite, PWA (vite-plugin-pwa), rotas por hash (`src/utils/router.js`).
- Estado em `src/storage/store.js` (write-through). Destino: IndexedDB (`src/storage/db.js`) no modo
  local ou Firestore (`src/cloud/`) no modo nuvem. Coleções em `STORES` (db.js); adicionar uma coleção
  nova = incluir em `STORES` (subir `DB_VERSION`), `store.js`, `seedOps`, `services/backup.js`.
- Nuvem: Firebase Auth (Google ou e-mail/senha) + Firestore `households/{casa}/{coleção}/{id}` com o
  JSON em `v`. Config em `src/cloud/firebase-config.js` (projeto `house-management-2c5a9`).
  Regras em `firestore.rules` (aceitam qualquer coleção com nome simples).
- Quem fez cada alteração: `src/storage/actor.js` (`currentActor()`).
- Tarefas: regras puras em `src/models/tasks.js`, ações em `src/storage/taskActions.js`.
- Display: `src/display/` (modelos, cards, presets, dados, renderização) e `src/pages/DisplayPage.jsx`.

## Comandos

```bash
npm test                                   # Vitest (regras de negócio)
npm run build
VITE_FIREBASE_CONFIG='{}' npm run build && npm run test:e2e   # e2e sem nuvem (o ambiente bloqueia o Google)
```

Testes com a nuvem: emuladores do Firebase (`firebase.json`) e build com
`VITE_FIREBASE_CONFIG='{"apiKey":"demo","projectId":"demo-panelai",...}' VITE_FIREBASE_EMULATOR=127.0.0.1`.
