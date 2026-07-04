// Regenerates public/assets/rvx/sounds/music-index.json from the music folders.
//
// The web build can't scan the filesystem at runtime, so it reads this static
// index to know which tracks live in each biome/state music folder. Run this
// after adding or removing music files:
//
//     node scripts/generate_music_index.mjs
//
// Only folders that actually contain audio are listed — an empty folder is
// omitted so the game falls back to its shared pack (see MusicController).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const musicDir = path.join(root, 'public/assets/rvx/sounds/music');
const indexPath = path.join(root, 'public/assets/rvx/sounds/music-index.json');

const AUDIO_EXT = new Set(['.ogg', '.mp3', '.wav', '.flac', '.m4a', '.opus', '.aac', '.webm']);

const index = {};
for (const folder of fs.readdirSync(musicDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const dir = path.join(musicDir, folder.name);
    const tracks = fs.readdirSync(dir)
        .filter((file) => AUDIO_EXT.has(path.extname(file).toLowerCase()))
        .sort()
        .map((file) => `assets/rvx/sounds/music/${folder.name}/${file}`);
    if (tracks.length > 0) index[folder.name] = tracks;
}

const sorted = Object.fromEntries(Object.keys(index).sort().map((key) => [key, index[key]]));
fs.writeFileSync(indexPath, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`Wrote music-index.json with ${Object.keys(sorted).length} music folders.\n`);
