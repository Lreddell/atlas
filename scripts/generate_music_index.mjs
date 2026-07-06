// Regenerates public/assets/rvx/sounds/music-index.json from the music folders.
//
// The web build can't scan the filesystem at runtime, so it reads this static
// index. Run this after adding/removing music files or editing biome tags:
//
//     node scripts/generate_music_index.mjs
//
// Layout:
//   music/<tag>/*.ogg              song folders, each folder is a "music tag"
//   music/biomes/<biome>/tags.json the list of tags active for that biome
//
// Output shape:
//   { "tags":  { "<tag>":  ["assets/.../music/<tag>/<file>", ...] },
//     "biomes":{ "<biome>":["<tag>", ...] } }
//
// Tags with no audio are omitted (an empty tag contributes no songs, so a biome
// transparently uses whichever of its tags actually have files).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const musicDir = path.join(root, 'public/assets/rvx/sounds/music');
const biomesDir = path.join(musicDir, 'biomes');
const indexPath = path.join(root, 'public/assets/rvx/sounds/music-index.json');

const AUDIO_EXT = new Set(['.ogg', '.mp3', '.wav', '.flac', '.m4a', '.opus', '.aac', '.webm']);

// 1. Tags: every folder directly under music/ (except the reserved "biomes"
// config folder) that contains audio files.
const tags = {};
for (const entry of fs.readdirSync(musicDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'biomes') continue;
    const dir = path.join(musicDir, entry.name);
    const files = fs.readdirSync(dir)
        .filter((file) => AUDIO_EXT.has(path.extname(file).toLowerCase()))
        .sort()
        .map((file) => `assets/rvx/sounds/music/${entry.name}/${file}`);
    if (files.length > 0) tags[entry.name] = files;
}

// 2. Biomes: read each biome's tags.json list.
const biomes = {};
if (fs.existsSync(biomesDir)) {
    for (const entry of fs.readdirSync(biomesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const cfg = path.join(biomesDir, entry.name, 'tags.json');
        if (!fs.existsSync(cfg)) continue;
        try {
            const list = JSON.parse(fs.readFileSync(cfg, 'utf8'));
            if (Array.isArray(list)) {
                biomes[entry.name] = list.filter((t) => typeof t === 'string');
            }
        } catch (e) {
            process.stderr.write(`Skipping ${entry.name}/tags.json (invalid JSON): ${e.message}\n`);
        }
    }
}

const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]));
const index = { tags: sortKeys(tags), biomes: sortKeys(biomes) };
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
process.stdout.write(`Wrote music-index.json: ${Object.keys(index.tags).length} tags with audio, ${Object.keys(index.biomes).length} biomes.\n`);
