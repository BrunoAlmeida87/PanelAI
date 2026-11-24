# CLAUDE.md — contexto do PanelAI para sessões futuras

PanelAI é o app de organização da casa do dono do repositório: cardápio da semana, receitas, lista de compras,
despensa/mercado do mês, tarefas da casa e um **display e-ink** (tela física na cozinha).
Publicado em https://brunoalmeida87.github.io/PanelAI/ (GitHub Pages), com dados na nuvem
(Firebase Auth + Firestore, projeto `house-management-2c5a9`). Repositório **público**.

## Como trabalhar aqui

- **Idioma:** interface, textos, comentários, commits e documentação em **português do Brasil**, em
  linguagem simples (o dono não é programador). Explique decisões em termos práticos.
- **Stack:** Preact 11 + Vite 8 (JS puro, sem TypeScript), PWA (vite-plugin-pwa), roteamento por hash
  (`#/rota`), estado global próprio (`src/storage/store.js`), IndexedDB local ou Firestore na nuvem.
  Ícones lucide-preact. Node 22 no CI (20+ local).
- **Regras de negócio são funções puras** em `src/services`, `src/models`, `src/display` (testadas em
  `tests/unit`). Componentes só chamam ações (`src/storage/*Actions.js`).
- **Não quebre dados salvos:** IDs e formatos persistidos são estáveis; dados antigos passam por
  normalização (ex.: `normalizeDisplayDevice`). `settings` é um registro só (`meta/settings`), mesclado
  com `DEFAULT_SETTINGS` (`src/models/constants.js`).
- **Depois de mudar código, rode:** `npm run lint` (deve ficar em 0 erros; há 9 avisos antigos de
  hooks), `npm test`, e conforme o caso `npm run build:e2e && npm run test:e2e` e `npm run test:cloud`
  (emuladores do Firebase; precisa de Java; baixa o emulador de storage.googleapis.com).
- **Commits/PR:** só quando o dono pedir. Mensagens em português.

## Comandos

