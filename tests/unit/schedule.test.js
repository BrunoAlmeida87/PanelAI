import { describe, expect, it } from 'vitest';
import {
  CHECK_OPTIONS,
  DEFAULT_DISPLAY_DEVICE,
  MAX_TIMES,
  PUBLISH_CODE_LENGTH,
  buildDeviceConfig,
  checkWindows,
  describeUpdate,
  formatTimes,
  inCheckWindow,
  isValidPublishCode,
  newPublishCode,
  nextUpdateTimes,
  normalizeDisplayDevice,
  normalizeTime,
  normalizeTimes,
  publishUrl,
  renderMoment,
  slotImageFile,
  zonedDateISO,
  zonedParts,
  zonedTimeToMs,
} from '../../src/display/schedule.js';

const SP = 'America/Sao_Paulo'; // UTC−3, sem horário de verão
const NY = 'America/New_York'; // com horário de verão
// 24/11/2026 10:00 em São Paulo = 13:00 UTC
const NOW = Date.UTC(2026, 10, 24, 13, 0);
const iso = (ms) => new Date(ms).toISOString();

describe('agenda da tela: validação', () => {
  it('normaliza horários', () => {
    expect(normalizeTime('6:00')).toBe('06:00');
    expect(normalizeTime(' 18:30 ')).toBe('18:30');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime('meio-dia')).toBeNull();
    expect(normalizeTimes(['18:00', '6:00', '06:00', 'x', null])).toEqual(['06:00', '18:00']);
    const many = Array.from({ length: 12 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    expect(normalizeTimes(many)).toHaveLength(MAX_TIMES);
  });

  it('dados antigos ou inválidos viram o padrão, sem perder o que é válido', () => {
    const padrao = { checkMinutes: 10, autoGenerate: true, requestedAt: 0 };
    expect(normalizeDisplayDevice(undefined)).toEqual({ times: ['06:00'], timeZone: SP, code: null, ...padrao });
    expect(normalizeDisplayDevice({ times: [], timeZone: 'Lua/Base', code: 'curto' })).toEqual({ times: [], timeZone: SP, code: null, ...padrao });
    const code = 'A'.repeat(PUBLISH_CODE_LENGTH);
    expect(normalizeDisplayDevice({ times: ['7:15'], timeZone: NY, code })).toEqual({ times: ['07:15'], timeZone: NY, code, ...padrao });
  });

  it('conferência de pedidos, geração automática e último pedido', () => {
    expect(normalizeDisplayDevice({ checkMinutes: 15, autoGenerate: false, requestedAt: 1764000000123.7 })).toMatchObject({
      checkMinutes: 15,
      autoGenerate: false,
      requestedAt: 1764000000123,
    });
    expect(normalizeDisplayDevice({ checkMinutes: 0 }).checkMinutes).toBe(0);
    // Valores fora das opções voltam ao padrão.
    expect(normalizeDisplayDevice({ checkMinutes: 7, autoGenerate: 'sim', requestedAt: -5 })).toMatchObject({ checkMinutes: 10, autoGenerate: true, requestedAt: 0 });
    expect(CHECK_OPTIONS).toContain(normalizeDisplayDevice({}).checkMinutes);
    expect(slotImageFile(1764136800)).toBe('tela-1764136800.png');
  });

  it('o padrão é congelado (não muda por engano)', () => {
    expect(Object.isFrozen(DEFAULT_DISPLAY_DEVICE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_DISPLAY_DEVICE.times)).toBe(true);
    const d = normalizeDisplayDevice(undefined);
    d.times.push('07:00');
    expect(DEFAULT_DISPLAY_DEVICE.times).toEqual(['06:00']);
  });

  it('gera códigos secretos longos, só com letras e números, sem viés', () => {
    const a = newPublishCode();
    const b = newPublishCode();
    expect(a).toHaveLength(PUBLISH_CODE_LENGTH);
    expect(isValidPublishCode(a)).toBe(true);
    expect(a).not.toBe(b);
    // Bytes ≥ 248 são descartados; os demais viram letra/número.
    let call = 0;
    const fake = (n) => (call++ === 0 ? new Uint8Array(n).fill(250) : new Uint8Array(n).fill(0));
    expect(newPublishCode(fake)).toBe('A'.repeat(PUBLISH_CODE_LENGTH));
  });

  it('monta o endereço da imagem a partir do site', () => {
    expect(publishUrl('https://exemplo.github.io/PanelAI/', 'abc')).toBe('https://exemplo.github.io/PanelAI/tela/abc');
    expect(publishUrl('https://exemplo.github.io/PanelAI', 'abc')).toBe('https://exemplo.github.io/PanelAI/tela/abc');
    expect(publishUrl('https://exemplo.github.io/PanelAI/#/ajustes', 'abc')).toBe('https://exemplo.github.io/PanelAI/tela/abc');
  });
});

describe('agenda da tela: fusos', () => {
  it('converte o relógio local do fuso em instante e volta', () => {
    const ms = zonedTimeToMs({ year: 2026, month: 11, day: 24, hour: 6, minute: 0 }, SP);
    expect(iso(ms)).toBe('2026-11-24T09:00:00.000Z');
    expect(zonedParts(ms, SP)).toMatchObject({ year: 2026, month: 11, day: 24, hour: 6, minute: 0 });
    expect(zonedDateISO(Date.UTC(2026, 10, 25, 2, 0), SP)).toBe('2026-11-24'); // 23:00 do dia 24 em SP
  });

  it('acerta o horário de verão (Nova York)', () => {
    // Antes (EDT, UTC−4) e depois (EST, UTC−5) da virada de 1/11/2026.
    expect(iso(zonedTimeToMs({ year: 2026, month: 10, day: 31, hour: 6, minute: 0 }, NY))).toBe('2026-10-31T10:00:00.000Z');
    expect(iso(zonedTimeToMs({ year: 2026, month: 11, day: 2, hour: 6, minute: 0 }, NY))).toBe('2026-11-02T11:00:00.000Z');
    // 02:30 não existe no dia em que o relógio pula (8/3/2026): cai depois do pulo.
    const gap = zonedTimeToMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY);
    expect(zonedParts(gap, NY).hour).toBe(3);
  });
});

