// Sinais guardados no aparelho para decidir, ao abrir o app, se vale carregar
// o Firebase (≈ 200 KB). Quem nunca entrou na nuvem abre direto com os dados
// locais; o Firebase só é baixado ao abrir Configurações → Nuvem.

export const CLOUD_HOUSEHOLD_KEY = 'panelai.cloud.household';
export const CLOUD_HINT_KEY = 'panelai.cloud.signedIn';

export function hasCloudHint() {
  try {
    return !!(localStorage.getItem(CLOUD_HOUSEHOLD_KEY) || localStorage.getItem(CLOUD_HINT_KEY));
  } catch {
    return false;
  }
}
