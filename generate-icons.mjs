import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, "Valorant-Thing.png");
const OUT = join(__dirname, "src-tauri", "icons");

const pngs = [
  { name: "32x32.png", size: 32 },
  { name: "64x64.png", size: 64 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "icon.png", size: 512 },
  { name: "Square30x30Logo.png", size: 30 },
  { name: "Square44x44Logo.png", size: 44 },
  { name: "Square71x71Logo.png", size: 71 },
  { name: "Square89x89Logo.png", size: 89 },
  { name: "Square107x107Logo.png", size: 107 },
  { name: "Square142x142Logo.png", size: 142 },
  { name: "Square150x150Logo.png", size: 150 },
  { name: "Square284x284Logo.png", size: 284 },
  { name: "Square310x310Logo.png", size: 310 },
  { name: "StoreLogo.png", size: 50 },
];

async function generatePngs() {
  for (const { name, size } of pngs) {
    await sharp(SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(join(OUT, name));
    console.log(`✓ ${name} (${size}x${size})`);
  }
}

async function generateIco() {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(SOURCE)
        .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const icoBuffer = createIco(buffers, sizes);
  writeFileSync(join(OUT, "icon.ico"), icoBuffer);
  console.log(`✓ icon.ico (${sizes.join(", ")})`);
}

function createIco(pngBuffers, sizes) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = dataOffset;

  for (let i = 0; i < count; i++) {
    const entry = Buffer.alloc(entrySize);
    const s = sizes[i] >= 256 ? 0 : sizes[i];
    entry.writeUInt8(s, 0);
    entry.writeUInt8(s, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngBuffers[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += pngBuffers[i].length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

async function generateIcns() {
  const iconTypes = [
    { type: "ic07", size: 128 },
    { type: "ic08", size: 256 },
    { type: "ic09", size: 512 },
    { type: "ic10", size: 1024 },
    { type: "ic11", size: 32 },
    { type: "ic12", size: 64 },
    { type: "ic13", size: 256 },
    { type: "ic14", size: 512 },
  ];

  const entries = [];
  for (const { type, size } of iconTypes) {
    const buf = await sharp(SOURCE)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const typeBuffer = Buffer.from(type, "ascii");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32BE(buf.length + 8, 0);
    entries.push(Buffer.concat([typeBuffer, lengthBuffer, buf]));
  }

  const body = Buffer.concat(entries);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(body.length + 8, 4);

  writeFileSync(join(OUT, "icon.icns"), Buffer.concat([header, body]));
  console.log(`✓ icon.icns`);
}

async function generateNsisBmps() {
  const bmps = [
    { name: "nsis-header.bmp", w: 150, h: 57 },
    { name: "nsis-sidebar.bmp", w: 164, h: 314 },
  ];

  for (const { name, w, h } of bmps) {
    const iconSize = Math.min(w, h) - 4;
    const icon = await sharp(SOURCE)
      .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
    })
      .composite([{ input: icon, gravity: "center" }])
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .toFormat("png")
      .toFile(join(OUT, name.replace(".bmp", ".png")));

    const pngBuf = await sharp(join(OUT, name.replace(".bmp", ".png")))
      .raw()
      .toBuffer({ resolveWithObject: true });

    const bmpBuf = createBmp(pngBuf.data, pngBuf.info.width, pngBuf.info.height, pngBuf.info.channels);
    writeFileSync(join(OUT, name), bmpBuf);
    console.log(`✓ ${name} (${w}x${h})`);
  }
}

function createBmp(rawPixels, width, height, channels) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buf = Buffer.alloc(fileSize);

  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelDataSize, 34);

  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * channels;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const si = srcRow + x * channels;
      const di = dstRow + x * 3;
      buf[di] = rawPixels[si + 2];
      buf[di + 1] = rawPixels[si + 1];
      buf[di + 2] = rawPixels[si];
    }
  }
  return buf;
}

async function main() {
  console.log(`Source: ${SOURCE}`);
  console.log(`Output: ${OUT}\n`);

  await generatePngs();
  await generateIco();
  await generateIcns();
  await generateNsisBmps();

  console.log("\nDone! All icons generated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
