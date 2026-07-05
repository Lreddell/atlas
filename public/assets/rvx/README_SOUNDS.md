# Sound Assets Guide

Atlas loads sound event definitions from `public/assets/rvx/sounds.json` and resolves audio files under `public/assets/rvx/sounds/`.

## Directory Structure

Keep file paths aligned with the relative paths used in `sounds.json`.

Example layout:

```text
public/assets/rvx/sounds/
  ui/
    click.ogg
    hover.ogg
    slider.ogg
  random/
    chestopen.ogg
    chestclosed.ogg
    pop.ogg
  step/
    grass1.ogg
    stone1.ogg
    wood1.ogg
  dig/
    grass1.ogg
    stone1.ogg
  liquid/
    swim1.ogg
    lavapop.ogg
   polarity/
     positive.ogg
     negative.ogg
   music/
     menu/
       any-name-here.ogg
     cold/
       any-name-here.ogg
     biomes/
       tundra/
         tags.json
       frozen_ocean/
         tags.json
```

## Missing File Fallback

If a non-music sound file is missing or empty, the engine can synthesize a small fallback effect so the game does not go silent. Music does not use that fallback path; missing music stays silent until a real track is available.

## Adding Sound Effects

1. Add your audio file under `public/assets/rvx/sounds/`.
2. Reference `.ogg` sound effects from `public/assets/rvx/sounds.json` by
   relative path without the extension. For `.mp3` or `.wav` sound effects,
   include the extension in `sounds.json`. Music tracks are discovered with
   their actual filenames.
3. Use an existing category if you want it exposed through the current options menu sliders: `master`, `music`, `ambient`, `blocks`, `player`, `ui`, `hostile`, or `neutral`.

Polarity Boots use `polarity/positive.ogg` and `polarity/negative.ogg`.
Replace either file and run `/sound reload` to invalidate cached sound effects
without restarting the game.

If you add a brand-new category name, the audio runtime can create a bus for it, but the options menu slider list is still hard-coded. Add UI support in `src/components/ui/PauseMenu.tsx` if you want the category to have a visible slider.

## Music Tags and Biomes

- Each folder directly under `public/assets/rvx/sounds/music/` is a music tag.
  For example, files in `music/cold/` belong to the `cold` tag.
- `music/biomes/<biome>/tags.json` lists the tags available in that biome. A
  biome can pool several tags, and several biomes can share one tag.
- When the current song belongs to a tag shared by the next biome, it continues
  playing instead of restarting at the biome border.
- Menu, creative, death, blood moon, and boss contexts use their dedicated tag
  folders outside the biome selection flow.

## Music Discovery

- Music events use `music.<tag>` keys. Built-in definitions live in
  `src/systems/sound/soundDefaults.ts`; `public/assets/rvx/sounds.json` can
  override them.
- Electron development scans tag folders under
  `public/assets/rvx/sounds/music/` at runtime. Packaged Electron builds scan
  `dist/assets/rvx/sounds/music/` after Vite copies public assets.
- Browser playback reads `public/assets/rvx/sounds/music-index.json`, which maps
  tags to tracks and biomes to tags.
- Vite regenerates `music-index.json` when development or production builds
  start and when music files hot-update. You can also run it directly:

  ```bash
  node scripts/generate_music_index.mjs
  ```

- Adding tracks to an existing tag folder is enough for Electron development.
  Rebuild packaged Electron releases so `dist/` contains the files.
- After adding a tag or editing a biome's `tags.json`, regenerate and commit
  `music-index.json` so browser builds receive the same configuration.
- A new tag also needs a matching `music.<tag>` event in the default manifest.
  The generated index discovers files; the event definition controls playback
  settings such as volume and category.
