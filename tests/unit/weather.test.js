import { describe, expect, it } from 'vitest';
import { forecastUrl, forecastView, formatMm, geocodeUrl, parseGeocode, rainOutlook, weatherInfo } from '../../src/display/weather.js';

// Resposta no formato do Open-Meteo (hourly/daily com horários locais).
function fakeForecast({ probs = {}, codes = {} } = {}) {
  const time = [];
  const temperature_2m = [];
  const precipitation_probability = [];
  const precipitation = [];
  const weather_code = [];
  const is_day = [];
  for (const day of ['2026-11-25', '2026-11-26']) {
    for (let h = 0; h < 24; h++) {
      const t = `${day}T${String(h).padStart(2, '0')}:00`;
      time.push(t);
      temperature_2m.push(20 + (h % 10));
      precipitation_probability.push(probs[t] ?? 0);
      precipitation.push(probs[t] ? 1.2 : 0);
      weather_code.push(codes[t] ?? 2);
      is_day.push(h >= 6 && h < 19 ? 1 : 0);
    }
  }
  return {
    current: { time: '2026-11-25T14:45', temperature_2m: 27.6, apparent_temperature: 30.2, relative_humidity_2m: 61, weather_code: 3, wind_speed_10m: 11.4, is_day: 1 },
    hourly: { time, temperature_2m, precipitation_probability, precipitation, weather_code, is_day },
    daily: {
      time: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'],
      weather_code: [3, 63, 0, 95],
      temperature_2m_max: [31.4, 26, 29, 30],
      temperature_2m_min: [19.2, 18, 17, 20],
      precipitation_probability_max: [80, 90, 5, 70],
      precipitation_sum: [12.34, 20, 0, 3],
      uv_index_max: [9.1, 4, 10, 8],
      sunrise: ['2026-11-25T05:12', '2026-11-26T05:12', '2026-11-27T05:11', '2026-11-28T05:11'],
      sunset: ['2026-11-25T18:40', '2026-11-26T18:41', '2026-11-27T18:41', '2026-11-28T18:42'],
      wind_speed_10m_max: [20, 15, 10, 30],
    },
  };
}

const at = (iso) => new Date(`${iso}:00`); // horário local do navegador

describe('clima: códigos e endereços', () => {
  it('traduz o código de tempo e troca sol por lua à noite', () => {
    expect(weatherInfo(0)).toEqual({ label: 'Céu limpo', icon: 'sun' });
    expect(weatherInfo(0, false).icon).toBe('moon');
    expect(weatherInfo(65).label).toBe('Chuva forte');
    expect(weatherInfo(95).icon).toBe('storm');
    expect(weatherInfo(1234).label).toBe('—');
  });

  it('monta os endereços do Open-Meteo', () => {
    const url = new URL(forecastUrl({ lat: -22.9056, lon: -47.0608 }, 'America/Sao_Paulo'));
    expect(url.host).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('-22.9056');
    expect(url.searchParams.get('timezone')).toBe('America/Sao_Paulo');
    expect(url.searchParams.get('hourly')).toContain('precipitation_probability');
    expect(new URL(geocodeUrl(' Campinas ')).searchParams.get('name')).toBe('Campinas');
  });

  it('lê a busca de cidades', () => {
    const r = parseGeocode({ results: [{ name: 'Campinas', admin1: 'São Paulo', country: 'Brasil', latitude: -22.90556, longitude: -47.06083 }, { name: 'X' }] });
    expect(r).toEqual([{ name: 'Campinas', label: 'Campinas, São Paulo, Brasil', lat: -22.9056, lon: -47.0608 }]);
    expect(parseGeocode({})).toEqual([]);
  });

  it('formata milímetros', () => {
    expect(formatMm(0.44)).toBe('0,4 mm');
    expect(formatMm(12.34)).toBe('12 mm');
    expect(formatMm(null)).toBe('');
  });
});

