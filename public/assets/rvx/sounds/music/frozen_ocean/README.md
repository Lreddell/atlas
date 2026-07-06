# frozen_ocean music tag

Drop one or more `.ogg` (or `.mp3`/`.wav`) tracks here. Every biome whose
`tags.json` includes `frozen_ocean` can play these songs.

Used by: frozen_ocean.

After adding or removing files, regenerate the index for the web build:

    node scripts/generate_music_index.mjs

(The desktop build scans folders directly.)
