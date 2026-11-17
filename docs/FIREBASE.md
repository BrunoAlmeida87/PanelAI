# Sincronização na nuvem com Firebase

Com o Firebase configurado, o PanelAI guarda os dados numa **casa** compartilhada na nuvem.
Cada pessoa entra com o próprio e-mail (Google ou e-mail e senha) e todos veem o mesmo cardápio,
lista de compras e despensa, **atualizados na hora**. Sem internet, o app continua funcionando
e envia as alterações quando a conexão volta.

Com o Firebase configurado, **o PanelAI só abre depois do login** com um e-mail cadastrado na casa.
Quem tiver só o link vê a tela de entrar e não consegue ver nem alterar nada. Cada alteração fica
registrada com o e-mail de quem a fez.

Na tela de entrar, **"Experimentar sem conta"** abre o **modo de teste**, para quem quer conhecer o app:
ele usa os dados de exemplo e salva só naquele navegador. O Firebase nem é carregado e nada vai para a
nuvem; os dados de teste também nunca são enviados ao criar uma casa.

Sem a configuração (campo `apiKey` vazio), nada disso existe: o PanelAI salva só no aparelho, sem login.

---

## Passo a passo (uma vez só, ~15 minutos)

### 1. Criar o projeto

1. Acesse <https://console.firebase.google.com> e entre com sua conta Google.
2. **Criar um projeto** → nome: `panelai` (ou outro) → pode **desativar o Google Analytics** → **Criar projeto**.
3. O plano gratuito (**Spark**) é suficiente para uma casa. Não é preciso cadastrar cartão.

### 2. Registrar o app da Web

1. Na página inicial do projeto, clique no ícone **`</>`** (Web).
2. Apelido: `PanelAI`. **Não** marque "Firebase Hosting". Clique em **Registrar app**.
3. Aparece um trecho de código com `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., ... }`.
   **Copie esse objeto** — ele vai no passo 6. (Também fica em ⚙️ Configurações do projeto → Seus apps.)

### 3. Ativar o login

1. Abra **Authentication** e clique em **Vamos começar**. O menu da esquerda muda conforme a versão do console:
   fica em **Segurança** (versões novas) ou **Criação / Build** (versões antigas), às vezes dentro de **Todos os produtos**.
   Também dá para digitar *Authentication* na busca do topo do console.
2. Aba **Método de login**:
   - **Google** → Ativar → escolha o e-mail de suporte → Salvar.
   - **E-mail/senha** → Ativar (só a primeira opção) → Salvar.
     Útil no iPhone com o app instalado na tela inicial, onde a janela do Google às vezes não abre.
3. Aba **Configurações → Domínios autorizados → Adicionar domínio**:
   `brunoalmeida87.github.io`
   (`localhost` já vem na lista, para testes no computador.)

### 4. Criar o banco de dados (Firestore)

1. Abra **Firestore Database** (menu **Bancos de dados e armazenamento**, ou **Criação / Build** em versões antigas; ou pela busca do topo) → **Criar banco de dados**.
2. Edição **Standard**. Local: `southamerica-east1 (São Paulo)`. *O local não pode ser trocado depois.*
3. Escolha **Iniciar no modo de produção** → Criar.

### 5. Publicar as regras de segurança

1. Em **Firestore Database → Regras**, apague o conteúdo.
2. Cole o arquivo [`firestore.rules`](../firestore.rules) inteiro (está na raiz do projeto).
3. **Publicar**.

As regras garantem que só os e-mails cadastrados na casa (e confirmados) leem ou alteram os dados,
que só o responsável pela casa adiciona ou remove pessoas (os demais podem sair por conta própria)
e que ninguém cria casas novas.

**Criação de casas:** as regras vêm com a criação de casas **bloqueada** (`allow create: if false;`),
para ninguém de fora criar nada no banco. Na primeira configuração de um projeto novo, troque essa linha
por `allow create: if canCreateHousehold(casa);`, publique, crie a casa no app (tela de entrar →
"Primeira configuração: criar uma casa nova") e depois volte para `if false` e publique de novo.

