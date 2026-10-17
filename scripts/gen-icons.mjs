// 依存なしで PWA 用 PNG アイコン（ティール地に白いピン）を生成する
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const s = size / 512;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x / s, py = y / s;
      // ピン: 中心(256,208) 半径112 の円 + 下向きの三角
      const dx = px - 256, dy = py - 208;
      const inCircle = dx * dx + dy * dy <= 112 * 112;
      const inTail = py >= 208 && py <= 416 && Math.abs(dx) <= ((416 - py) / 208) * 100;
      const inHole = dx * dx + dy * dy <= 40 * 40;
      const white = (inCircle || inTail) && !inHole;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b] = white ? [255, 255, 255] : [15, 118, 110];
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, icon(size));
console.log('icons written');
