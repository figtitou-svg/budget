import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = [0x1f, 0x8a, 0x70];
const RING = [0xff, 0xff, 0xff];
const ACCENT = [0xf2, 0xc1, 0x4e];

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function insideRounded(x, y, size, radius) {
  const qx = Math.min(x, size - x);
  const qy = Math.min(y, size - y);
  if (qx >= radius || qy >= radius) return true;
  return Math.hypot(radius - qx, radius - qy) <= radius;
}

function draw(size, maskable) {
  const out = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const rOut = size * (maskable ? 0.26 : 0.32);
  const rIn = rOut * 0.55;
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!maskable && !insideRounded(px, py, size, size * 0.22)) continue;
          const d = Math.hypot(px - c, py - c);
          let col = BG;
          if (d <= rOut && d >= rIn) {
            const angle = (Math.atan2(py - c, px - c) + Math.PI * 2.5) % (Math.PI * 2);
            col = angle < Math.PI * 0.6 ? ACCENT : RING;
          }
          r += col[0]; g += col[1]; b += col[2]; hits++;
        }
      }
      const i = (y * size + x) * 4;
      if (hits) { out[i] = Math.round(r / hits); out[i + 1] = Math.round(g / hits); out[i + 2] = Math.round(b / hits); }
      out[i + 3] = Math.round((hits / (SS * SS)) * 255);
    }
  }
  return png(size, out);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [name, size, maskable] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), draw(size, maskable));
  console.log(`icons/${name}`);
}