describe('clima: resumo do card', () => {
  it('começa na hora atual, de hora em hora, com chance de chuva', () => {
    const raw = fakeForecast({ probs: { '2026-11-25T16:00': 40, '2026-11-25T17:00': 70 } });
    const v = forecastView(raw, at('2026-11-25T14:45'), '2026-11-25', { hours: 4, hourStep: 1, days: 3 });
    expect(v.hours.map((h) => h.label)).toEqual(['Agora', '15h', '16h', '17h']);
    expect(v.hours.map((h) => h.prob)).toEqual([0, 0, 40, 70]);
    expect(v.current).toMatchObject({ temp: 28, feels: 30, humidity: 61, desc: 'Nublado' });
  });

  it('pula horas conforme o intervalo escolhido', () => {
    const v = forecastView(fakeForecast(), at('2026-11-25T08:10'), '2026-11-25', { hours: 3, hourStep: '3' });
    expect(v.hours.map((h) => h.label)).toEqual(['Agora', '11h', '14h']);
  });

  it('dias: hoje, amanhã e os próximos', () => {
    const v = forecastView(fakeForecast(), at('2026-11-25T14:45'), '2026-11-25', { days: 3 });
    expect(v.days.map((d) => d.label)).toEqual(['Hoje', 'Amanhã', 'Sex 27']);
    expect(v.days[0]).toMatchObject({ max: 31, min: 19, prob: 80, mm: 12.34, uv: 9, sunrise: '05:12', sunset: '18:40' });
    expect(v.days[1].desc).toBe('Chuva');
    expect(v.today.max).toBe(31);
  });

  it('zero horas ou zero dias escondem as partes', () => {
    const v = forecastView(fakeForecast(), at('2026-11-25T14:45'), '2026-11-25', { hours: 0, days: 0 });
    expect(v.hours).toEqual([]);
    expect(v.days).toEqual([]);
    // O resumo de hoje (máx./mín., UV, sol) continua disponível para o "agora" e os detalhes.
    expect(v.today).toMatchObject({ max: 31, min: 19, uv: 9, sunrise: '05:12' });
  });

  it('imagem gerada antes da hora usa a previsão daquela hora como "agora"', () => {
    const raw = fakeForecast({ codes: { '2026-11-25T18:00': 61 } });
    const v = forecastView(raw, at('2026-11-25T18:00'), '2026-11-25', {});
    expect(v.current.desc).toBe('Chuva fraca');
    expect(v.current.temp).toBe(28); // 20 + (18 % 10)
  });
});

describe('clima: vai chover?', () => {
  const hours = (list) => list.map(([time, prob]) => ({ time, prob, mm: prob ? 1 : 0 }));

  it('avisa a partir de quando a chuva é provável', () => {
    const r = rainOutlook(hours([['2026-11-25T13:00', 10], ['2026-11-25T14:00', 30], ['2026-11-25T15:00', 60], ['2026-11-25T16:00', 85], ['2026-11-25T17:00', 20]]), '2026-11-25');
    expect(r).toMatchObject({ level: 'yes', max: 85, text: 'Chuva provável a partir das 15h (até 85%)', when: 'hoje' });
  });

  it('chance média vira "pode chover"; baixa, "sem chuva"', () => {
    const maybe = rainOutlook(hours([['2026-11-25T13:00', 10], ['2026-11-25T14:00', 35], ['2026-11-25T15:00', 5], ['2026-11-25T16:00', 0]]), '2026-11-25');
    expect(maybe.text).toBe('Pode chover hoje: 35% às 14h');
    const no = rainOutlook(hours([['2026-11-25T13:00', 0], ['2026-11-25T14:00', 10], ['2026-11-25T15:00', 5], ['2026-11-25T16:00', 0]]), '2026-11-25');
    expect(no).toMatchObject({ level: 'no', text: 'Sem chuva prevista hoje' });
  });

  it('no fim do dia olha as próximas horas', () => {
    const r = rainOutlook(hours([['2026-11-25T22:00', 0], ['2026-11-25T23:00', 0], ['2026-11-26T00:00', 70], ['2026-11-26T01:00', 70]]), '2026-11-25');
    expect(r).toMatchObject({ level: 'yes', when: 'nas próximas horas', text: 'Chuva provável a partir das 0h (até 70%)' });
  });

  it('chuva já agora', () => {
    const r = rainOutlook(hours([['2026-11-25T13:00', 90], ['2026-11-25T14:00', 60], ['2026-11-25T15:00', 0], ['2026-11-25T16:00', 0]]), '2026-11-25');
    expect(r.text).toBe('Chuva provável agora (90%)');
  });
});
