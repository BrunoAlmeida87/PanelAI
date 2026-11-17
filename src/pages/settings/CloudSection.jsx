// Configurações → Sincronização na nuvem (Firebase).
// O módulo do Firebase é carregado só quando necessário.

import { useEffect, useState } from 'preact/hooks';
import { Cloud, CloudOff, LogIn, LogOut, Mail, RefreshCw, Trash2, UserPlus, Users } from 'lucide-preact';
import { useStore } from '../../storage/store.js';
import { toast, confirmDialog } from '../../components/ui.jsx';

const api = () => import('../../cloud/session.js');

const AUTH_ERRORS = {
  'auth/popup-closed-by-user': 'Login cancelado.',
  'auth/cancelled-popup-request': 'Login cancelado.',
  'auth/popup-blocked': 'O navegador bloqueou a janela de login. Permita pop-ups para este site ou entre com e-mail e senha.',
  'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).',
  'auth/operation-not-allowed': 'Esse tipo de login não está ativado no Firebase (Authentication → Método de login).',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar".',
  'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Digite a senha.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  'permission-denied': 'Sem permissão no Firestore. Confira se as regras (firestore.rules) foram publicadas.',
  unavailable: 'Sem conexão com a nuvem. Tente de novo com internet.',
};

const errorText = (err) => AUTH_ERRORS[err?.code] ?? err?.message ?? String(err);

