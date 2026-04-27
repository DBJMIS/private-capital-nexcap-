/**
 * Writes opaque PNGs into public/wallpapers/ so CSS background-image
 * shows real pixels (tiny transparent placeholders only reveal backgroundColor).
 * Run: node scripts/generate-wallpaper-placeholders.mjs
 */
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'wallpapers');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 512×512 RGB, vertical gradient top→bottom (opaque). */
function makePng(width, height, rgbTop, rgbBottom) {
  const rowSize = width * 3 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1 || 1);
    const r = Math.round(rgbTop[0] * (1 - t) + rgbBottom[0] * t);
    const g = Math.round(rgbTop[1] * (1 - t) + rgbBottom[1] * t);
    const b = Math.round(rgbTop[2] * (1 - t) + rgbBottom[2] * t);
    const off = y * rowSize;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const i = off + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const files = [
  { name: '05-Orange_LM-4K.png', top: '#f0dcc8', bottom: '#b87333' },
  { name: '02-Green_Blue_LM-4K.png', top: '#c5e6d8', bottom: '#3d7a8c' },
  { name: '01-Purple_LM-4K.png', top: '#dcd4f0', bottom: '#4a2d7a' },
  { name: '04-Pink_Orange_LM-4K.png', top: '#ffd6e0', bottom: '#c94a5a' },
  { name: '03-Blue_Purple_LM-4K.png', top: '#c8d8f5', bottom: '#3a4a9e' },
  { name: '06-Yellow_LM-4K.png', top: '#f5e8c8', bottom: '#a67c28' },
];

await mkdir(outDir, { recursive: true });
const w = 512;
const h = 512;
for (const { name, top, bottom } of files) {
  const buf = makePng(w, h, hexToRgb(top), hexToRgb(bottom));
  const p = join(outDir, name);
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(p);
    ws.on('error', reject);
    ws.on('finish', resolve);
    ws.end(buf);
  });
  console.log('Wrote', p, buf.length, 'bytes');
}
