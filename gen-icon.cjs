const zlib = require("zlib");
const fs = require("fs");

const S = 512;
const raw = Buffer.alloc((S * 4 + 1) * S);

for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  for (let x = 0; x < S; x++) {
    const off = y * (S * 4 + 1) + 1 + x * 4;
    const cx = S / 2, topY = S * 0.15, botY = S * 0.85;
    const p = (y - topY) / (botY - topY);
    const hw = (botY - topY) * 0.45 * p;
    const inTri = y >= topY && y <= botY && x >= cx - hw && x <= cx + hw;
    raw[off] = inTri ? 0xff : 0x0d;
    raw[off + 1] = inTri ? 0x46 : 0x11;
    raw[off + 2] = inTri ? 0x55 : 0x17;
    raw[off + 3] = 0xff;
  }
}

const compressed = zlib.deflateSync(raw);

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", compressed),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync("app-icon.png", png);
console.log("Created app-icon.png");
