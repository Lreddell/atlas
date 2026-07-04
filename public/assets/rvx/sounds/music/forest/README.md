# forest music tag

Drop one or more `.ogg` (or `.mp3`/`.wav`) tracks here. Every biome whose
`tags.json` includes `forest` can play these songs.

Used by: forest, birch_forest, flower_forest, dark_forest, jungle, swamp, cherry_grove.

After adding or removing files, regenerate the index for the web build:

    node scripts/generate_music_index.mjs

(The desktop build scans folders directly.)
