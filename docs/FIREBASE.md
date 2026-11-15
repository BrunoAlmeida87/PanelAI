# Sincronização na nuvem com Firebase

Com o Firebase configurado, o PanelAI guarda os dados numa **casa** compartilhada na nuvem.
Cada pessoa entra com o próprio e-mail (Google ou e-mail e senha) e todos veem o mesmo cardápio,
lista de compras e despensa, **atualizados na hora**. Sem internet, o app continua funcionando
e envia as alterações quando a conexão volta.

Sem a configuração, nada muda: o PanelAI continua salvando só no aparelho.

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
e que só o responsável pela casa adiciona ou remove pessoas.

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

---

## Usando no dia a dia

**Quem começa (ex.: Bruno), no aparelho que já tem os dados:**

1. Abra o PanelAI → ⚙️ **Configurações → Sincronização na nuvem → Entrar com Google**.
2. Toque em **Criar casa com os dados deste aparelho**. Receitas, cardápios, despensa e histórico vão para a nuvem.
3. Em **Convidar pessoa**, digite o e-mail da outra pessoa → **Adicionar**.

**Quem foi convidado(a):**

1. Abra o PanelAI no celular → ⚙️ **Configurações → Entrar com Google** (ou e-mail e senha) usando **o mesmo e-mail convidado**.
   - Com e-mail e senha: toque em **Criar conta**, abra o link de confirmação que chega por e-mail e toque em **Já confirmei**.
2. Aparece "Você faz parte da casa…" → **Usar os dados da casa**.

Pronto: o que um altera aparece no aparelho do outro em segundos. O topo da tela mostra
**Sincronizado**, **Sincronizando…** ou **Salvo no aparelho** (sem internet; envia depois).

### Bom saber

- **Sair da conta** em um aparelho apaga a cópia da nuvem nele e volta aos dados que estavam só no aparelho. Os dados da casa continuam na nuvem.
- **Importar, Restaurar demonstração e Começar do zero** afetam os dados **de todos** quando a nuvem está ativa. Exporte um backup antes.
- Se duas pessoas alterarem **a mesma semana** exatamente ao mesmo tempo, vale a última gravação. Na prática, com o app aberto, cada um já vê a mudança do outro antes de editar.
- Um mesmo e-mail participa de uma casa. Até 10 pessoas por casa.

## Como os dados ficam no Firestore

```
households/{casa}                       name, ownerEmail, memberEmails[], createdAt
households/{casa}/recipes/{id}          v (JSON da receita), t (data), by (e-mail de quem alterou)
households/{casa}/weeks/{segunda-feira} ...
households/{casa}/pantry|ingredients|marmitas|movements|purchases|meta/...
```

Cada registro guarda o mesmo JSON que o app usa (campo `v`). Isso facilita no futuro ler os dados
de outros lugares, como o display e-ink.

## Problemas comuns

| Mensagem | Solução |
|---|---|
| "Este endereço não está autorizado no Firebase" | Passo 3.3: adicionar `brunoalmeida87.github.io` em Domínios autorizados. |
| "Esse tipo de login não está ativado" | Passo 3.2: ativar Google e/ou E-mail/senha. |
| "Sem permissão no Firestore" | Passo 5: publicar as regras. |
| Convidado(a) não encontra a casa | Conferir se o e-mail adicionado é exatamente o da conta usada; tocar em "Procurar de novo". |
| A janela do Google não abre no iPhone | Use "Entrar com e-mail e senha". |

## Testar no computador (desenvolvedores)

Com o [Firebase CLI](https://firebase.google.com/docs/cli) é possível usar emuladores locais, sem projeto real:

```bash
firebase emulators:start --only auth,firestore --project demo-panelai
VITE_FIREBASE_CONFIG='{"apiKey":"demo","authDomain":"demo-panelai.firebaseapp.com","projectId":"demo-panelai","appId":"1:1:web:1"}' \
VITE_FIREBASE_EMULATOR=127.0.0.1 npm run dev
```
