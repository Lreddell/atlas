import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const bundle = await build({
  entryPoints: [path.join(root, 'src/systems/textures/resonantEntityTexturePixels.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const pixelsModule = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
};
const encodePng = (rgba, width, height) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const output = y * (1 + width * 4);
    scanlines[output] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(scanlines, output + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const outputDir = path.join(root, 'public/assets/rvx/textures/entities');
fs.mkdirSync(outputDir, { recursive: true });
for (const kind of ['vault_guard', 'vault_marksman', 'bell_hound', 'tollkeeper']) {
  const pixels = pixelsModule.getResonantEntityTexturePixels(kind);
  fs.writeFileSync(
    path.join(outputDir, `${kind}.png`),
    encodePng(pixels, pixelsModule.RESONANT_ENTITY_TEXTURE_WIDTH, pixelsModule.RESONANT_ENTITY_TEXTURE_HEIGHT),
  );
}
fs.writeFileSync(
  path.join(outputDir, 'bell_titan.png'),
  encodePng(
    pixelsModule.getBellTitanTexturePixels(),
    pixelsModule.BELL_TITAN_TEXTURE_WIDTH,
    pixelsModule.BELL_TITAN_TEXTURE_HEIGHT,
  ),
);