> **Ao atualizar o PanelAI:** se uma versão nova pedir, publique de novo o `firestore.rules`
> (mesmo caminho: Firestore Database → Regras → colar → Publicar). A partir da versão 1.2,
> as regras aceitam coleções novas automaticamente, então isso deve ser raro.
>
> **Versão 1.3:** publique as regras de novo para bloquear a criação de casas novas e ativar
> "Sair da casa". Sem isso tudo continua funcionando; só o botão "Sair da casa" mostra
> "Sem permissão no Firestore" e a criação de casas continua liberada.

### 6. Colocar a configuração no PanelAI

Edite [`src/cloud/firebase-config.js`](../src/cloud/firebase-config.js) e preencha os campos com os valores do passo 2:

```js
const FIREBASE_CONFIG = {
  apiKey: 'AIza...',
  authDomain: 'panelai-xxxx.firebaseapp.com',
  projectId: 'panelai-xxxx',
  storageBucket: 'panelai-xxxx.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

Esses valores **não são senhas**: só identificam o projeto, e podem ficar no GitHub.
A proteção vem das regras e do login. Pelo GitHub dá para editar direto no navegador (ícone de lápis)
e fazer o commit na branch `main`; a publicação no GitHub Pages acontece sozinha em 1–2 minutos.

### 7. Proteger o projeto (recomendado, ~10 minutos)

A configuração do passo 6 é pública (fica no site). O login e as regras já impedem que alguém de fora
veja, altere ou crie dados, mas a chave ainda poderia ser usada de outros sites (por exemplo, para
criar contas no login do projeto). Três ajustes fecham essa porta:

1. **Restringir a chave da API ao site.** No [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (mesmo projeto) → **Credenciais** → abra a chave chamada *Browser key (auto created by Firebase)* →
   **Restrições de aplicativo: Referenciadores HTTP** → adicione
   `https://brunoalmeida87.github.io/*` e `http://localhost:5173/*` (para testes) → **Salvar**.
2. **Domínios autorizados** (Authentication → Configurações): deixe só `localhost`,
   `brunoalmeida87.github.io` e o domínio `*.firebaseapp.com` do projeto. Apague os que não usa.
3. **App Check** (opcional, a proteção mais forte):
   1. Em <https://www.google.com/recaptcha/admin> crie uma chave **reCAPTCHA v3** para o domínio `brunoalmeida87.github.io`.
   2. No Firebase: **App Check → Apps → PanelAI (Web) → reCAPTCHA v3** → cole a **chave secreta** → Salvar.
   3. No PanelAI, preencha a **chave do site** em `src/cloud/firebase-config.js`
      (`appCheckSiteKey`) ou na variável `VITE_APPCHECK_SITE_KEY`, publique e use o app por um ou dois dias.
   4. Em **App Check → APIs**, confira que as solicitações aparecem como verificadas e clique em
      **Aplicar** no Cloud Firestore e no Authentication.

---

## Usando no dia a dia

**Quem começa (só na primeira configuração de um projeto novo):**

1. Libere a criação de casas nas regras (passo 5).
2. Abra o PanelAI → tela de entrar → **Entrar com Google** (ou e-mail e senha).
3. Abra **Primeira configuração: criar uma casa nova** → **Criar casa**. Vão para a nuvem os dados que
   este navegador já tinha guardado (de versões sem login) ou, se não houver, as receitas de exemplo.
4. Bloqueie de novo a criação de casas nas regras.
5. Em ⚙️ **Configurações → Convidar pessoa**, digite o e-mail da outra pessoa → **Adicionar**.

**Quem foi convidado(a):**

1. Abra o PanelAI no celular → tela de entrar → **Entrar com Google** (ou e-mail e senha) usando **o mesmo e-mail convidado**.
   - Com e-mail e senha: toque em **Criar conta**, abra o link de confirmação que chega por e-mail e toque em **Já confirmei**.
2. Aparece "Você faz parte da casa…" → **Entrar na casa**.

O login fica guardado em cada aparelho: depois da primeira vez, o PanelAI abre direto na casa.

Pronto: o que um altera aparece no aparelho do outro em segundos. O topo da tela mostra
**Sincronizado**, **Sincronizando…** ou **Salvo no aparelho** (sem internet; envia depois).

### Bom saber

