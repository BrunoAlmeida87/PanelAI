<p align="center">
  <img src="public/logo-horizontal.svg" alt="PanelAI" width="300" />
</p>

# PanelAI

Organização alimentar e doméstica em um só lugar: **cardápio da semana, receitas, lista de compras, despensa, mercado do mês e recados** — integrados. Ao escolher uma receita, o PanelAI ajusta as porções, soma os ingredientes repetidos, compara com o estoque e atualiza a lista de compras automaticamente.

**Site publicado:** https://brunoalmeida87.github.io/PanelAI/

Funciona no computador e no celular (layouts diferentes para cada um), pode ser instalado como aplicativo (PWA) e funciona offline depois do primeiro acesso. Os dados ficam salvos no próprio navegador e, se você ligar a sincronização na nuvem, iguais em todos os aparelhos da casa.

---

## Módulos

| Módulo | O que faz |
|---|---|
| **Cardápio** | Semana de segunda a domingo com lanche da manhã, almoço, lanche da tarde e jantar. Cada refeição pode ser receita (uma ou várias), marmita, refeição fora de casa ou texto livre, com porções e observações. Duplicar, transferir, substituir, marcar como preparada, repetir em outros dias. Indicadores de planejamento, equilíbrio alimentar e tarefas de preparo antecipado. Duplicar a semana anterior, salvar semanas favoritas, reaproveitar semanas, copiar para o WhatsApp e imprimir. |
| **Lista da semana** | Gerada do cardápio: ingredientes somados, convertidos e comparados com o estoque. Agrupada por dia de mercado e categoria. Marcação com um toque, itens avulsos, ajuste manual de quantidade, "já tenho em casa", rastreio de quais receitas geraram cada item, registro da compra no estoque, WhatsApp e impressão. |
| **Mercado do mês** | **Estoque** (quantidade, mínimo, desejado, última atualização), **Contagem** (inventário da despensa com rascunho salvo) e **No mercado** (compras recorrentes com reposição calculada e finalização única). |
| **Receitas** | Pratos e lanches com ingredientes estruturados, porções, tempo, dificuldade, proteína, composição, modo de preparo, marmita, congelamento, preparo antecipado e imagem opcional. Busca, filtros, favoritas, duplicar, excluir e **"Com o que tenho"** (sugestões pelo estoque). |
| **Recados** | Avisos curtos para quem mora na casa: texto, autor, fixar no topo, validade (de/até) e repetição por dia da semana ("lixo toda terça"). Os recados de hoje aparecem no topo do cardápio. |
| **Configurações e histórico** | Pessoas na casa, dias de mercado, sincronização na nuvem, exportar/importar JSON, restaurar demonstração, compras concluídas, movimentações de estoque e semanas anteriores. |

## Regras de cálculo

- **Porções:** quantidades são escaladas proporcionalmente; a receita original não muda.
- **Consolidação:** cada ingrediente tem um ID canônico e uma unidade-base. Ex.: 300 g + 500 g + 400 g de frango = **1,2 kg**. Unidades da mesma grandeza sempre convertem (kg↔g, L↔ml, colheres↔ml); entre grandezas só com dado confiável do ingrediente (densidade, peso por unidade, "1 dente de alho = 5 g"). Sem dado confiável, as quantidades ficam separadas.
- **Estoque:** `comprar = máximo(0, necessário − estoque)`, arredondado para quantidade prática. Planejar uma receita **não** desconta estoque; só "marcar como preparada" com confirmação.
- **Refeições preparadas** saem da demanda (não são compradas de novo).
- **Marmitas:** os ingredientes contam uma única vez, no lote (semana do preparo), não em cada dia em que a marmita é servida. Status: planejada → preparada → armazenada → consumida.
- **Mercado do mês:** `reposição = máximo(0, desejado + uso do cardápio da semana − estoque)`. Itens marcados como compra recorrente não entram na lista da semana, evitando compra em dobro.
- **Registrar compra:** apenas itens marcados entram no estoque, com movimentação no histórico. Como a lista é recalculada contra o estoque atualizado, um item lançado passa a "coberto" e não pode ser lançado de novo. A compra mensal é finalizada uma vez por sessão.
- **Dias de mercado:** cada item vai para o último dia de mercado antes da primeira refeição que o usa (inclui "domingo antes da semana").

