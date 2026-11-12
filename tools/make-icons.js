// Gera os ícones PNG do app (Android exige PNG para instalar na tela inicial).
// Desenha o mesmo ícone do icon.svg com Node puro, sem bibliotecas. Uso: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
const roundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};
const circle = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

// Desenho em coordenadas 0..64 (mesmas do icon.svg)
const SHAPES = [
  [roundRect(4, 6, 56, 52, 10), '#2A2D34'],
  [roundRect(15, 12, 34, 20, 5), '#C5CAE0'],
  [roundRect(17, 14, 30, 16, 3), '#07090D'],
  [roundRect(20, 17, 5, 4, 1), '#EF6B73'],
  [roundRect(27, 17, 5, 4, 1), '#7ED6A2'],
  [roundRect(34, 17, 5, 4, 1), '#45C4DC'],
  [roundRect(20, 23, 19, 4, 1), '#ECEDF3'],
  [circle(18, 45, 7), '#C9CCD3'],
  [circle(18, 45, 3.5), '#F3F4F7'],
  [circle(46, 45, 7), '#C9CCD3'],
  [circle(46, 45, 3.5), '#F3F4F7'],
].map(([fn, c]) => [fn, hex(c)]);

function render(size, { background = null, scale = 1 } = {}) {
  const ss = 4; // supersampling para bordas suaves
  const px = Buffer.alloc(size * size * 4);
  const unit = (64 / size) / scale;
  const offset = 32 - 32 / scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) * unit + offset;
          const v = (y + (sy + 0.5) / ss) * unit + offset;
          let col = background ? hex(background) : null;
          for (const [fn, c] of SHAPES) if (fn(u, v)) col = c;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      px[i] = alpha ? Math.round(r / (a / 255)) : 0;
      px[i + 1] = alpha ? Math.round(g / (a / 255)) : 0;
      px[i + 2] = alpha ? Math.round(b / (a / 255)) : 0;
      px[i + 3] = Math.round(alpha);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512));
// "maskable": fundo cheio e desenho menor, para o Android recortar em círculo ou gota sem cortar o pedal
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, { background: '#1C1E23', scale: 0.72 }));
console.log('Ícones gerados em public/.');
