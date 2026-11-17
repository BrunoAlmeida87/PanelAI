// Configuração do Firebase (sincronização na nuvem).
//
// Cole aqui o objeto "firebaseConfig" que o console do Firebase mostra em
// Configurações do projeto → Seus apps → App da Web. Esses valores NÃO são
// senhas: eles só identificam o projeto. Quem protege os dados são as regras
// do Firestore (arquivo firestore.rules) e o login.
//
// Com apiKey vazio, o PanelAI funciona só neste aparelho, como antes.
// Passo a passo completo em docs/FIREBASE.md.

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCC_IfEOQDX20tBiJ4FgIb90_O-dHvL8kE',
  authDomain: 'house-management-2c5a9.firebaseapp.com',
  projectId: 'house-management-2c5a9',
  storageBucket: 'house-management-2c5a9.firebasestorage.app',
  messagingSenderId: '510022017478',
  appId: '1:510022017478:web:02d13bf6afbf884577d2c7',
};

function fromEnv() {
  try {
    // import.meta.env no app (Vite); process.env nos testes com o emulador (Node).
    const raw = import.meta.env?.VITE_FIREBASE_CONFIG || globalThis.process?.env?.VITE_FIREBASE_CONFIG;
    return raw ? JSON.parse(raw) : null;
  } catch {
    console.warn('VITE_FIREBASE_CONFIG inválido; usando src/cloud/firebase-config.js');
    return null;
  }
}

/** Configuração em uso (variável de ambiente VITE_FIREBASE_CONFIG tem prioridade). */
export const firebaseConfig = fromEnv() ?? FIREBASE_CONFIG;

/**
 * App Check (opcional, recomendado): chave do site reCAPTCHA v3. Com ela, só o
 * site publicado consegue usar o Firebase do projeto. Passo a passo em
 * docs/FIREBASE.md. Também pode vir da variável VITE_APPCHECK_SITE_KEY.
 */
export const appCheckSiteKey = import.meta.env?.VITE_APPCHECK_SITE_KEY || '';

/** Endereço do emulador local (só para desenvolvimento/testes), ex.: "127.0.0.1". */
export const emulatorHost = import.meta.env?.VITE_FIREBASE_EMULATOR || '';

export const cloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