describe('agenda da tela: próximas atualizações', () => {
  const device = { times: ['06:00', '18:00'], timeZone: SP };

  it('lista as próximas em ordem, a partir de agora', () => {
    const next = nextUpdateTimes(device, NOW, { limit: 4 }).map(iso);
    expect(next).toEqual(['2026-11-24T21:00:00.000Z', '2026-11-25T09:00:00.000Z', '2026-11-25T21:00:00.000Z', '2026-11-26T09:00:00.000Z']);
  });

  it('um horário exatamente agora já passou', () => {
    const at18 = Date.UTC(2026, 10, 24, 21, 0);
    expect(iso(nextUpdateTimes(device, at18, { limit: 1 })[0])).toBe('2026-11-25T09:00:00.000Z');
  });

  it('sem horários, não há próximas', () => {
    expect(nextUpdateTimes({ times: [] }, NOW)).toEqual([]);
  });

  it('cobre vários dias (o aparelho tem reserva se ficar sem internet)', () => {
    const list = nextUpdateTimes({ times: ['06:00'], timeZone: SP }, NOW);
    expect(list.length).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < list.length; i++) expect(list[i] - list[i - 1]).toBe(86_400_000);
  });

  it('perto de um horário, a imagem é gerada "para" ele (meia-noite mostra o dia novo)', () => {
    const midnight = { times: ['00:00'], timeZone: SP };
    const at2340 = Date.UTC(2026, 10, 25, 2, 40); // 23:40 do dia 24 em SP
    const moment = renderMoment(midnight, at2340);
    expect(zonedDateISO(moment, SP)).toBe('2026-11-25');
    // Longe do próximo horário: vale o relógio de agora.
    expect(renderMoment(midnight, NOW)).toBe(NOW);
    expect(renderMoment({ times: [] }, NOW)).toBe(NOW);
  });

  it('monta o config.json do aparelho (contrato com esphome/panelai-tela.yaml)', () => {
    const pedido = Date.UTC(2026, 10, 24, 12, 30);
    const cfg = buildDeviceConfig({ device: { ...device, requestedAt: pedido }, nowMs: NOW, referenceMs: NOW + 1000, width: 800, height: 480, limit: 3 });
    expect(cfg).toMatchObject({
      versao: 2,
      gerado: NOW / 1000,
      referencia: NOW / 1000 + 1,
      horarios: ['06:00', '18:00'],
      fuso: SP,
      proximas: [Date.UTC(2026, 10, 24, 21) / 1000, Date.UTC(2026, 10, 25, 9) / 1000, Date.UTC(2026, 10, 25, 21) / 1000],
      pedido: pedido / 1000,
      conferir_cada: 600,
      largura: 800,
      altura: 480,
    });
    // Janelas de conferência: hoje (já começou) e os próximos dias, das 6h às 23h em SP.
    expect(cfg.conferir.slice(0, 4)).toEqual([Date.UTC(2026, 10, 24, 9) / 1000, Date.UTC(2026, 10, 25, 2) / 1000, Date.UTC(2026, 10, 25, 9) / 1000, Date.UTC(2026, 10, 26, 2) / 1000]);
    expect(cfg.conferir).toHaveLength(16);
    // Conferência desligada: sem janelas.
    const off = buildDeviceConfig({ device: { ...device, checkMinutes: 0 }, nowMs: NOW, width: 800, height: 480 });
    expect(off.conferir_cada).toBe(0);
    expect(off.conferir).toEqual([]);
  });

  it('janelas de conferência pulam o dia que já terminou', () => {
    // 23:30 em SP: a janela de hoje acabou às 23:00; a primeira é a de amanhã.
    const tarde = Date.UTC(2026, 10, 25, 2, 30);
    const w = checkWindows({ checkMinutes: 10, timeZone: SP }, tarde, { days: 2 });
    expect(w).toEqual([Date.UTC(2026, 10, 25, 9) / 1000, Date.UTC(2026, 10, 26, 2) / 1000]);
  });

  it('sabe se agora a tela está conferindo pedidos', () => {
    const dev = { checkMinutes: 10, timeZone: SP };
    expect(inCheckWindow(dev, NOW)).toBe(true); // 10:00
    expect(inCheckWindow(dev, Date.UTC(2026, 10, 24, 8, 59))).toBe(false); // 05:59
    expect(inCheckWindow(dev, Date.UTC(2026, 10, 24, 9, 0))).toBe(true); // 06:00
    expect(inCheckWindow(dev, Date.UTC(2026, 10, 25, 2, 0))).toBe(false); // 23:00
    expect(inCheckWindow({ ...dev, checkMinutes: 0 }, NOW)).toBe(false);
  });

  it('descreve as próximas para a tela de Configurações', () => {
    expect(describeUpdate(Date.UTC(2026, 10, 24, 21), NOW, SP)).toBe('hoje às 18:00');
    expect(describeUpdate(Date.UTC(2026, 10, 25, 9), NOW, SP)).toBe('amanhã às 06:00');
    expect(describeUpdate(Date.UTC(2026, 10, 23, 8, 47), NOW, SP)).toBe('ontem às 05:47');
    expect(describeUpdate(Date.UTC(2026, 10, 26, 9), NOW, SP)).toBe('qui, 26/11 às 06:00');
    expect(formatTimes(['18:00', '06:00', '12:00'])).toBe('06:00, 12:00 e 18:00');
    expect(formatTimes(['06:00'])).toBe('06:00');
    expect(formatTimes([])).toBe('');
  });
});
