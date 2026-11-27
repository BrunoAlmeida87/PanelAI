# CLAUDE.md — contexto do PanelAI para sessões futuras

PanelAI é o app de organização da casa do dono do repositório: cardápio da semana, receitas, lista de compras,
despensa/mercado do mês, tarefas da casa, guia **Montessori** (atividades para a criança de 0 a 3 anos) e um
**display e-ink** (tela física na cozinha).
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
- `src/models/montessori.js` — faixas, categorias, idade (corrigida p/ prematuros), registros e sugestões do
  dia (funções puras, `tests/unit/montessori.test.js`); biblioteca em `src/data/montessori_activities.json`
  (lida por `src/data/montessoriLibrary.js`); ações em `src/storage/montessoriActions.js`; tela em
  `src/pages/MontessoriPage.jsx` + `src/pages/montessori/`.
- `src/display/` — `model.js` (telas, cards, layouts), `data.js` (dados dos cards), `DisplayRender.jsx`,
  `schedule.js` (agenda da tela física e contrato do `config.json`), `github.js` (pedido da imagem ao
  GitHub e regras da geração automática). `src/components/ScreenAutoUpdate.jsx` pede a imagem sozinho
  depois de mudanças (montado no `App.jsx`).
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
  `epaper_spi` modelo `waveshare-7.5in-v2`; botões na lateral KEY1 = D1 GPIO2, KEY2 = D2 GPIO3, **KEY3 = D4 GPIO5 (acorda, ext0)** e RESET;
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
- **Quem gera a imagem:** GitHub Actions (`.github/workflows/display.yml`) roda
  `node scripts/display-png.mjs --publicar dist`: entra no site publicado com a **conta de tela**
  (segredos `PANELAI_TELA_EMAIL`/`PANELAI_TELA_SENHA`), abre
  `#/display/tela?exato=1&publicar=1&momento=<epoch>`, tira a foto, converte para 1 bit e grava
  `dist/tela/<código>/tela.png`, **`tela-<horário>.png` para cada item de `proximas`** (cada uma com o
  `momento` do seu horário, ou seja, os dados do seu dia) e `config.json`; depois republica o **mesmo**
  site (build da última publicação bem-sucedida da main; o build é determinístico, então o service
  worker não muda) com as imagens, e apaga o artefato da execução. Concorrência sem cancelar a que está
  rodando (só o pedido mais novo fica na fila).
- **Quando roda (1.7.0):** o agendamento do GitHub (`17,47 * * * *`) é **só reserva**: na prática ele
  atrasa horas ou é pulado (em 24/11/2026 rodou 1 de ~34 vezes). O caminho principal é o **site pedir**
  (`workflow_dispatch` via `POST /repos/{repo}/actions/workflows/display.yml/dispatches`, ref `main`)
  com a **chave do GitHub da casa** (token fine-grained, só "Actions: Read and write" no repositório),
  guardada em **`meta/github` (`{ token }`)**, fora de `settings` para não ir aos backups
  (`seedOps` preserva a chave em importar/restaurar demonstração/começar do zero). Pedidos:
  (1) botão **Atualizar a tela agora** (Configurações → Tela e-ink) grava `displayDevice.requestedAt`,
  espera a gravação chegar ao servidor (`cloudSaved`: `writeOps` não espera o servidor) e só então
  dispara; (2) **geração automática** (`src/components/ScreenAutoUpdate.jsx`, `onPersist` do store):
  depois de gravações deste aparelho que aparecem na tela (`touchesDisplay`), espera 60 s parado e no
  mínimo 10 min entre pedidos (`nextAutoRequest`); ao esconder o app, pede já com `keepalive`. Regras
  puras em `src/display/github.js`. Viewer/readOnly nunca pede. Link de criação da chave já
  preenchido (`tokenCreationUrl`: `name`, `description`, `expires_in=none`, `actions=write`; o
  repositório não dá para preencher).
- **Endereço secreto:** `settings.displayDevice.code` (32 caracteres, gerado no app). O script mascara
  o código nos logs (`::add-mask::`). Nunca imprima o código nem o caminho completo.
