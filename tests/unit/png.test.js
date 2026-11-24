import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng1Bit, pngSize, rgbaToBits } from '../../scripts/lib/png.mjs';

/** Imagem RGBA de teste: cada pixel é [r, g, b, a]. */
const rgbaOf = (pixels) => Buffer.from(pixels.flat());
const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const GRAY = [128, 128, 128, 255];
const CLEAR = [0, 0, 0, 0];

/** Lê os blocos do PNG: [{ type, data, crcOk }]. */
function chunks(png) {
  const out = [];
  for (let p = 8; p < png.length; ) {
    const len = png.readUInt32BE(p);
    const type = png.toString('ascii', p + 4, p + 8);
    const data = png.subarray(p + 8, p + 8 + len);
    const crcOk = png.readUInt32BE(p + 8 + len) === crc32(png.subarray(p + 4, p + 8 + len));
    out.push({ type, data, crcOk });
    p += 12 + len;
  }
  return out;
}

describe('PNG de 1 bit (imagem da tela e-ink)', () => {
  it('CRC-32 igual ao do padrão PNG', () => {
    expect(crc32(Buffer.from('IEND'))).toBe(0xae426082);
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('converte pixels em bits: claro = 1 (branco), escuro = 0 (preto), transparente = branco', () => {
    // 9 pixels numa linha: o 9º cai no segundo byte.
    const row = [BLACK, WHITE, BLACK, WHITE, GRAY, CLEAR, BLACK, BLACK, WHITE];
    const bits = rgbaToBits(rgbaOf(row), 9, 1, 150);
    expect([...bits]).toEqual([0b01010100, 0b10000000]);
    // Com limiar baixo, o cinza médio vira branco.
    expect([...rgbaToBits(rgbaOf(row), 9, 1, 100)]).toEqual([0b01011100, 0b10000000]);
  });

  it('gera um PNG válido: cabeçalho, blocos com CRC certo e linhas descomprimidas', () => {
    const pixels = [WHITE, BLACK, BLACK, WHITE, BLACK, WHITE, WHITE, BLACK, BLACK, BLACK];
    const bits = rgbaToBits(rgbaOf(pixels), 5, 2);
    const png = encodePng1Bit(5, 2, bits);
    expect(pngSize(png)).toEqual({ width: 5, height: 2, bitDepth: 1, colorType: 0 });
    const list = chunks(png);
    expect(list.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(list.every((c) => c.crcOk)).toBe(true);
    // Cada linha: byte de filtro (0) + 1 byte de pixels.
    expect([...inflateSync(list[1].data)]).toEqual([0, 0b10010000, 0, 0b11000000]);
  });

  it('recusa dados do tamanho errado e arquivos que não são PNG', () => {
    expect(() => encodePng1Bit(16, 2, Buffer.alloc(3))).toThrow();
    expect(() => pngSize(Buffer.from('não sou um png, sou um texto qualquer'))).toThrow();
  });

  it('a tela inteira (800 × 480) fica pequena (bom para a bateria)', () => {
    const w = 800;
    const h = 480;
    const rgba = Buffer.alloc(w * h * 4, 255);
    for (let x = 0; x < w; x++) rgba.fill(0, (40 * w + x) * 4, (40 * w + x) * 4 + 3); // uma linha preta
    const png = encodePng1Bit(w, h, rgbaToBits(rgba, w, h));
    expect(pngSize(png)).toMatchObject({ width: 800, height: 480 });
    expect(png.length).toBeLessThan(2000);
  });
});