| Comando | O quê |
|---|---|
| `npm run dev` | servidor local (http://localhost:5173/PanelAI/) |
| `npm test` | testes de unidade (Vitest) |
| `npm run lint` | ESLint |
| `npm run build` / `build:e2e` | build de produção / sem nuvem (para os testes de tela) |
| `npm run test:e2e` | ponta a ponta no Chromium (precisa do `build:e2e`) |
| `npm run test:cloud` | nuvem, regras, login e publicação do display nos emuladores |
| `npm run display:png -- …` | imagem do display (modo local ou `--publicar`) |

## Mapa do código

- `src/App.jsx` — cabeçalho, navegação, portão de login (`mode === 'gate'`), conta de tela
  (`cloud.readOnly` → `ViewerNotice`), rota `#/display/tela` sem menus, tarefas fixas (`RecurringTasks`).
- `src/storage/store.js` — estado, persistência (`persist`), modos `local | cloud | gate | demo`.
- `src/cloud/` — `cloud.js` (Firebase: login, casa, sync em tempo real, manutenção), `session.js`
  (liga estado ↔ nuvem; cache da casa e do papel no localStorage), `layout.js` (formato no Firestore).
- `src/display/` — `model.js` (telas, cards, layouts), `data.js` (dados dos cards), `DisplayRender.jsx`,
  `schedule.js` (agenda da tela física e contrato do `config.json`).
- `src/pages/` — telas; `settings/CloudSection.jsx` (login, pessoas e contas de tela),
  `settings/DisplayDeviceSection.jsx` (Configurações → Tela e-ink).
- `firestore.rules` — segurança. **Mudou? O dono precisa publicar no console do Firebase**
  (avise e documente em `docs/FIREBASE.md`, seção "Ao atualizar o PanelAI").
- `scripts/display-png.mjs` + `scripts/lib/png.mjs` — gera a imagem do display (PNG 1 bit sem deps).
- `esphome/panelai-tela.yaml` — programa (firmware ESPHome) da tela e-ink; regras em C++ em
  `esphome/panelai_tela.h` (testes `esphome/testes/`); instalador pelo navegador em
  `public/instalar-tela.html`.
- Docs: `README.md`, `docs/FIREBASE.md` (nuvem), `docs/DISPLAY.md` (tela e-ink, passo a passo).

## Nuvem (Firebase)

- `households/{casa}`: `name`, `ownerEmail`, `memberEmails[]` (pessoas: leem e gravam),
  `viewerEmails[]` (**contas de tela: só leitura**, até 3), `createdAt`. Dados em
  `households/{casa}/{coleção}/{id}` com `{ v: JSON, t, by }`. Detalhes em `src/cloud/layout.js`.
- Login obrigatório quando a nuvem está configurada; e-mail precisa estar confirmado.
- Criação de casas bloqueada nas regras (`allow create: if false`).
- Conta de tela: `findMyHousehold` devolve `role` (`member`/`viewer`); com `viewer` o app fica em
  `cloud.readOnly`: não grava (writer recusa), não roda manutenção nem cria tarefas fixas, e fora de
  `#/display/tela` mostra só o aviso `ViewerNotice`.

## Display e-ink (decisões já tomadas — não refazer sem o dono pedir)

- **Aparelho (confirmado por foto em 24/11/2026):** **kit TRMNL 7,5" (OG) DIY da Seeed** — XIAO
  ESP32-S3 Plus + "XIAO ePaper Display Board" + tela 7,5" 800 × 480 preto e branco (UC8179) +
  bateria 2000 mAh. **Não** é o reTerminal E1001 (o dono chamava de "reTerminal"; a primeira versão
  do firmware foi feita para o E1001 por engano e foi substituída).
- **Programa próprio, não o do TRMNL:** o kit vem com o firmware do TRMNL, que pede licença paga
  (BYOD, ~US$ 50) ou servidor próprio. O dono **recusou o TRMNL** ("quero o meu programa"). Usamos
  **ESPHome** (suporte oficial da Seeed para o kit), firmware genérico **sem segredos**:
  Wi-Fi por Improv (no instalador) ou pela rede `PanelAI-Tela` (senha `panelai123`, captive portal);
  endereço da imagem colado na página do aparelho (entidade `text` "Endereço da imagem",
  `restore_value`). Pinos: SPI CLK 7 / MOSI 9; tela CS 44, DC 10, RST 38, BUSY 4 (invertido),
  `epaper_spi` modelo `waveshare-7.5in-v2`; botões D1 GPIO2, D2 GPIO3, **D4 GPIO5 (acorda, ext0)**;
  bateria ADC GPIO1 com ADC_EN GPIO6. Botão: apertar = atualizar; segurar 5 s = modo de configuração
  (fica acordado até 15 min com instruções na tela).
- **Instalação:** `public/instalar-tela.html` (ESP Web Tools 10.4.0 via unpkg) lê
  `https://raw.githubusercontent.com/BrunoAlmeida87/PanelAI/firmware/manifest.json` (raw tem CORS).
  O branch `firmware` (um commit só) é publicado pelo `esphome.yml` a cada mudança em `esphome/` na
  main. Voltar ao TRMNL: trmnl.com/flash.
- **Sem computador ligado em casa.** A tela atualiza **nos horários escolhidos em Configurações →
  Tela e-ink** (um ou mais, ex.: 06:00 e 18:00) buscando a imagem **pela internet**.
- **Programas de fábrica descartados:** SenseCraft HMI (Seeed) e TRMNL só atualizam por intervalo e
  não passam do login do PanelAI; o TRMNL ainda é pago.
- **Quem gera a imagem:** GitHub Actions (`.github/workflows/display.yml`, a cada 30 min, minutos
  17 e 47, e depois de cada deploy) roda `node scripts/display-png.mjs --publicar dist`: entra no site
  publicado com a **conta de tela** (segredos `PANELAI_TELA_EMAIL`/`PANELAI_TELA_SENHA`), abre
  `#/display/tela?exato=1&publicar=1&momento=<epoch>`, tira a foto, converte para 1 bit e grava
  `dist/tela/<código>/tela.png` + `config.json`; depois republica o **mesmo** site (build da última
  publicação bem-sucedida da main; o build é determinístico, então o service worker não muda) com a
  imagem, e apaga o artefato da execução.
- **Endereço secreto:** `settings.displayDevice.code` (32 caracteres, gerado no app). O script mascara
  o código nos logs (`::add-mask::`). Nunca imprima o código nem o caminho completo.
- **Momento da imagem:** perto de um horário (≤ 60 min), a imagem é gerada "para" ele
  (`renderMoment`), então meia-noite mostra o dia novo. O fuso da casa vem de `displayDevice.timeZone`
  (o script ajusta o fuso do navegador via CDP).
- **Contrato `config.json` v1** (`buildDeviceConfig`): `versao, gerado, referencia, horarios, fuso,
  proximas[] (epoch UTC, até 24), largura, altura`. Mudar campos exige mudar o firmware e subir
  `DEVICE_CONFIG_VERSION`.
- **Aparelho:** dorme no máximo 6 h por vez (relógio do ESP32 deriva), última soneca ≤ 1 h antes do
  horário; nas acordadas intermediárias só relê o `config.json`; no horário/botão/ligado baixa a
  imagem e redesenha; falhas tentam de novo em 5/10/20/30 min; vigia de 150 s. Essas regras ficam em
  `esphome/panelai_tela.h` (C++ puro, testado com g++ no CI) — mude lá, não nos lambdas.
- **Tarefas fixas no display:** `buildDisplayData` inclui ocorrências ainda não criadas
  (`missingRecurring`) sem gravar — a conta de tela não grava.
- **CI do firmware:** `.github/workflows/esphome.yml` testa as regras (g++), valida e compila com
  ESPHome 2026.11.0; na main publica o firmware. Aqui no ambiente do Claude os hosts do
  PlatformIO/Espressif costumam estar bloqueados: `esphome config` funciona (`pip install esphome`),
  a compilação só no CI — **sempre confira o resultado do CI** depois de mudar o YAML (já pegou erro
  de C++ que a validação não pega).
- **Modo local antigo** (`npm run display:png -- --servir 8080`, Raspberry Pi na rede de casa) continua
  existindo para outras telas, mas **não** é o caminho da tela da casa.

## Armadilhas conhecidas

- Workflows agendados (`schedule`) só rodam a partir da branch `main`; o GitHub desativa agendamentos
  após 60 dias sem atividade no repositório (o workflow tenta se reativar via API).
- Deploys do Pages: `deploy.yml` e `display.yml` compartilham o grupo de concorrência `pages-deploy`.
  Um deploy do site sem a imagem é seguido pelo `display.yml` (gatilho `workflow_run`).
- Repositório público: artefatos e logs de Actions são públicos. Segredos só em Secrets; o artefato
  do Pages com a imagem é apagado no job `limpar`.
- A chave da API do Firebase pode estar restrita por referenciador a `brunoalmeida87.github.io`:
  por isso o script fotografa o **site publicado**, não um servidor local.
- Em JSX/Preact, hooks antes de qualquer `return` condicional (há um caso em `DisplayScreen`).
- O service worker do PWA não pode tratar `/tela/…` e `/instalar-tela.html` como telas do app
  (`navigateFallbackDenylist` no `vite.config.js`), senão o link da imagem abre o app.
- `__APP_VERSION__` vem do `package.json` (definido no `vite.config.js`); ao lançar versão, suba o
  `version` do `package.json` (e do `package-lock.json`).
