# mesa_bryce: active music tags

`tags.json` lists the music tags that play in the **mesa_bryce** biome:

- `mesa`: songs from `music/mesa/`

Songs live in the tag folders (`public/assets/rvx/sounds/music/<tag>/`), not
here. A biome plays a random song pooled from all of its tags that have files;
empty tags contribute nothing. If a song from a shared tag (e.g. `cold`) is
already playing and you cross into another biome that also has that tag, the
music keeps playing instead of restarting.

Edit `tags.json` to change which tags this biome uses, then run
`node scripts/generate_music_index.mjs`.
