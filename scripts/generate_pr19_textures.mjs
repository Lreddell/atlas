import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
    PR19_TEXTURE_ASSETS,
    PR19_TEXTURE_TILES,
    rasterizePixelTile,
} from '../src/systems/textures/pr19TexturePixels.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textureRoot = path.join(root, 'public', 'assets', 'textures');
const checkOnly = process.argv.includes('--check');

const crcTable = Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
});

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, checksum]);
};

const encodePng = (pixels) => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(16, 0);
    header.writeUInt32BE(16, 4);
    header[8] = 8;
    header[9] = 6;

    const scanlines = Buffer.alloc(16 * (1 + 16 * 4));
    for (let y = 0; y < 16; y += 1) {
        const rowOffset = y * (1 + 16 * 4);
        scanlines[rowOffset] = 0;
        Buffer.from(pixels.subarray(y * 16 * 4, (y + 1) * 16 * 4))
            .copy(scanlines, rowOffset + 1);
    }

    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
};

let mismatches = 0;

for (const { slot, path: relativePath } of PR19_TEXTURE_ASSETS) {
    const outputPath = path.join(textureRoot, relativePath);
    const png = encodePng(rasterizePixelTile(PR19_TEXTURE_TILES[slot]));

    if (checkOnly) {
        const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null;
        if (!existing?.equals(png)) {
            process.stderr.write(`Texture is out of date: ${relativePath}\n`);
            mismatches += 1;
        }
        continue;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, png);
    process.stdout.write(`Generated ${relativePath}\n`);
}

if (mismatches > 0) process.exitCode = 1;
