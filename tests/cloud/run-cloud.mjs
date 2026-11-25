// Testes da sincronização na nuvem e das regras do Firestore, contra os
// emuladores do Firebase (nada toca o projeto real).
//
// Uso: npm run test:cloud
//   (roda "firebase emulators:exec" com o projeto de demonstração demo-panelai;
//    precisa de Java 11+ e do firebase-tools)
//
// Simula dois aparelhos (Alice e Bob) no mesmo processo, cada um com a sua
// instância do módulo src/cloud/cloud.js.

import { readFile } from 'node:fs/promises';

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
    throw new Error(`${msg}: erro inesperado ${err?.code ?? err}`, { cause: err });
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

/**
 * Regras da "primeira configuração": iguais às publicadas, com a criação de
 * casas liberada (como o docs/FIREBASE.md manda fazer num projeto novo).
 */
async function loadFirstSetupRules() {
  const published = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const firstSetup = published.replace('allow create: if false;', 'allow create: if canCreateHousehold(casa);');
  assert(firstSetup !== published, 'firestore.rules deveria ter "allow create: if false;"');
  const r = await fetch(`${FS}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rules: { files: [{ content: firstSetup }] } }),
  });
  assert(r.ok, `não foi possível carregar as regras (${r.status})`);
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
await createVerifiedUser('tela@exemplo.com');

const alice = await device('alice', 'alice@exemplo.com');
const bob = await device('bob', 'bob@exemplo.com');
const carol = await device('carol', 'carol@exemplo.com');
const tela = await device('tela', 'tela@exemplo.com');
await alice.signIn();
await bob.signIn();
await carol.signIn();
await tela.signIn();

const seed = buildSeed();
const WEEK = weekStartOf(todayISO());
// Semana do cardápio de demonstração + tarefas e layout (que antes não iam para a nuvem).
seed.tasks = { t1: { id: 't1', title: 'Tirar o lixo', date: todayISO(), status: 'todo', history: [] } };
seed.displayLayouts = { d1: { id: 'd1', name: 'Cozinha', cards: [], grid: {} } };
seed.recipes['bolo-teste'] = { ...Object.values(seed.recipes)[0], id: 'bolo-teste', name: 'Bolo teste', image: 'data:image/jpeg;base64,QUJD' };
const counts = Object.fromEntries(['ingredients', 'recipes', 'pantry', 'weeks', 'tasks', 'displayLayouts'].map((s) => [s, Object.keys(seed[s]).length]));

let hid = null;

await step('regras publicadas: ninguém cria casa nova', async () => {
  await expectDenied(alice.cloud.createHousehold('Casa teste', []), 'criar casa');
  await loadFirstSetupRules();
});

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

await step('Montessori: criança e registros chegam ao outro aparelho; os antigos vão para o arquivo mensal', async () => {
  const child = { id: 'crianca_ana', name: 'Ana', birthDate: '2025-07-10', gestationWeeks: null, plan: { date: todayISO(), ids: ['regar-as-plantas'] } };
  const log = (id, date) => ({ id, childId: child.id, activityId: 'regar-as-plantas', date, interest: 'alto', autonomy: 'ajuda', notes: '' });
  await alice.write([
    { store: 'children', type: 'put', value: child },
    { store: 'montessoriLogs', type: 'put', value: log('mreg_antigo', addDays(todayISO(), -90)) },
    { store: 'montessoriLogs', type: 'put', value: log('mreg_hoje', todayISO()) },
  ]);
  await waitFor(() => bob.state.children?.crianca_ana && Object.keys(bob.state.montessoriLogs ?? {}).length === 2, 'criança e registros no Bob');
  assert(bob.state.children.crianca_ana.plan.ids[0] === 'regar-as-plantas', 'atividades escolhidas para o dia chegam ao Bob');
  await waitFor(async () => (await adminList(`households/${hid}/montessoriLogs`)).length === 2, 'gravação no servidor');
  const r = await alice.cloud.runMaintenance();
  assert(r.archived >= 1, `esperado arquivar o registro antigo, arquivou ${r.archived}`);
  assert((await adminList(`households/${hid}/montessoriLogsArchive`)).length === 1, 'deveria haver 1 pacote mensal');
  assert((await adminList(`households/${hid}/montessoriLogs`)).length === 1, 'só o registro recente fica avulso');
  await new Promise((res) => setTimeout(res, 500));
  for (const d of [alice, bob]) assert(Object.keys(d.state.montessoriLogs).length === 2, 'o app continua vendo os 2 registros');
});

await step('regras: quem não é da casa não lê nem grava', async () => {
  const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('carol'));
  await expectDenied(getDoc(doc(db, 'households', hid)), 'ler a casa');
  await expectDenied(getDoc(doc(db, 'households', hid, 'recipes', 'bolo-teste')), 'ler receita');
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'carol@exemplo.com' }), 'gravar receita');
});

await step('regras (primeira configuração): cada conta cria só a própria casa', async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('carol'));
  const data = { name: 'Outra', ownerEmail: 'carol@exemplo.com', memberEmails: ['carol@exemplo.com'], createdAt: serverTimestamp() };
  await expectDenied(setDoc(doc(db, 'households', 'qualquer-id'), data), 'criar com id de outro');
  await setDoc(doc(db, 'households', carolUid), data);
});

await step('casa criada pela versão anterior abre igual (formato antigo)', async () => {
  // Carol (dona da casa criada acima) grava registros como a versão anterior gravava:
  // o registro inteiro em "v", com a imagem e as marcações da lista dentro.
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('carol'));
  const old = (coll, id, value) =>
    setDoc(doc(db, 'households', carolUid, coll, encodeURIComponent(id)), { v: JSON.stringify(value), t: serverTimestamp(), by: 'carol@exemplo.com' });
  const recipe = { ...Object.values(seed.recipes)[0], id: 'antiga', name: 'Receita antiga', image: 'data:image/jpeg;base64,T0xE' };
  const week = { id: WEEK, meals: {}, shopping: { checked: { 'sal|g': true }, overrides: {}, missing: {}, extras: [{ id: 'avulso_1', name: 'Pão', checked: true }] }, tasksDone: {} };
  await old('recipes', 'antiga', recipe);
  await old('weeks', WEEK, week);
  await old('meta', 'settings', { key: 'settings', value: { people: 2 } });
  await carol.start(carolUid);
  assert(carol.state.recipes.antiga.image === recipe.image, 'imagem da receita antiga');
  assert(carol.state.weeks[WEEK].shopping.checked['sal|g'] === true, 'marcação antiga');
  assert(carol.state.weeks[WEEK].shopping.extras[0].name === 'Pão', 'avulso antigo');
  // Marcar um item na versão nova mantém o que já estava marcado.
  const w = carol.state.weeks[WEEK];
  await carol.write([{ store: 'weeks', type: 'put', value: { ...w, shopping: { ...w.shopping, checked: { ...w.shopping.checked, 'oleo|ml': true } } } }]);
  await waitFor(async () => (await adminList(`households/${carolUid}/marks`)).length === 1, 'marcação gravada');
  const doc2 = (await adminList(`households/${carolUid}/weeks`))[0];
  assert(JSON.parse(doc2.fields.v.stringValue).shopping.checked['sal|g'] === true, 'semana antiga preservada');
  carol.cloud.stopSync();
});

await step('regras: gravações precisam identificar a pessoa certa', async () => {
  const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('bob'));
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'alice@exemplo.com' }), 'gravar em nome de outra pessoa');
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'bob@exemplo.com', extra: 1 }), 'campo extra');
});

await step('conta de tela: só o responsável cadastra; ela acha a casa e lê tudo', async () => {
  await expectDenied(bob.cloud.addViewer(hid, 'tela@exemplo.com'), 'pessoa (não responsável) cadastrando tela');
  await expectDenied(alice.cloud.addViewer(hid, 'alice@exemplo.com'), 'responsável como conta de tela');
  await alice.cloud.addViewer(hid, 'tela@exemplo.com');
  const found = await tela.cloud.findMyHousehold();
  assert(found?.id === hid && found.role === 'viewer', `a tela deveria achar a casa como "viewer" (veio ${found?.role})`);
  assert((await bob.cloud.findMyHousehold())?.role === 'member', 'Bob continua pessoa da casa');
  await tela.start(hid);
  for (const [store, n] of Object.entries(counts)) {
    if (store === 'tasks') continue; // tarefas mudam nos passos anteriores
    assert(Object.keys(tela.state[store] ?? {}).length >= n, `${store}: a tela deveria ler ${n}`);
  }
  await waitFor(() => tela.serverSynced, 'tela sincronizada');
  return `${Object.keys(tela.state.recipes).length} receitas lidas`;
});

await step('conta de tela: não grava, não apaga e não mexe na casa', async () => {
  const { getFirestore, doc, setDoc, deleteDoc, updateDoc, arrayRemove, serverTimestamp } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  const db = getFirestore(getApp('tela'));
  await expectDenied(setDoc(doc(db, 'households', hid, 'recipes', 'x'), { v: '{}', t: serverTimestamp(), by: 'tela@exemplo.com' }), 'gravar receita');
  await expectDenied(deleteDoc(doc(db, 'households', hid, 'recipes', 'bolo-teste')), 'apagar receita');
  await expectDenied(setDoc(doc(db, 'households', hid, 'montessoriLogs', 'x'), { v: '{}', t: serverTimestamp(), by: 'tela@exemplo.com' }), 'registrar atividade Montessori');
  await expectDenied(deleteDoc(doc(db, 'households', hid, 'children', 'crianca_ana')), 'apagar a criança');
  await expectDenied(updateDoc(doc(db, 'households', hid), { name: 'Hackeada' }), 'renomear a casa');
  await expectDenied(updateDoc(doc(db, 'households', hid), { viewerEmails: arrayRemove('tela@exemplo.com') }), 'tirar-se da lista');
  await expectDenied(updateDoc(doc(db, 'households', hid), { memberEmails: ['alice@exemplo.com', 'bob@exemplo.com', 'tela@exemplo.com'] }), 'virar pessoa da casa');
  tela.cloud.stopSync();
});

await step('conta de tela removida pelo responsável deixa de ler', async () => {
  const { getFirestore, doc, getDoc } = await import('firebase/firestore');
  const { getApp } = await import('firebase/app');
  await alice.cloud.removeViewer(hid, 'tela@exemplo.com');
  const db = getFirestore(getApp('tela'));
  await expectDenied(getDoc(doc(db, 'households', hid, 'recipes', 'bolo-teste')), 'ler receita depois de removida');
  assert((await tela.cloud.findMyHousehold()) == null, 'não deveria mais achar a casa');
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