## Celular e computador

- **Computador (≥ 900 px):** navegação superior, calendário com 7 colunas (4 em telas médias), indicadores lado a lado, lista em colunas por categoria, despensa em tabela editável, filtros laterais nas receitas, modais centralizados e atalhos de teclado (`1`–`5` módulos, `←`/`→` semanas, `T` semana atual, `/` buscar, `N` nova receita, `?` ajuda).
- **Celular (< 600 px):** barra inferior fixa (Cardápio, Compras, Despensa, Receitas, Recados) respeitando áreas seguras, cardápio **um dia por vez** com seletor de dias e gesto de deslizar (ou resumo da semana), seletores em tela cheia com rodapé fixo, lista de compras com linhas grandes (tocar marca), categorias recolhíveis, contagem de restantes fixa no topo, estoque em cartões com botões − / +, filtros em painel.
- **Tablet (600–899 px):** barra inferior e calendário em 2 colunas.
- Alvos de toque ≥ 44 px, foco visível, rótulos acessíveis, respeito a "reduzir movimento", retrato e paisagem.

## Armazenamento, backup e sincronização

- Dados estruturados em **IndexedDB**; preferências simples de interface em `localStorage`.
- **Exportar:** Configurações → *Exportar (JSON)*. **Importar:** Configurações → *Importar*. O arquivo é validado antes de qualquer alteração; arquivos inválidos são recusados sem mexer nos dados.
- Sem configurar nada, os dados ficam só no aparelho. A sincronização entre aparelhos é opcional (abaixo).

## Sincronização na nuvem (opcional)

O site continua hospedado no GitHub Pages; os dados passam a ter uma cópia em um banco na nuvem (Supabase, plano gratuito). Cada aparelho continua funcionando offline com o seu banco local e troca apenas as alterações.

**Configurar uma vez**

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No projeto, abra **SQL Editor**, cole o conteúdo de [`supabase/panelai.sql`](supabase/panelai.sql) e execute.
3. Em **Project Settings → API**, copie o endereço do projeto (`https://….supabase.co`) e a chave **pública** (publishable / anon). Nunca use a chave secreta (secret / service_role) no site.
4. No PanelAI do aparelho que tem os dados: **Configurações → Sincronização na nuvem → Primeiro aparelho: criar a casa**, cole endereço e chave e confirme. Os dados desse aparelho viram os dados da casa.
5. Toque em **Copiar link de convite** e abra o link nos outros aparelhos. Cada um substitui os dados locais pelos da casa e passa a sincronizar.

Opcional: para o site publicado já vir com endereço e chave preenchidos, crie as variáveis `PANELAI_SYNC_URL` e `PANELAI_SYNC_KEY` em **Settings → Secrets and variables → Actions → Variables** do repositório.

**Como funciona**

- Cada alteração local também entra em uma fila de envio (`outbox`, no IndexedDB). O envio acontece logo após a alteração, ao abrir o app, ao voltar para ele, quando a internet retorna e a cada minuto com o app visível. Sem internet, a fila espera.
- A sincronização é por registro (uma receita, uma semana, um recado, um item do estoque…). Se dois aparelhos alteram o **mesmo** registro, vence a alteração mais recente; registros diferentes nunca se sobrescrevem. Exclusões também são propagadas.
- O que sincroniza: ingredientes, receitas (com foto), estoque, semanas (cardápio e lista), marmitas, movimentações, compras, recados e configurações da casa. Rascunho de contagem, sessão do mercado do mês e preferências de tela ficam em cada aparelho.
- "Importar", "Restaurar demonstração" e "Começar do zero" em um aparelho conectado valem para a casa inteira (o app avisa antes).

**Segurança**

- A "casa" é identificada por um código secreto longo, gerado no aparelho. Quem tem o código (ou o link de convite, que o contém) lê e altera os dados: compartilhe só com quem mora com você.
- O site nunca acessa a tabela diretamente (RLS ligado, sem políticas); ele só chama duas funções do banco, `panelai_pull` e `panelai_push`, que exigem o código. O servidor guarda apenas o hash do código.
- Não há login nem recuperação: se todos os aparelhos forem desconectados e o link se perder, os dados da nuvem ficam inacessíveis (os dados locais e o backup em JSON continuam valendo).

