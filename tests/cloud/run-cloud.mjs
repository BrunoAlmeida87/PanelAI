// Testes da sincronização na nuvem e das regras do Firestore, contra os
// emuladores do Firebase (nada toca o projeto real).
//
// Uso: npm run test:cloud
//   (roda "firebase emulators:exec" com o projeto de demonstração demo-panelai;
//    precisa de Java 11+ e do firebase-tools)
//
// Simula dois aparelhos (Alice e Bob) no mesmo processo, cada um com a sua
// instância do módulo src/cloud/cloud.js.


const HOST = '127.0.0.1';
const PROJECT = 'demo-panelai';
const API_KEY = 'demo-key';
const AUTH = `http://${HOST}:9099`;
const FS = `http://${HOST}:8080`;

process.env.VITE_FIREBASE_CONFIG = JSON.stringify({
  apiKey: API_KEY,
  authDomain: `${PROJECT}.firebaseapp.com`,
  projectId: PROJECT,
  appId: '1:1:web:demo',
});

const results = [];
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`✘ ${name} — ${String(err?.message ?? err).split('\n')[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function waitFor(cond, msg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`tempo esgotado: ${msg}`);
}
async function expectDenied(p, msg) {
  try {
    await p;
  } catch (err) {
    if (err?.code === 'permission-denied') return;
    throw new Error(`${msg}: erro inesperado ${err?.code ?? err}`);
  }
  throw new Error(`${msg}: deveria ser recusado`);
}

// ---------- contas no emulador ----------

async function createVerifiedUser(email) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'segredo123', returnSecureToken: true }),
  });
  const { localId } = await r.json();
  const u = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  assert(u.ok, `não foi possível confirmar ${email}`);
  return localId;
}

/** Lista documentos ignorando as regras (conta "owner" do emulador). */
async function adminList(path) {
  const r = await fetch(`${FS}/v1/projects/${PROJECT}/databases/(default)/documents/${path}?pageSize=1000`, {
    headers: { authorization: 'Bearer owner' },
  });
  const j = await r.json();
  return j.documents ?? [];
}

// ---------- aparelhos ----------

async function device(name, email) {
  const cloud = await import(`../../src/cloud/cloud.js?aparelho=${name}`);
  cloud.configureCloud({ appName: name, emulatorHost: HOST, deviceId: name });
  const state = {};
  const errors = [];
  const apply = (store, changes) => {
    state[store] ??= {};
    for (const c of changes) {
      if (c.type === 'put') state[store][c.key] = c.value;
      else delete state[store][c.key];
    }
  };
  let serverSynced = false;
  return {
    cloud,
    state,
    errors,
    get serverSynced() {
      return serverSynced;
    },
    signIn: () => cloud.signInEmail(email, 'segredo123'),
    async start(householdId) {
      const initial = await cloud.startSync(householdId, {
        requireServer: true,
        onChanges: apply,
        onHousehold: () => {},
        onPending: () => {},
        onError: (err, where) => errors.push(`${where}: ${err?.code ?? err?.message}`),
        onServerSynced: () => {
          serverSynced = true;
        },
      });
      for (const [store, changes] of Object.entries(initial)) apply(store, changes);
    },
    /** Grava como o app: atualiza o estado local e envia. */
    write(ops) {
      for (const op of ops) {
        state[op.store] ??= {};
        if (op.type === 'put') state[op.store][op.value.id ?? op.value.key ?? op.value.ingredientId] = op.value;
        else if (op.type === 'delete') delete state[op.store][op.key];
      }
      return cloud.writeOps(ops);
    },
  };
}

// ---------- testes ----------

const { buildSeed } = await import('../../src/data/seed.js');
const { seedOps } = await import('../../src/storage/store.js');
const { weekStartOf, todayISO, addDays } = await import('../../src/utils/dates.js');

const aliceUid = await createVerifiedUser('alice@exemplo.com');
await createVerifiedUser('bob@exemplo.com');
const carolUid = await createVerifiedUser('carol@exemplo.com');

const alice = await device('alice', 'alice@exemplo.com');
const bob = await device('bob', 'bob@exemplo.com');
const carol = await device('carol', 'carol@exemplo.com');
await alice.signIn();
await bob.signIn();
await carol.signIn();

const seed = buildSeed();
const WEEK = weekStartOf(todayISO());
// Semana do cardápio de demonstração + tarefas e layout (que antes não iam para a nuvem).
seed.tasks = { t1: { id: 't1', title: 'Tirar o lixo', date: todayISO(), status: 'todo', history: [] } };
seed.displayLayouts = { d1: { id: 'd1', name: 'Cozinha', cards: [], grid: {} } };
seed.recipes['bolo-teste'] = { ...Object.values(seed.recipes)[0], id: 'bolo-teste', name: 'Bolo teste', image: 'data:image/jpeg;base64,QUJD' };
const counts = Object.fromEntries(['ingredients', 'recipes', 'pantry', 'weeks', 'tasks', 'displayLayouts'].map((s) => [s, Object.keys(seed[s]).length]));

let hid = null;

await step('criar a casa envia todos os dados (inclusive tarefas e layouts)', async () => {
  hid = await alice.cloud.createHousehold('Casa teste', seedOps(seed));
  assert(hid === aliceUid, 'o id da casa deve ser o id da conta');
  await alice.cloud.addMember(hid, 'bob@exemplo.com');
  const found = await bob.cloud.findMyHousehold();
  assert(found?.id === hid, 'Bob deveria encontrar a casa');
  await alice.start(hid);
  await bob.start(hid);
  for (const d of [alice, bob]) {
    for (const [store, n] of Object.entries(counts)) {
      assert(Object.keys(d.state[store] ?? {}).length === n, `${store}: esperado ${n}, veio ${Object.keys(d.state[store] ?? {}).length}`);
    }
  }
  await waitFor(() => alice.serverSynced && bob.serverSynced, 'confirmação do servidor');
  return `${Object.values(counts).reduce((a, b) => a + b, 0)} registros`;
});

await step('imagem da receita fica à parte e chega ao outro aparelho', async () => {
  assert(bob.state.recipes['bolo-teste'].image === 'data:image/jpeg;base64,QUJD', 'Bob deveria ver a imagem');
  const images = await adminList(`households/${hid}/recipeImages`);
  assert(images.length === 1, `esperado 1 imagem, veio ${images.length}`);
  const doc = (await adminList(`households/${hid}/recipes`)).find((d) => d.name.endsWith('/bolo-teste'));
  assert(JSON.parse(doc.fields.v.stringValue).image === null, 'a receita não deve carregar a imagem');
});

await step('duas pessoas marcando a lista ao mesmo tempo não perdem marcações', async () => {
  const week = (d) => d.state.weeks[WEEK] ?? { id: WEEK, meals: {}, shopping: { checked: {}, overrides: {}, missing: {}, extras: [] } };
  const mark = (w, key) => ({ ...w, shopping: { ...w.shopping, checked: { ...(w.shopping?.checked ?? {}), [key]: true } }, updatedAt: new Date().toISOString() });
  if (!alice.state.weeks[WEEK]) {
    await alice.write([{ store: 'weeks', type: 'put', value: week(alice) }]);
    await waitFor(() => bob.state.weeks?.[WEEK], 'semana no Bob');
  }
  // Os dois gravam antes de receber a marcação do outro.
  const wa = mark(week(alice), 'arroz|g');
  const wb = mark(week(bob), 'feijao|g');
  await Promise.all([alice.write([{ store: 'weeks', type: 'put', value: wa }]), bob.write([{ store: 'weeks', type: 'put', value: wb }])]);
  const both = (d) => d.state.weeks[WEEK]?.shopping?.checked?.['arroz|g'] && d.state.weeks[WEEK]?.shopping?.checked?.['feijao|g'];
  await waitFor(() => both(alice) && both(bob), 'as duas marcações nos dois aparelhos');
});

await step('registros antigos vão para o arquivo mensal sem sumir do app', async () => {
  const old = addDays(todayISO(), -90);
  const ops = Array.from({ length: 5 }, (_, i) => ({
    store: 'movements',
    type: 'put',
    value: { id: `mov_antigo_${i}`, date: `${old}T12:00:00.000Z`, type: 'compra', ingredientId: 'arroz', delta: 1, unit: 'g' },
  }));
  await alice.write(ops);
  await waitFor(() => Object.keys(bob.state.movements ?? {}).length >= 5, 'movimentações no Bob');
  await waitFor(async () => (await adminList(`households/${hid}/movements`)).length >= 5, 'gravação no servidor');
  const r = await alice.cloud.runMaintenance();
  assert(r.archived === 5, `esperado arquivar 5, arquivou ${r.archived}`);
  assert((await adminList(`households/${hid}/movements`)).length === 0, 'movimentações avulsas deveriam sair');
  assert((await adminList(`households/${hid}/movementsArchive`)).length === 1, 'deveria haver 1 pacote mensal');
  await new Promise((res) => setTimeout(res, 500));
  for (const d of [alice, bob]) assert(Object.keys(d.state.movements).length === 5, 'o app continua vendo as 5 movimentações');
  return `pacote ${old.slice(0, 7)}`;
});

await step('marcações antigas são incorporadas à semana sem mudar nada', async () => {
  const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))));
  const before = sorted(bob.state.weeks[WEEK].shopping.checked);
  assert((await adminList(`households/${hid}/marks`)).length >= 2, 'deveria haver marcações');
  const r = await bob.cloud.runMaintenance({ now: Date.now() + 3 * 86_400_000 });
  assert(r.folded >= 1, 'nada incorporado');
  assert((await adminList(`households/${hid}/marks`)).length === 0, 'as marcações deveriam ser apagadas');
  await new Promise((res) => setTimeout(res, 500));
  for (const d of [alice, bob]) {
    const after = sorted(d.state.weeks[WEEK].shopping.checked);
    assert(after === before, `marcações mudaram: ${before} → ${after}`);
  }
});

await step('regras: quem não é da casa não lê nem grava', async () => {
  const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('carol'));
  await expectDenied(getDoc(doc(db, 'households', hid)), 'ler a casa');
  await expectDenied(getDoc(doc(db, 'households', hid, 'recipes', 'bolo-teste')), 'ler receita');
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'carol@exemplo.com' }), 'gravar receita');
});

await step('regras: cada conta cria só a própria casa', async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('carol'));
  const data = { name: 'Outra', ownerEmail: 'carol@exemplo.com', memberEmails: ['carol@exemplo.com'], createdAt: serverTimestamp() };
  await expectDenied(setDoc(doc(db, 'households', 'qualquer-id'), data), 'criar com id de outro');
  await setDoc(doc(db, 'households', carolUid), data);
});

await step('regras: gravações precisam identificar a pessoa certa', async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('bob'));
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'alice@exemplo.com' }), 'gravar em nome de outra pessoa');
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'bob@exemplo.com', extra: 1 }), 'campo extra');
});

await step('regras: quem não é responsável não remove outras pessoas, mas pode sair', async () => {
  await expectDenied(bob.cloud.removeMember(hid, 'alice@exemplo.com'), 'remover a responsável');
  await bob.cloud.leaveHousehold(hid);
  const found = await bob.cloud.findMyHousehold();
  assert(found == null, 'Bob não deveria mais estar na casa');
});

await step('nenhum erro inesperado nos aparelhos', async () => {
  const unexpected = alice.errors.filter((e) => !e.includes('permission-denied'));
  assert(!unexpected.length, unexpected.join('; '));
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações da nuvem passaram`);
process.exit(failed ? 1 : 0);