- **Sair da conta** em um aparelho apaga a cópia da nuvem nele e volta para a tela de entrar. Os dados da casa continuam na nuvem.
- **Sair da casa** (para quem não é o responsável) tira o seu e-mail da casa.
- **Importar, Restaurar demonstração e Começar do zero** afetam os dados **de todos** e só aparecem para o responsável pela casa. Exporte um backup antes.
- **Duas pessoas marcando a lista ao mesmo tempo** (ou a contagem da despensa, o mercado do mês e as tarefas de preparo): as marcações se somam, item a item. Para o mesmo item, vale a última alteração.
- Se duas pessoas alterarem **o cardápio da mesma semana** exatamente ao mesmo tempo, vale a última gravação. Na prática, com o app aberto, cada um já vê a mudança do outro antes de editar.
- **Primeira abertura num aparelho novo sem internet:** o PanelAI espera os dados da casa chegarem em vez de abrir vazio.
- Um mesmo e-mail participa de uma casa. Até 10 pessoas por casa.

### Quanto da cota gratuita a casa usa

O plano gratuito permite 50 mil leituras e 20 mil gravações por dia. Cada vez que o app abre depois de
mais de 30 minutos sem conexão, o Firestore cobra a leitura dos documentos da casa. Para isso não
crescer com o tempo, o PanelAI agrupa automaticamente os registros antigos em **pacotes mensais**:
histórico de estoque e compras com mais de 30 dias, tarefas concluídas com mais de 45 dias, marmitas
consumidas com mais de 60 dias e semanas com mais de 4 meses. O app continua mostrando tudo.

Na prática, cada abertura lê algumas centenas de documentos. Duas pessoas usando o dia todo ficam
bem abaixo de 20% da cota. Para conferir: Firestore Database → aba **Uso**.

## Como os dados ficam no Firestore

```
households/{id da conta do responsável}   name, ownerEmail, memberEmails[], createdAt
households/{casa}/recipes/{id}            v (JSON da receita), t (data), by (e-mail de quem alterou)
households/{casa}/weeks/{segunda-feira}   ...
households/{casa}/pantry|ingredients|marmitas|movements|purchases|tasks|taskTemplates|displayLayouts|meta/...
households/{casa}/marks/{coleção~id~aparelho}   marcações de cada aparelho (lista, contagem, mercado do mês)
households/{casa}/{coleção}Archive/{AAAA-MM}    registros antigos agrupados por mês
households/{casa}/recipeImages/{receita}        imagem da receita
```

Cada registro guarda o mesmo JSON que o app usa (campo `v`), com três diferenças: as marcações
recentes ficam em `marks` até serem incorporadas (depois de 2 dias sem mudanças), os registros
antigos ficam nos pacotes mensais e a imagem da receita fica em `recipeImages`. Os detalhes estão em
[`src/cloud/layout.js`](../src/cloud/layout.js).

## Problemas comuns

| Mensagem | Solução |
|---|---|
| "Este endereço não está autorizado no Firebase" | Passo 3.3: adicionar `brunoalmeida87.github.io` em Domínios autorizados. |
| "Esse tipo de login não está ativado" | Passo 3.2: ativar Google e/ou E-mail/senha. |
| "Sem permissão no Firestore" | Passo 5: publicar as regras. Ao criar uma casa: a criação está bloqueada nas regras (veja "Criação de casas"). |
| "O e-mail … ainda não tem acesso" | O responsável precisa adicionar esse e-mail em Configurações → Pessoas da casa; depois tocar em "Procurar de novo". |
| Convidado(a) não encontra a casa | Conferir se o e-mail adicionado é exatamente o da conta usada; tocar em "Procurar de novo". |
| A janela do Google não abre no iPhone | Use "Entrar com e-mail e senha". |

## Testar no computador (desenvolvedores)

Testes automáticos da sincronização e das regras, nos emuladores (precisa de Java 11+):

```bash
npm run test:cloud
```

Com o [Firebase CLI](https://firebase.google.com/docs/cli) também é possível usar o app com emuladores locais, sem projeto real:

```bash
firebase emulators:start --only auth,firestore --project demo-panelai
VITE_FIREBASE_CONFIG='{"apiKey":"demo","authDomain":"demo-panelai.firebaseapp.com","projectId":"demo-panelai","appId":"1:1:web:1"}' \
VITE_FIREBASE_EMULATOR=127.0.0.1 npm run dev
```