## Instalar como aplicativo

- **Android / Chrome / Edge:** menu do navegador → *Instalar app* (ou botão em Configurações).
- **iPhone / iPad:** Safari → Compartilhar → *Adicionar à Tela de Início*.

## Desenvolvimento

Requisitos: Node.js 20+.

```bash
npm install
npm run dev        # servidor local em http://localhost:5173/PanelAI/
npm test           # testes das regras de negócio (Vitest)
npm run build      # gera dist/
npm run preview    # serve o build em http://localhost:4173/PanelAI/
```

Testes de ponta a ponta e responsividade (Playwright com Chromium instalado no ambiente):

```bash
npm run build && npm run test:e2e
```

Cobrem os fluxos em desktop (1440 px) e celular (Pixel 7): recados, sincronização entre dois aparelhos (com um servidor de teste em memória que imita as funções do Supabase), criar receita, selecionar refeição, alterar porções, navegar entre semanas, gerar lista, rastrear ingrediente, marcar comprados, registrar compra, atualizar estoque, contagem, compra mensal, exportar, importar, persistência após recarregar, barra inferior sem sobrepor conteúdo, modal com teclado virtual, orientação paisagem, gesto de deslizar, atalhos e foco; ausência de rolagem horizontal em 360, 390, 430, 768, 1024 e 1440 px; e funcionamento offline. Capturas ficam em `tests/e2e/output/`.

Ícones PNG são gerados a partir dos SVGs com `npm run icons`.

## Publicação (GitHub Pages)

O workflow `.github/workflows/deploy.yml` roda em todo push: instala, testa e gera o build. Em pushes na branch `main` ele publica no GitHub Pages.

Configuração única no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

O caminho-base `/PanelAI/` está em `vite.config.js` (pode ser trocado pela variável `PANELAI_BASE`). As rotas usam `#/`, compatíveis com hospedagem estática.

## Estrutura

```text
PanelAI/
├── index.html
├── vite.config.js            # base /PanelAI/, PWA (service worker)
├── public/                   # logo.svg, logo-horizontal.svg, favicon.svg, ícones, manifest
├── src/
│   ├── main.jsx, App.jsx     # entrada, cabeçalho, navegação, atalhos
│   ├── components/           # modal/bottom sheet, toasts, confirmação, stepper, seletor de semana
│   ├── pages/                # Cardápio, Lista, Mercado do mês, Receitas, Configurações, Histórico
│   ├── services/             # regras: demanda, lista, estoque, indicadores, sugestões, backup
│   ├── models/               # constantes, unidades e conversões, validação de receitas
│   ├── storage/              # IndexedDB, estado global, ações
│   ├── data/                 # catálogo de ingredientes, receitas e dados de demonstração
│   ├── utils/                # datas, roteador, hooks
│   └── styles/               # tokens, componentes, layout e telas
├── tests/unit/               # Vitest
├── tests/e2e/                # Playwright
├── scripts/generate-icons.mjs
└── docs/referencias-visuais/ # capturas usadas como referência (não publicadas)
```

## Identidade visual

Panela minimalista verde-sálvia (`#789582`) sobre fundo verde muito claro (`#E7EFE8`), cantos arredondados. Paleta: fundo `#FAF9F6`, cartões `#FFFFFF`, verde escuro `#52765D`, coral `#DCA49B`, texto `#30332F` / `#747874`, bordas `#E8E7E2`. Tipografia Inter (incluída no build, funciona offline) e ícones Lucide.

## Limitações conhecidas

- Sem sincronização automática entre aparelhos (use exportar/importar).
- Os dados ficam no navegador: limpar os dados do site apaga o PanelAI. Faça backups.
- Sugestões usam regras locais (sem IA externa).
- Conversões entre massa, volume e unidades dependem dos dados do ingrediente; sem eles, as quantidades aparecem separadas na lista.
- Imagens de receitas são reduzidas e guardadas localmente; muitas imagens aumentam o tamanho do backup.
