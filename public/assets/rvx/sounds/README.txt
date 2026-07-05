This folder contains Atlas sound effects and music.

Sound effects use event definitions from `src/systems/sound/soundDefaults.ts`.
`public/assets/rvx/sounds.json` can override those defaults without changing the
runtime source. Keep an effect's relative path stable unless you update its event.

Music folders directly under `music/` are tags. Biome configuration lives in
`music/biomes/<biome>/tags.json`, where each biome lists one or more tags whose
songs it can play. Menu, creative, death, blood moon, and boss music use dedicated
tag folders.

Electron development scans tag folders directly. Browser builds use
`music-index.json`; regenerate it after changing tracks or biome tag files:

  node scripts/generate_music_index.mjs

See `public/assets/rvx/README_SOUNDS.md` for the complete event, category, tag,
reload, and packaging guide.