export function CloudSection() {
  const s = useStore();
  const c = s.cloud;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // undefined = não procurado ainda; null = nenhuma casa; objeto = casa encontrada
  const [found, setFound] = useState(undefined);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      return await fn(await api());
    } catch (err) {
      console.error(err);
      setError(errorText(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const afterLogin = (r) => {
    if (r) setFound(r.household ?? null);
  };

  // Sem a nuvem ativa, o Firebase só é carregado agora (ao abrir esta tela).
  useEffect(() => {
    if (c.configured && s.mode !== 'cloud') {
      api()
        .then((a) => a.initCloudUi())
        .catch((err) => setError(errorText(err)));
    }
  }, []);

  // Usuário já logado (modo local): procura a casa ao abrir a tela.
  useEffect(() => {
    if (s.mode === 'local' && c.user?.verified && found === undefined) {
      run((a) => a.findMyHousehold()).then((h) => setFound(h ?? null));
    }
  }, [s.mode, c.user?.email, c.user?.verified]);

  return (
    <section class="card card-pad form-section" style="margin-top:16px" aria-labelledby="nuvem">
      <h2 id="nuvem" class="section-title" style="margin:0;display:flex;gap:8px;align-items:center">
        <Cloud size={18} /> Sincronização na nuvem
      </h2>
      <Body s={s} c={c} busy={busy} run={run} found={found} setFound={setFound} afterLogin={afterLogin} />
      {(error || c.error) && (
        <div class="notice" role="alert" style="background:var(--danger-light);color:var(--danger)">
          {error || c.error}
        </div>
      )}
    </section>
  );
}

function Body({ s, c, busy, run, found, setFound, afterLogin }) {
  if (!c.configured) {
    return (
      <div class="notice info">
        <CloudOff size={18} />
        <span>
          A nuvem ainda não está configurada, então os dados ficam só neste aparelho. Para compartilhar com outras pessoas da casa, configure o Firebase
          (passo a passo em <code>docs/FIREBASE.md</code> no projeto).
        </span>
      </div>
    );
  }
  if (c.status === 'checking') return <p class="small muted">Verificando a conta…</p>;
  if (s.mode === 'cloud') return <ActiveHousehold s={s} c={c} busy={busy} run={run} />;
  if (!c.user) return <SignIn busy={busy} run={run} afterLogin={afterLogin} />;
  if (!c.user.verified) {
    return (
      <>
        <div class="notice info">
          <Mail size={18} />
          <span>
            Enviamos um e-mail de confirmação para <strong>{c.user.email}</strong>. Abra o link do e-mail (veja também o spam) e depois toque em "Já confirmei".
          </span>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" disabled={busy} onClick={() => run((a) => a.checkVerification()).then(afterLogin)}>
            <RefreshCw size={16} /> Já confirmei
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            disabled={busy}
            onClick={() => run((a) => a.resendVerification()).then(() => toast('E-mail reenviado'))}
          >
            Reenviar e-mail
          </button>
          <SignOutButton busy={busy} run={run} />
        </div>
      </>
    );
  }
  return <NoHouseholdYet c={c} busy={busy} run={run} found={found} setFound={setFound} />;
}

function SignIn({ busy, run, afterLogin }) {
  const [withEmail, setWithEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (kind) => (e) => {
    e?.preventDefault?.();
    run((a) => (kind === 'new' ? a.signUpEmail(email, password) : a.signInEmail(email, password))).then(afterLogin);
  };

  return (
    <>
      <p class="small muted" style="margin:0">
        Entre com a sua conta para compartilhar cardápio, lista de compras e despensa com as pessoas da casa. Cada pessoa entra com o próprio e-mail e todos veem as
        mesmas informações, atualizadas na hora.
      </p>
      <div class="toolbar">
        <button type="button" class="btn btn-primary" disabled={busy} onClick={() => run((a) => a.signInGoogle()).then(afterLogin)}>
          <LogIn size={16} /> Entrar com Google
        </button>
        <button type="button" class="btn btn-secondary" disabled={busy} onClick={() => setWithEmail((v) => !v)} aria-expanded={withEmail}>
          <Mail size={16} /> Entrar com e-mail e senha
        </button>
      </div>
      {withEmail && (
        <form class="form-section" style="gap:10px" onSubmit={submit('login')}>
          <label class="field">
            <span class="label">E-mail</span>
            <input class="input" type="email" autoComplete="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span class="label">Senha</span>
            <input
              class="input"
              type="password"
              autoComplete="current-password"
              minLength={6}
              required
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
            <span class="hint">Mínimo de 6 caracteres. Ao criar a conta, enviamos um e-mail de confirmação.</span>
          </label>
          <div class="toolbar">
            <button type="submit" class="btn btn-primary" disabled={busy}>
              Entrar
            </button>
            <button type="button" class="btn btn-secondary" disabled={busy || !email || password.length < 6} onClick={submit('new')}>
              Criar conta
            </button>
            <button
              type="button"
              class="btn btn-ghost"
              disabled={busy || !email}
              onClick={() => run((a) => a.resetPassword(email)).then(() => toast('Se a conta existir, enviamos um e-mail para trocar a senha'))}
            >
              Esqueci a senha
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function NoHouseholdYet({ c, busy, run, found, setFound }) {
  const [name, setName] = useState('Nossa casa');

  if (found === undefined) return <p class="small muted">Procurando sua casa na nuvem…</p>;

  if (found) {
    return (
      <>
        <p style="margin:0">
          Você faz parte da casa <strong>{found.name}</strong>.
        </p>
        <p class="small muted" style="margin:0">
          Ao usar a casa, este aparelho passa a mostrar os dados da nuvem. Os dados que estão só neste aparelho ficam guardados à parte e voltam se você sair da conta.
        </p>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" disabled={busy} onClick={() => run((a) => a.joinHousehold(found))}>
            <Cloud size={16} /> Usar os dados da casa
          </button>
          <SignOutButton busy={busy} run={run} />
        </div>
      </>
    );
  }

  const create = async () => {
    const ok = await confirmDialog({
      title: 'Criar casa na nuvem',
      message:
        'As receitas, cardápios, despensa e histórico deste aparelho serão enviados para a nuvem e passarão a ser compartilhados com as pessoas que você adicionar.',
      confirmLabel: 'Criar e enviar',
    });
    if (ok) run((a) => a.createHouseholdFromThisDevice(name));
  };

  return (
    <>
      <p class="small muted" style="margin:0">
        Conectado como <strong>{c.user.email}</strong>. Ainda não há uma casa com este e-mail.
      </p>
      <div class="notice info">
        <Users size={18} />
        <span>
          <strong>É a primeira pessoa?</strong> Crie a casa com os dados deste aparelho e depois adicione o e-mail das outras pessoas.
          <br />
          <strong>Alguém já criou?</strong> Peça para adicionarem <strong>{c.user.email}</strong> em Configurações e toque em "Procurar de novo".
        </span>
      </div>
      <label class="field">
        <span class="label">Nome da casa</span>
        <input class="input" value={name} maxLength={60} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="toolbar">
        <button type="button" class="btn btn-primary" disabled={busy || !name.trim()} onClick={create}>
          <Cloud size={16} /> Criar casa com os dados deste aparelho
        </button>
        <button type="button" class="btn btn-secondary" disabled={busy} onClick={() => run((a) => a.findMyHousehold()).then((h) => setFound(h ?? null))}>
          <RefreshCw size={16} /> Procurar de novo
        </button>
        <SignOutButton busy={busy} run={run} />
      </div>
    </>
  );
}

function ActiveHousehold({ s, c, busy, run }) {
  const [email, setEmail] = useState('');
  const h = c.household;
  const isOwner = h && c.user && h.ownerEmail === c.user.email;

  const add = (e) => {
    e.preventDefault();
    run(async (a) => {
      await a.addMember(email);
      toast(`${email} adicionado(a). Peça para entrar no PanelAI com esse e-mail.`);
      setEmail('');
    });
  };

  const remove = async (m) => {
    const ok = await confirmDialog({
      title: 'Remover pessoa',
      message: `${m} deixará de ver e alterar os dados da casa.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok) run((a) => a.removeMember(m));
  };

  return (
    <>
      <div class="notice info">
        <Cloud size={18} />
        <span>
          Dados compartilhados na casa <strong>{h?.name ?? '…'}</strong>. As alterações aparecem na hora para todos. Sem internet, tudo continua funcionando e é enviado
          quando a conexão voltar{c.pending > 0 ? ' (há alterações aguardando envio)' : ''}.
        </span>
      </div>
      <p class="small muted" style="margin:0">
        Conectado como <strong>{c.user?.email}</strong>
        {isOwner ? ' · responsável pela casa' : ''}
      </p>
      {h && (
        <div class="field">
          <span class="label">Pessoas da casa</span>
          <ul style="list-style:none;margin:0;padding:0;display:grid;gap:6px">
            {h.memberEmails.map((m) => (
              <li key={m} style="display:flex;gap:8px;align-items:center;justify-content:space-between">
                <span>
                  {m}
                  {m === h.ownerEmail && <span class="badge badge-green" style="margin-left:6px">responsável</span>}
                </span>
                {isOwner && m !== h.ownerEmail && (
                  <button type="button" class="btn btn-danger-ghost" disabled={busy} onClick={() => remove(m)} aria-label={`Remover ${m}`}>
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isOwner && (
        <form class="field" onSubmit={add}>
          <span class="label">Convidar pessoa</span>
          <div class="input-group" style="display:flex;gap:8px;flex-wrap:wrap">
            <input
              class="input"
              style="flex:1;min-width:200px"
              type="email"
              required
              placeholder="email@exemplo.com"
              value={email}
              onInput={(e) => setEmail(e.currentTarget.value)}
              aria-label="E-mail da pessoa"
            />
            <button type="submit" class="btn btn-secondary" disabled={busy || !email}>
              <UserPlus size={16} /> Adicionar
            </button>
          </div>
          <span class="hint">A pessoa abre o PanelAI, vai em Configurações e entra com esse mesmo e-mail (Google ou e-mail e senha).</span>
        </form>
      )}
      <div class="toolbar">
        {h && !isOwner && <LeaveButton busy={busy} run={run} name={h.name} />}
        <SignOutButton busy={busy} run={run} label="Sair da conta neste aparelho" />
      </div>
    </>
  );
}

function LeaveButton({ busy, run, name }) {
  const onClick = async () => {
    const ok = await confirmDialog({
      title: 'Sair da casa',
      message: `Você deixa de ver e alterar os dados da casa ${name}. Este aparelho volta aos dados guardados só nele. Para voltar, o responsável precisa adicionar seu e-mail de novo.`,
      confirmLabel: 'Sair da casa',
      danger: true,
    });
    if (ok) run((a) => a.leaveHousehold());
  };
  return (
    <button type="button" class="btn btn-danger-ghost" disabled={busy} onClick={onClick}>
      <LogOut size={16} /> Sair da casa
    </button>
  );
}

function SignOutButton({ busy, run, label = 'Sair' }) {
  const s = useStore();
  const onClick = async () => {
    if (s.mode === 'cloud') {
      const ok = await confirmDialog({
        title: 'Sair da conta',
        message:
          s.cloud.pending > 0
            ? 'Há alterações que ainda não foram enviadas para a nuvem e serão perdidas. Conecte-se à internet antes de sair, se puder.'
            : 'Este aparelho deixa de mostrar os dados da casa e volta aos dados guardados só nele. Os dados da nuvem continuam salvos para as outras pessoas.',
        confirmLabel: 'Sair',
        danger: s.cloud.pending > 0,
      });
      if (!ok) return;
    }
    run((a) => a.signOutCloud());
  };
  return (
    <button type="button" class="btn btn-ghost" disabled={busy} onClick={onClick}>
      <LogOut size={16} /> {label}
    </button>
  );
}
