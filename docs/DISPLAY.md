# Tela e-ink pela internet (kit TRMNL 7,5" DIY)

A tela e-ink da casa é o **kit TRMNL 7,5" (OG) DIY da Seeed**: placa XIAO ESP32-S3 Plus, placa
"XIAO ePaper Display Board", tela de 7,5" (800 × 480, preto e branco) e bateria de 2000 mAh.
O kit vem com o programa do TRMNL, que depende do serviço pago deles; o PanelAI **troca esse
programa pelo seu próprio** (feito com o [ESPHome](https://esphome.io), firmware aberto com suporte
oficial da Seeed para este kit). Não é preciso conta nem licença do TRMNL.

A tela mostra o layout montado na aba **Display** e se atualiza sozinha, **nos horários escolhidos em
Configurações → Tela e-ink**, buscando a imagem pela internet. Fora dos horários, o botão **Atualizar a
tela agora** do site (ou o botão do aparelho) atualiza na hora. Nenhum computador da casa precisa
ficar ligado.

## Como funciona

```
 PanelAI (GitHub Pages + Firebase)
        │  o site pede (botão "Atualizar a tela agora" e logo depois de mudanças),
        │  e a cada 30 min como reserva: o GitHub entra no site com a CONTA DE TELA (só leitura)
        ▼
 GitHub Actions ── tira a foto de #/display/tela ──► publica junto com o site, num endereço secreto:
                                                     <site>/tela/<código>/tela.png            (1 bit, 800 × 480)
                                                     <site>/tela/<código>/tela-<horário>.png  (uma por horário)
                                                     <site>/tela/<código>/config.json         (horários e pedido)
        ▲
        │  nos horários escolhidos, quando há pedido novo e quando alguém aperta o botão
 Tela e-ink (programa do PanelAI) ── baixa a imagem, mostra e volta a dormir
```

- **Por que o GitHub tira a foto?** A placa da tela é um microcontrolador: não roda navegador nem o
  PanelAI. Ela só desenha uma imagem pronta. O próprio GitHub, que já publica o site, abre a tela
  pronta num navegador sem janela e gera a imagem (`scripts/display-png.mjs --publicar`, no
  workflow `.github/workflows/display.yml`).
- **Por que uma conta de tela?** Para entrar no site, o GitHub precisa de uma conta da casa. A conta
  de tela é **só leitura**: as regras do Firestore não deixam ela alterar nem apagar nada. Se a senha
  dela vazar, os dados da casa continuam protegidos.
- **Por que um endereço secreto?** O GitHub Pages não tem senha por arquivo. A imagem fica num
  endereço com um código aleatório de 32 letras e números, impossível de adivinhar. Quem tiver o
  endereço vê **só a imagem da tela**: não entra no sistema nem altera nada.
- **Quando a imagem é refeita?** Quando o site pede ao GitHub, com a **chave do GitHub** da casa
  (passo 6): no botão **Atualizar a tela agora** e, sozinho, cerca de 1 minuto depois de alguém mudar
  algo no PanelAI (no máximo uma vez a cada 10 minutos por aparelho). Também a cada 30 minutos pelo
  agendamento do GitHub, mas só como reserva: quando o GitHub está cheio, ele atrasa horas ou pula
  esse agendamento.
- **Uma imagem para cada horário.** Cada geração já deixa prontas as imagens dos próximos horários
  (`tela-<horário>.png`), cada uma com os dados do seu dia. Se a última geração foi ontem à noite, a
  tela das 6h mostra mesmo assim o cardápio de hoje. Perto de um horário, a imagem principal também já
  sai "para" ele: uma tela que atualiza à meia-noite mostra o dia novo.
- **Como a tela fica sabendo do "Atualizar a tela agora"?** Ela não fica ligada esperando (gastaria a
  bateria em horas). Das 6h às 23h ela acorda a cada poucos minutos (10, por padrão), lê só o
  `config.json` e, se houver pedido novo, baixa a imagem e redesenha. Senão, volta a dormir sem piscar.

## Configuração (uma vez só)

### 1. Publicar as regras novas do Firestore

As contas de tela precisam das regras desta versão: **Firebase → Firestore Database → Regras**, cole o
arquivo [`firestore.rules`](../firestore.rules) inteiro e clique em **Publicar**.

### 2. Criar a conta de tela

Use **um e-mail só para a tela** (por exemplo, um apelido do seu e-mail, como `seunome+tela@…`, se o
seu provedor aceitar, ou um e-mail novo).

1. Abra o PanelAI numa **janela anônima** (para não sair da sua conta).
2. **Entrar com e-mail e senha** → digite o e-mail da tela e uma senha forte → **Criar conta**.
3. Abra o link de confirmação que chega nesse e-mail. Feche a janela anônima.

### 3. Cadastrar a conta de tela na casa (responsável)

PanelAI → **Configurações → Sincronização na nuvem → Contas de tela (só leitura)** → digite o e-mail da
tela → **Adicionar tela**.

### 4. Guardar a conta de tela no GitHub

No repositório: **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Valor |
|---|---|
| `PANELAI_TELA_EMAIL` | o e-mail da conta de tela |
| `PANELAI_TELA_SENHA` | a senha da conta de tela |

Sem esses dois segredos, o workflow "Imagem do display" não faz nada (e não falha).

### 5. Escolher os horários e ativar o endereço

PanelAI → **Configurações → Tela e-ink**:

1. **Horários de atualização**: adicione um ou mais (ex.: 06:00 e 18:00).
2. **Ativar endereço da imagem**.
3. Confira na aba **Display** se o layout escolhido para o display está no modelo **7,5" — 800 × 480**
   e com as cores **Preto e branco** (a seção Tela e-ink avisa se não estiver).

### 6. Guardar a chave do GitHub (para "Atualizar a tela agora")

A chave deixa o site pedir a imagem nova ao GitHub na hora. Ela só consegue rodar o GitHub Actions do
PanelAI: não mexe no código, nos segredos nem nos dados da casa.

1. PanelAI → Configurações → Tela e-ink → **Atualizar sem esperar o horário** → **Como criar a chave**
   → **a página do GitHub que cria a chave**. Ela já abre preenchida: nome "PanelAI tela", sem data para
   vencer e com a permissão **Actions: Read and write**.
2. Em **Repository access**, escolha **Only select repositories** e selecione **PanelAI**.
3. Confira em **Permissions**: **Actions** com **Read and write** (o **Metadata** vem junto, só
   leitura). Não precisa de mais nada.
4. **Generate token** → copie a chave (começa com `github_pat_`) → cole no campo **Chave do GitHub** do
   PanelAI → **Salvar chave**.

A chave fica nos dados da casa (as pessoas da casa e a conta de tela leem) e vale para todos os
aparelhos da casa. Ela não vai para os backups (importar um backup ou restaurar a demonstração
mantém a chave que já estava).

### 7. Gerar a primeira imagem

Configurações → Tela e-ink → **Atualizar a tela agora** (ou GitHub → **Actions → Imagem do display →
Run workflow**). Em uns 3 minutos aparece **"Imagem nova publicada às …"** e o botão **Ver imagem
publicada** mostra a imagem.

> O instalador do aparelho e o agendamento de reserva só funcionam depois que esta versão estiver na
> branch `main` (o GitHub só agenda workflows da branch principal, os pedidos do site rodam a versão
> da `main` e o firmware do instalador é publicado a partir dela).

### 8. Instalar o programa do PanelAI na tela (uma vez, pelo cabo USB)

Sem instalar nada no computador: só o **Chrome** ou o **Edge** e um cabo USB-C **de dados**.

1. PanelAI → Configurações → Tela e-ink → **Instalar o programa na tela** (abre
   `<site>/instalar-tela.html`).
2. Ligue a placa da tela no computador pelo cabo (chave em ON) e clique em **Instalar o PanelAI na
   tela** → escolha o aparelho na lista → marque **Apagar o aparelho** (remove o programa do TRMNL)
   → confirme. Leva 1 a 2 minutos.
   - Deu "Failed to initialize" ou não aparece na lista? Modo de gravação: segure o botão minúsculo
     **B** (BOOT) da plaquinha XIAO, bem ao lado da entrada do cabo USB-C; sem soltar, aperte e solte o
     **RESET** da lateral da placa; solte o B e clique em Instalar de novo (a porta pode mudar de
     nome). No fim da instalação, aperte RESET uma vez se a tela não mudar.
3. **Wi-Fi**: na mesma janela, escolha a rede da casa (2,4 GHz) e a senha.
4. **Visitar o aparelho** (ou abra o `http://…` que aparece na tela) → no campo **Endereço da
   imagem**, cole o endereço de Configurações → Tela e-ink → **Copiar endereço**.
5. Em poucos segundos a tela mostra o PanelAI. Pode tirar o cabo.

Se a janela fechar antes do Wi-Fi, a própria tela mostra o caminho: no celular, conecte-se à rede
**PanelAI-Tela** (senha `panelai123`), escolha a rede da casa e depois abra o endereço `http://…`
que aparece na tela para colar o endereço da imagem.

**Voltar ao programa do TRMNL** (se um dia quiser): [trmnl.com/flash](https://trmnl.com/flash).

### Atualizar o programa da tela (quando sair uma versão nova)

Mesmo caminho do passo 8: **Instalar o programa na tela**, com o cabo USB. **Não precisa** marcar
**Apagar o aparelho**. Ao reinstalar, o aparelho normalmente esquece o Wi-Fi e o endereço da imagem: o
instalador pede o Wi-Fi de novo e depois é só colar o endereço (Configurações → Tela e-ink → **Copiar
endereço**) na página do aparelho. A versão 1.7 do programa (a que confere os pedidos do botão
**Atualizar a tela agora**) precisa dessa reinstalação; a versão 1.4 continua funcionando, mas só
atualiza nos horários e no botão do aparelho.

## Dia a dia

- **Atualizar agora**: Configurações → Tela e-ink → **Atualizar a tela agora** (precisa da chave do
  passo 6). A imagem nova fica pronta em uns 3 minutos e a tela mostra na próxima conferência (até 10
  minutos depois, das 6h às 23h; fora desse horário, na primeira conferência a partir das 6h). Na
  hora mesmo: aperte o botão **KEY3** da lateral da placa (o mesmo que acordava o TRMNL; KEY1 e KEY2
  não fazem nada); ele baixa a imagem publicada mais recente.
- **Mudar os horários**: Configurações → Tela e-ink. Com a chave salva, o `config.json` novo sai em
  poucos minutos e o aparelho passa a seguir os horários novos na próxima vez que acordar (na próxima
  conferência ou, com a conferência desligada, em até 6 horas). Para valer na hora, aperte o **botão**
  do aparelho.
- **Mudar o que aparece**: aba **Display**. O layout marcado "no display" é o que vai para a tela. Com
  a geração automática ligada (padrão), as imagens de cada horário são refeitas logo depois; a tela
  muda no próximo horário.
- **Clima na tela**: aba **Display** → **Adicionar card** → **Clima** (ou o layout sugerido "Cozinha
  com clima"). Nas opções do card, busque a cidade e escolha quantas horas de chance de chuva (de 1 em 1,
  2 em 2 ou 3 em 3 horas) e quantos dias de previsão mostrar. A previsão vem do **Open-Meteo** (grátis,
  sem cadastro) no momento em que a imagem é gerada; se o serviço falhar, a tela mostra a última
  previsão guardada (com o horário dela) ou "Previsão indisponível agora".
- **Compras do dia na tela**: no card **Lista de compras**, opção **Mostrar → Só hoje** (ou só amanhã).
  Com a lista manual (Lista da semana → desligar "Puxar ingredientes do cardápio"), aparece exatamente
  o que você escreveu para aquele dia.
- **Atividades Montessori do dia**: na aba Display, **Adicionar card → Montessori de hoje** (ou o layout
  sugerido **Família**). Mostra o nome e a idade da criança e as atividades do dia, com as já
  registradas marcadas. A lista é a mesma da aba Montessori: muda quando alguém toca em
  "Novas sugestões", "Trocar" ou "Incluir", e as marcações aparecem na próxima atualização da tela.
- **Conferência de pedidos e bateria**: Configurações → Tela e-ink → **A tela confere se houve
  pedido** (a cada 5, 10, 15 ou 30 minutos, ou não confere). Cada conferência deixa a tela acordada por
  alguns segundos. Estimativas com a bateria de 2000 mAh: a cada 10 minutos, 1 a 2 meses; a cada 30,
  bem mais; sem conferir, vários meses. Ligada no cabo USB, tanto faz.
- **Modo de configuração** (trocar o endereço ou o Wi-Fi): **segure o KEY3 por 5 segundos**. A tela
  mostra as instruções e o aparelho fica acordado por até 15 minutos.
- **Bateria**: o canto de baixo, à direita, mostra um ícone pequeno e o percentual (ex.: 87%),
  medido na hora em que a tela atualizou. É uma estimativa pela tensão da bateria; ligada no USB, marca
  100%. Carregue pelo USB-C quando estiver baixa. (A partir do programa 1.7.1.)
- **Trocar o endereço** (se vazou): Configurações → Tela e-ink → **Trocar endereço**. O endereço antigo
  para de funcionar na próxima publicação. Depois, segure o KEY3 por 5 segundos e cole o
  novo endereço na página dele.
- **Desligar a publicação**: Configurações → Tela e-ink → **Desligar**. A tela continua mostrando a
  última imagem.

## Como o aparelho decide quando acordar

O relógio interno do ESP32 atrasa ou adianta um pouco durante o sono, então o aparelho não dorme 24
horas de uma vez (regras em `esphome/panelai_tela.h`, testadas no CI):

- dorme no máximo **6 horas** seguidas; ao acordar no meio do caminho, conecta no Wi-Fi, acerta o
  relógio pela internet e relê o `config.json` (a tela não pisca);
- das 6h às 23h (no fuso da casa) acorda também a cada **N minutos** (escolhido no site) para conferir
  pedidos: se o `pedido` do `config.json` mudou desde a última imagem, baixa e redesenha;
- a **última soneca** antes de um horário dura no máximo 1 hora, para acordar na hora certa;
- no horário (ou quando o botão é apertado, quando é ligado ou quando há pedido): baixa a imagem,
  redesenha e dorme de novo. Escolhe a imagem do horário mais recente que já chegou
  (`tela-<horário>.png`) se ela for mais nova que a principal (`tela.png`); se faltar, usa a principal;
- **sem Wi-Fi ou sem imagem**: tenta de novo em 5, 10, 20 e depois a cada 30 minutos. A tela continua
  mostrando a última imagem (e-ink não precisa de energia para manter a imagem);
- a agenda fica guardada na memória do aparelho: se a internet cair, ele segue os próximos horários
  que já conhecia;
- se algo travar, ele volta a dormir sozinho depois de 2 minutos e meio acordado.

## Segurança e privacidade

| O quê | Como fica protegido |
|---|---|
| Dados da casa | Login e regras do Firestore. A conta de tela só lê: não grava, não apaga e não mexe na casa (testado em `npm run test:cloud`). |
| Senha da conta de tela | Só nos segredos do GitHub (cifrados; o GitHub esconde o valor nos logs). Não vai para o código nem para o aparelho. |
| Endereço da imagem | Código aleatório de ~190 bits, guardado nas configurações da casa e na memória do aparelho. O script esconde o código dos logs do GitHub e o artefato com a imagem é apagado logo depois da publicação. |
| Chave do GitHub | Só a permissão "Actions: Read and write", só no repositório PanelAI: roda e vê as execuções do GitHub Actions, sem acesso ao código, aos segredos nem aos dados da casa. Fica nos dados da casa (pessoas da casa e conta de tela leem), aparece só mascarada (`github_pat_…abcd`) e não vai para os backups. Vazou? Apague em GitHub → Settings → Developer settings → Personal access tokens e crie outra. |
| Clima | O navegador que gera a imagem pede a previsão ao Open-Meteo só com a latitude/longitude da cidade escolhida (sem nome, e-mail ou dados da casa). |
| Programa do aparelho | Público e sem segredos (Wi-Fi e endereço ficam só na memória do aparelho). Publicado pelo CI no branch `firmware`. |

Riscos que continuam existindo, e o que fazer:

- **Quem tiver o endereço vê a imagem da tela.** Coloque no display só o que pode aparecer na
  cozinha. Se o endereço vazar, use **Trocar endereço**.
- A página do aparelho (`http://<ip>`) não tem senha. Ela só existe enquanto o aparelho está
  acordado (segundos, ou o modo de configuração) e só na rede da casa.
- O repositório é público: durante cerca de um minuto a cada publicação, o artefato da execução existe
  antes de ser apagado. Para fechar também essa janela, o repositório pode ficar privado (o GitHub
  Pages em repositório privado exige um plano pago do GitHub).
- **App Check** (opcional, docs/FIREBASE.md passo 7.3): se for ativado com "Aplicar", o navegador do
  GitHub precisa de um token de depuração. Crie em **App Check → Apps → ⋮ → Gerenciar tokens de
  depuração** e guarde como segredo `PANELAI_APPCHECK_DEBUG_TOKEN`.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| A tela mostra "MAC … not registered – visit trmnl.com/go/byod" | É o programa do TRMNL. Instale o do PanelAI (passo 8); não precisa da licença do TRMNL. |
| "Ainda não há imagem neste endereço" | Confira os segredos do passo 4 e rode **Actions → Imagem do display → Run workflow**. Veja o log da execução. |
| Execução falha com "login recusado" | E-mail ou senha errados nos segredos do GitHub. |
| "a conta de tela ainda não confirmou o e-mail" | Abra o link de confirmação que chegou no e-mail da tela. |
| "a conta de tela não está cadastrada na casa" | Passo 3 (Contas de tela) e passo 1 (regras publicadas). |
| O instalador não encontra o aparelho | Cabo de dados (não só de carga), Chrome/Edge no computador, e o truque BOOT + RESET do passo 8. |
| "A chave do GitHub é inválida ou venceu" | Crie outra chave (passo 6) e salve em Configurações → Tela e-ink → Trocar. |
| "…não tem permissão para rodar o workflow" ou "…não tem acesso ao repositório" | Ao criar a chave, escolha o repositório PanelAI (Only select repositories) e Actions: Read and write. |
| "A imagem pedida ainda não saiu" | O GitHub está lento ou com problemas. Veja a aba **Actions** do repositório (execução "Imagem do display") e tente de novo. |
| A imagem saiu, mas a tela não mudou | A tela confere pedidos das 6h às 23h, a cada N minutos (Configurações → Tela e-ink). Com a versão 1.4 do programa, ela não confere: reinstale (seção "Atualizar o programa da tela"). Na hora: aperte o botão KEY3. |
| Imagem cortada ou com sobra | O layout não está em 7,5" — 800 × 480. Ajuste na aba Display. |
| Partes somem ou viram borrões pretos | Use as cores "Preto e branco" no layout. |
| A página do aparelho mostra "Não foi possível baixar a imagem" | Endereço colado errado: segure o botão 5 s e cole de novo (Configurações → Tela e-ink → Copiar endereço). |
| A tela não atualiza | Aperte o botão. Se não mudar, segure 5 s para ver as instruções e a situação (Wi-Fi, endereço). |
| O GitHub parou de gerar a imagem depois de meses | O GitHub desativa agendamentos de repositórios parados há 60 dias. O workflow tenta se manter ativo; se mesmo assim parar, reative em **Actions → Imagem do display → Enable workflow**. |

## Para desenvolvedores

| Peça | Arquivo |
|---|---|
| Agenda (horários, fuso, próximas atualizações, `config.json`) | `src/display/schedule.js` (testes: `tests/unit/schedule.test.js`) |
| Seção Configurações → Tela e-ink (botão "Atualizar a tela agora", chave do GitHub) | `src/pages/settings/DisplayDeviceSection.jsx` |
| Pedido ao GitHub, geração automática (regras puras) | `src/display/github.js` (testes: `tests/unit/github.test.js`) |
| Ações (salvar a chave em `meta/github`, pedir a imagem) | `src/storage/displayActions.js` |
| Geração automática depois de mudanças | `src/components/ScreenAutoUpdate.jsx` (ouve `onPersist` do `src/storage/store.js`) |
| Tela pronta (`#/display/tela?exato=1&publicar=1&momento=<epoch>`) | `src/pages/DisplayPage.jsx` (`DisplayScreen`) |
| Tarefas fixas aparecem no display sem gravar nada | `src/display/data.js` |
| Conta de tela (só leitura) | `firestore.rules`, `src/cloud/cloud.js`, `src/cloud/session.js`, `src/pages/ViewerNotice.jsx` |
| Gerador da imagem (PNG 1 bit sem dependências) | `scripts/display-png.mjs`, `scripts/lib/png.mjs` |
| Publicação (pedidos do site e reserva a cada 30 min) | `.github/workflows/display.yml` |
| Programa do aparelho (ESPHome) | `esphome/panelai-tela.yaml` + regras em `esphome/panelai_tela.h` (testes: `esphome/testes/`) |
| Compilação e publicação do firmware | `.github/workflows/esphome.yml` (branch `firmware`: `manifest.json` + `panelai-tela.factory.bin`) |
| Instalador pelo navegador (ESP Web Tools) | `public/instalar-tela.html` |
| Teste de ponta a ponta da publicação | `tests/cloud/run-display.mjs` (em `npm run test:cloud`) |

Pinos da placa (kit TRMNL 7,5" DIY: XIAO ESP32-S3 Plus + XIAO ePaper Display Board), conferidos na
documentação da Seeed e no firmware do TRMNL: SPI CLK GPIO7 / MOSI GPIO9; tela CS GPIO44, DC GPIO10,
RESET GPIO38, BUSY GPIO4 (invertido); botões KEY1 = D1 GPIO2, KEY2 = D2 GPIO3, KEY3 = D4 GPIO5 (o que acorda); bateria
GPIO1 com o circuito ligado pelo GPIO6.

Contrato do `config.json` (versão 2), lido pelo aparelho — mudar um campo exige mudar o firmware também
(e subir `DEVICE_CONFIG_VERSION`):

```json
{
  "versao": 2,
  "gerado": 1764136020,
  "referencia": 1764136800,
  "horarios": ["06:00", "18:00"],
  "fuso": "America/Sao_Paulo",
  "proximas": [1764136800, 1764180000],
  "pedido": 1764135900,
  "conferir_cada": 600,
  "conferir": [1764136800, 1764198000, 1764223200, 1764284400],
  "largura": 800,
  "altura": 480
}
```

`gerado`: quando a imagem foi feita; `referencia`: o instante que a `tela.png` representa;
`proximas`: próximas atualizações em segundos UTC (até 24), já convertidas do fuso da casa, cada uma
com a sua imagem `tela-<horário>.png`; `pedido`: último "Atualizar a tela agora" (0 = nunca; a tela
redesenha quando muda); `conferir_cada`: de quanto em quanto tempo conferir pedidos, em segundos
(0 = não confere); `conferir`: janelas `[início, fim, …]` das 6h às 23h dos próximos 8 dias. A versão 1
não tinha `pedido`, `conferir_cada` nem `conferir`; a versão 1.4 do programa ignora esses campos.

Compilar e gravar o firmware sem o instalador (com o ESPHome no computador):

```bash
pip install esphome==2026.11.0
esphome run esphome/panelai-tela.yaml      # com a placa no USB
g++ -std=c++17 -I esphome esphome/testes/panelai_tela_teste.cpp -o /tmp/t && /tmp/t   # regras do aparelho
```

Rodar o gerador da imagem contra o site publicado, no seu computador (precisa da conta de tela):

```bash
PANELAI_TELA_EMAIL=… PANELAI_TELA_SENHA=… node scripts/display-png.mjs --publicar /tmp/saida
```
