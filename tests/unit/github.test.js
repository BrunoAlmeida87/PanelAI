import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_DEBOUNCE_MS,
  AUTO_MIN_GAP_MS,
  DEFAULT_REPO,
  isValidGithubToken,
  maskToken,
  nextAutoRequest,
  repoFromSite,
  requestImageGeneration,
  tokenCreationUrl,
  touchesDisplay,
} from '../../src/display/github.js';

const TOKEN = `github_pat_${'A1b2C3d4E5'.repeat(8)}`;

describe('pedidos ao GitHub para gerar a imagem', () => {
  it('descobre o repositório pelo endereço do site', () => {
    expect(repoFromSite('brunoalmeida87.github.io', '/PanelAI/')).toBe('brunoalmeida87/PanelAI');
    expect(repoFromSite('localhost', '/PanelAI/')).toBe(DEFAULT_REPO);
    expect(repoFromSite('exemplo.github.io', '/')).toBe(DEFAULT_REPO);
  });

  it('confere o formato da chave e mostra só o começo e o fim', () => {
    expect(isValidGithubToken(TOKEN)).toBe(true);
    expect(isValidGithubToken(` ${TOKEN} `)).toBe(true);
    expect(isValidGithubToken(`ghp_${'x'.repeat(36)}`)).toBe(true);
    expect(isValidGithubToken('minha-senha')).toBe(false);
    expect(isValidGithubToken('')).toBe(false);
    expect(maskToken(TOKEN)).toBe(`github_pat_…${TOKEN.slice(-4)}`);
    expect(maskToken(TOKEN)).not.toContain(TOKEN.slice(15, 30));
  });

  it('abre a criação da chave já preenchida (só rodar o workflow, sem vencer)', () => {
    const u = new URL(tokenCreationUrl());
    expect(u.origin + u.pathname).toBe('https://github.com/settings/personal-access-tokens/new');
    expect(u.searchParams.get('actions')).toBe('write');
    expect(u.searchParams.get('expires_in')).toBe('none');
    expect(u.searchParams.get('name').length).toBeLessThanOrEqual(40);
    // Nada além do necessário: nem conteúdo do repositório, nem workflows.
    expect([...u.searchParams.keys()].sort()).toEqual(['actions', 'description', 'expires_in', 'name']);
  });

  it('dispara o workflow da imagem na branch main', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204 }));
    const r = await requestImageGeneration({ token: TOKEN, repo: 'dono/PanelAI', fetchImpl, keepalive: true });
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/dono/PanelAI/actions/workflows/display.yml/dispatches');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({ ref: 'main' });
  });

  it('explica os erros em português e nunca rejeita', async () => {
    const com = (status) => requestImageGeneration({ token: TOKEN, fetchImpl: async () => ({ status }) });
    expect((await com(401)).message).toMatch(/inválida ou venceu/);
    expect((await com(403)).message).toMatch(/Actions: Read and write/);
    expect((await com(404)).message).toMatch(/acesso ao repositório/);
    expect((await com(500)).message).toMatch(/erro 500/);
    const semRede = await requestImageGeneration({ token: TOKEN, fetchImpl: async () => Promise.reject(new Error('offline')) });
    expect(semRede).toMatchObject({ ok: false, status: 0 });
    const semChave = await requestImageGeneration({ token: '', fetchImpl: vi.fn() });
    expect(semChave.message).toMatch(/Falta a chave/);
  });
});

describe('geração automática quando algo muda', () => {
  const T = 1_800_000_000_000;

  it('espera a pessoa parar de mexer e respeita o intervalo mínimo', () => {
    expect(nextAutoRequest({ lastChange: 0, lastRequest: 0 })).toBeNull();
    // Primeira mudança: pede depois do tempo de espera.
    expect(nextAutoRequest({ lastChange: T, lastRequest: 0 })).toBe(T + AUTO_DEBOUNCE_MS);
    // Pedido recente: espera completar o intervalo mínimo.
    expect(nextAutoRequest({ lastChange: T, lastRequest: T - 60_000 })).toBe(T - 60_000 + AUTO_MIN_GAP_MS);
    // Nada mudou desde o último pedido.
    expect(nextAutoRequest({ lastChange: T, lastRequest: T + 5 })).toBeNull();
  });

  it('só mudanças que aparecem na tela pedem imagem nova', () => {
    expect(touchesDisplay([{ store: 'weeks', type: 'put', value: { id: 'x' } }])).toBe(true);
    expect(touchesDisplay([{ store: 'meta', type: 'put', value: { key: 'settings', value: {} } }])).toBe(true);
    expect(touchesDisplay([{ store: 'meta', type: 'put', value: { key: 'github', value: {} } }])).toBe(false);
    expect(touchesDisplay([{ store: 'movements', type: 'put', value: {} }])).toBe(false);
  });
});
