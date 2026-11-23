// PNG de 1 bit (preto e branco) sem dependências: o formato que o reTerminal
// E1001 baixa (ESPHome, image: platform online_image, type: BINARY).
// No PNG de 1 bit em tons de cinza, o bit 1 é branco e o 0 é preto.

import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * Pixels RGBA (como em ImageData) → linhas de bits (1 = branco), 8 pixels por byte.
 * `threshold` (0–255): pixels com luminância a partir dele viram branco.
 * Um valor acima de 128 deixa as letras finas um pouco mais grossas, o que
 * ajuda a leitura na tela e-ink.
 */
export function rgbaToBits(rgba, width, height, threshold = 150) {
  const stride = Math.ceil(width / 8);
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Transparente conta como branco (fundo da tela).
      const a = rgba[i + 3] / 255;
      const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a);
      if (lum >= threshold) out[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/** Linhas de bits (1 = branco) → arquivo PNG de 1 bit em tons de cinza. */
export function encodePng1Bit(width, height, bits) {
  const stride = Math.ceil(width / 8);
  if (bits.length !== stride * height) throw new Error(`esperado ${stride * height} bytes, veio ${bits.length}`);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro "nenhum" em cada linha
    bits.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // 1 bit por pixel
  ihdr[9] = 0; // tons de cinza
  ihdr[10] = 0; // compressão deflate
  ihdr[11] = 0; // filtros padrão
  ihdr[12] = 0; // sem entrelaçamento
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Lê largura e altura do cabeçalho de um PNG (para conferir o que foi gerado). */
export function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIGNATURE) || buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('não é um PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}