- **Momento da imagem:** perto de um horário (≤ 60 min), a imagem é gerada "para" ele
  (`renderMoment`), então meia-noite mostra o dia novo. O fuso da casa vem de `displayDevice.timeZone`
  (o script ajusta o fuso do navegador via CDP).
  O "Atualizado às" do card de data usa a hora **real** da geração (`data.updatedAt`, terceiro
  argumento de `buildDisplayData`), não o momento — antes mostrava sempre o horário agendado (ex.: 00:00).
- **Contrato `config.json` v2** (`buildDeviceConfig`): `versao, gerado, referencia, horarios, fuso,
  proximas[] (epoch UTC, até 24), pedido (requestedAt em s; 0 = nunca), conferir_cada (s; 0 = não
  confere), conferir[] (pares início/fim das 06:00–23:00 no fuso da casa, 8 dias), largura, altura`.
  Mudar campos exige mudar o firmware e subir `DEVICE_CONFIG_VERSION`. `displayDevice` ganhou
  `checkMinutes` (5/10/15/30/0, padrão 10), `autoGenerate` (padrão true) e `requestedAt`.
- **Aparelho (firmware 1.7.0):** dorme no máximo 6 h por vez (relógio do ESP32 deriva), última
  soneca ≤ 1 h antes do horário; das 6h às 23h acorda também a cada `conferir_cada` para conferir
  pedidos (`ate_conferir`; com falha vale só a espera por falhas); nas acordadas intermediárias só
  relê o `config.json`; no horário/botão/ligado/**pedido novo** (`pedido_novo`: `pedido != 0 &&
  pedido != ultimo_pedido`, com `!=` por causa de relógio de celular adiantado) baixa a imagem e
  redesenha; a imagem é `tela-<horário>.png` do horário mais recente já chegado e mais novo que
  `referencia` (`horario_da_imagem`), senão `tela.png` (e cai para `tela.png` se a do horário faltar);
  falhas tentam de novo em 5/10/20/30 min; vigia de 150 s. Essas regras ficam em
  `esphome/panelai_tela.h` (C++ puro, testado com g++ no CI) — mude lá, não nos lambdas.
- **Reinstalar o firmware** (versão nova): pelo instalador; a imagem `factory.bin` começa no endereço
  0 e cobre a NVS, então o aparelho **normalmente esquece Wi-Fi e endereço** (o instalador pede o Wi-Fi;
  o dono cola o endereço de novo). O firmware não tem OTA.
- **Card de clima** (`weather`): previsão do **Open-Meteo** (grátis, sem chave, CORS liberado), pedida
  pelo navegador com o fuso do navegador. Regras puras em `src/display/weather.js` (testes
  `tests/unit/weather.test.js`); busca e cache (memória + localStorage até 12 h) em
  `src/display/useWeather.js`. A cidade fica nas opções do card (`options.place = { name, label, lat, lon }`,
  campo `type: 'place'` no editor). `#/display/tela?publicar=1` só expõe `#panelai-publicacao` depois que
  a previsão chegou (ou após 20 s), para a foto não sair sem o clima. Aqui no ambiente do Claude os hosts
  do Open-Meteo costumam estar bloqueados: teste com `page.route` (Playwright) simulando a resposta.
- **Tarefas fixas no display:** `buildDisplayData` inclui ocorrências ainda não criadas
  (`missingRecurring`) sem gravar — a conta de tela não grava.
- **CI do firmware:** `.github/workflows/esphome.yml` testa as regras (g++), valida e compila com
  ESPHome 2026.11.0; na main publica o firmware. Aqui no ambiente do Claude os hosts do
  PlatformIO/Espressif costumam estar bloqueados: `esphome config` funciona (`pip install esphome`),
  a compilação só no CI — **sempre confira o resultado do CI** depois de mudar o YAML (já pegou erro
  de C++ que a validação não pega).
- **Modo local antigo** (`npm run display:png -- --servir 8080`, Raspberry Pi na rede de casa) continua
  existindo para outras telas, mas **não** é o caminho da tela da casa.

## Compras e cardápio escritos à mão

- `settings.shoppingFromMenu` (padrão `true`): `false` = lista manual — o cardápio não gera itens; só os
  avulsos (`week.shopping.extras`), cada um com `marketDate` em qualquer dia da semana
  (`shoppingDates`). A tela de compras mostra "Escrever compras" (um item por linha,
  `parseShoppingText` entende "2 kg de batata"). O card do display tem `options.day` = `week|today|tomorrow`.
- Refeição escrita à mão = entrada `kind: 'text'` (já existia). No seletor, aba **Escrever** (lembra a
  última aba usada) e, na busca de receitas, "Usar “…” escrito à mão".
- **Histórico de comidas escritas** (`meta/mealTexts`, regras puras em `src/services/mealTexts.js`,
  testes `tests/unit/mealTexts.test.js`): `{ [chave normalizada]: { text, n, last, hidden? } }`, mesclado
  item a item na nuvem (`markFields` → `mt`). Guardado à parte porque semanas vão para o arquivo depois de
  120 dias. `addMeals`/`replaceMeal`/`updateMeal` registram o uso (`rememberMealTexts`). Sugestões =
  histórico + textos das semanas abertas; enquanto digita, filtra sem acento (começa-com primeiro). A
  **lixeira** marca `hidden` (some mesmo se a comida ainda está numa semana; volta só se escrita e salva de
  novo), com "Desfazer". Entra no backup (`data.mealTexts`, opcional; importar junta com o atual) e fica ao
  restaurar demonstração/começar do zero. Na busca de receitas também aparecem as escritas parecidas.
- **Categorias das comidas escritas** (opcionais): entrada `kind: 'text'` pode ter `composition[]` e
  `protein` (mesmas listas das receitas, `cleanMealTags` marca `proteina` junto com o tipo). `balanceStats`
  conta a escrita que tem categoria. O histórico guarda as categorias (`rememberedItem` com `tags`; sem
  `tags` mantém as anteriores; `count: false` ao só mudar categoria) e o seletor pré-marca pela comida igual
  (`knownMealTags`). Componente `src/pages/menu/MealTags.jsx` (aba Escrever e detalhe da refeição).
- **Composição** (`COMPOSITION`): `proteina`, `vegetal` (mostrado como **"Legumes e verduras"**; o id fica
  por causa dos dados salvos), `fruta` ("Frutas", desde 27/11/2026), `carboidrato`, `leguminosa` (grãos:
  feijão, lentilha, grão-de-bico), `massa`. Batata/mandioca contam como Carboidrato; tomate como Legumes e
  verduras (uso na cozinha). Barras do equilíbrio usam `subgrid` para o nome maior caber numa linha.

- **Estoque simples** (aba Estoque do Mercado do mês, 27/11/2026, pedido do dono): quadro com uma coluna por
  categoria (`pantryBoard`, CSS `columns`), produto + quantidade **sem unidade** (stepper `bare`), campo
  "Adicionar…" em cada categoria (`parseQuickProduct`: "Leite 6", "6 leite", "2x pão"; sem número = 1) →
  `quickAddPantryProduct` (reaproveita produto do catálogo pelo nome; novo vai com unidade `un`; grava em
  `ingredients` + `pantry`, ou seja, no banco). Categorias vazias ficam recolhidas. Mínimo, unidade e
  remover continuam no modal (toque no nome). A busca/filtros e a tabela antiga saíram.

## Montessori (decisões já tomadas)

- **Livro de referência** (Maria Stampfer, *Montessori – O guia para bebês e crianças de 0 a 3 anos*,
  Caminho Suave, 2024): o conteúdo não estava acessível. **Nenhuma atividade, idade ou página é
  atribuída ao livro**; todas as 78 são `"origem": "complementar"` com referências verificáveis
  (Montessori, Lillard & Jessen, Davies & Uzodike, Davies, OMS 2019, CDC 2022, SBP). Atividade do livro
  só com `"origem": "livro"` e `"pagina"` (o teste exige a página). Não invente referências.
- Dados: coleção `children` (`{ id, name, birthDate, gestationWeeks, plan: { date, ids, round } }`) e
  `montessoriLogs` (`{ id, childId, activityId, date, interest: baixo|medio|alto,
  autonomy: observou|ajuda|sozinha, notes }`), separadas do catálogo (atividade que sai do JSON continua
  no histórico pelo id). Registros antigos vão para `montessoriLogsArchive` (arquivo mensal).
- **Sugestões do dia** são determinísticas (criança + data + registros **anteriores** ao dia): todos os
  aparelhos e a tela e-ink veem a mesma lista sem gravar nada. Só "Novas sugestões"/"Trocar"/"Incluir"
  gravam `child.plan` para o dia. Registrar hoje não muda a lista de hoje; "Novas sugestões" mantém as
  já feitas hoje.
- Sem pontuação, metas, gráficos ou comparação entre crianças (pedido do dono). Interesse baixo só
  afasta a atividade por 14 dias.
- "Restaurar demonstração", "Começar do zero" e importar backup antigo (sem as coleções) **mantêm** a
  criança e o histórico.
- Card "Montessori hoje" no Cardápio (preferência por aparelho `panelai.montessoriHomeCard`) e card
  `montessori` no display (layout sugerido "Família").

## Armadilhas conhecidas

- **Agendamento do GitHub não é confiável** (atrasa horas ou pula): nada de importante pode depender
  só do `schedule`. Use `workflow_dispatch` pedido pelo site.
- `cloud.writeOps` resolve antes de o servidor confirmar (offline primeiro). Se outra coisa (ex.: o
  GitHub) vai ler a gravação logo depois, espere `cloud.pending` zerar (`cloudSaved` em
  `src/storage/displayActions.js`).
- Regras do Firestore não são filtros: não dá para esconder um documento (ex.: `meta/github`) de quem
  lê a coleção inteira (a conta de tela ouve `meta`). Por isso a chave do GitHub é lida também pela
  conta de tela; ela só tem permissão de Actions.
- Testes da nuvem (`run-display.mjs`) às vezes demoram na primeira sincronização da conta de tela no
  emulador; o gerador recarrega a página uma vez se ficar em "Aguardando a primeira sincronização".

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
- Menu superior com 6 módulos: só ícones de 900 a 1023 px, nomes curtos até 1279 px (`layout.css`). Ao criar
  outro módulo, confira o teste de responsividade (960, 1024 e 1200 px).
- `__APP_VERSION__` vem do `package.json` (definido no `vite.config.js`); ao lançar versão, suba o
  `version` do `package.json` (e do `package-lock.json`).
- **Tarefas feitas na tela (1.8):** cards `tasksDay`/`tasksWeek` têm `doneFor` (`'24'` padrão, `'6'`,
  `'12'`, `'48'`, `'72'` horas ou `'day'` = só no dia da tarefa). A feita fica marcada ✓ (CSS
  `.eink-box.on::after`) até `doneAt + doneFor`, comparando com o **momento** da imagem; atrasada de outro
  dia ticada aparece em "Tarefas de hoje" como "(de dd/mm)". Regra pura `doneStillVisible` em
  `src/display/data.js`. Cards antigos sem a opção usam 24 h. Some de verdade só na próxima atualização da tela.
- **Nome da refeição (1.8):** `menuDay.options.labelStyle` = `underline` (padrão: negrito e sublinhado),
  `band` (tarja preta), `divider` (linha entre refeições) ou `plain` (como antes).
- **Letras do display** (`layout.typography`, opcional; `normalizeTypography`/`typographyVars`/
  `typographyCheck` em `src/display/model.js`): `title` e `text` com `font` (6 fontes variáveis embutidas,
  `DISPLAY_FONTS`, importadas em `src/display/fonts.js` — o gerador no GitHub não tem fontes instaladas),
  `weight` (300–900, limitado ao que a fonte tem), `size`, `spacing` (`normal|open`), `title.upper`; e
  `ink` (`thin|normal|bold` = limiar 115/150/185 do preto e branco). O padrão reproduz **pixel a pixel**
  o visual antigo (conferido nos 8 layouts sugeridos): rótulos usam `--title-*`, destaques do texto usam
  `--text-weight` + 200/250/300. O limiar vai na publicação (`#panelai-publicacao` → `layout.threshold`) e o
  script usa ele, a não ser que `--limiar` seja passado. No editor: bloco **Letras** (painel "Tela") com
  avisos de letra pequena/negrito embolando e o botão **Prévia fiel** (escala 1 + filtro SVG com o mesmo
  limiar; exato com devicePixelRatio 1, aproximado no celular).
- **Editor do display: pôr/tirar cards** — painel "Tela" começa com **Cards nesta tela** (`CardList`:
  editar, lixeira, "Trocar por" = `changeCardType`, mantém lugar/tamanho/aparência). "Adicionar card" com
  a tela cheia (`hasRoomFor` falso) abre "A tela está cheia" para escolher qual card substituir (ou pôr por
  cima). No celular, tocar num card rola até o painel (`selectCard`).
