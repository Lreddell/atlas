# mesa_bryce music

Drop one or more `.ogg` (or `.mp3`/`.wav`) tracks in this folder to give the
**mesa_bryce** biome its own music.

Until this folder has a track, the game automatically falls back to the
**plains** music pack, so the biome is never silent.

After adding files for the web build, regenerate the music index:

    node scripts/generate_music_index.mjs

(The Electron/desktop build scans folders directly and needs no regeneration.)
