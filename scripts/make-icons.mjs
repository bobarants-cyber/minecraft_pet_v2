// Generates the menu-bar template icon (a little bee) as PNGs without any image library.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePNG(size, alphaAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = raw[i + 1] = raw[i + 2] = 0;
      raw[i + 3] = Math.round(255 * Math.min(1, Math.max(0, alphaAt((x + 0.5) / size, (y + 0.5) / size))));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Signed distance helpers in unit square coordinates; soft edge for anti-aliasing.
const edge = (d, px) => Math.min(1, Math.max(0, 0.5 - d / px));
const roundBox = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

// Blocky bee: body with two stripe cut-outs, square eyes, antennae and flat wings.
function bee(x, y, px) {
  const body = edge(roundBox(x, y, 0.5, 0.62, 0.3, 0.24, 0.05), px);
  const stripe1 = edge(roundBox(x, y, 0.62, 0.62, 0.035, 0.24, 0.0), px);
  const stripe2 = edge(roundBox(x, y, 0.74, 0.62, 0.035, 0.24, 0.0), px);
  const eye = edge(roundBox(x, y, 0.33, 0.58, 0.045, 0.06, 0.0), px);
  const antL = edge(roundBox(x, y, 0.3, 0.3, 0.025, 0.09, 0.02), px);
  const antR = edge(roundBox(x, y, 0.42, 0.3, 0.025, 0.09, 0.02), px);
  const wing = edge(roundBox(x, y, 0.62, 0.3, 0.22, 0.045, 0.04), px);
  return Math.max(body, antL, antR, wing) - Math.max(stripe1, stripe2, eye, 0);
}

fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [['trayTemplate.png', 22], ['trayTemplate@2x.png', 44]]) {
  fs.writeFileSync(path.join(out, name), encodePNG(size, (x, y) => bee(x, y, 1 / size)));
}
console.log('wrote tray icons to', out);
