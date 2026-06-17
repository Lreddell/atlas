This folder contains Atlas sound assets.
Some effects may still be placeholder files, but the repo also includes real bundled music and gameplay audio.
Keep filenames and relative paths stable unless you also update `public/assets/rvx/sounds.json`.

UI:
- ui/click.ogg, ui/hover.ogg, ui/slider.ogg

Blocks & Interaction:
- random/chestopen.ogg, random/chestclosed.ogg
- random/classic_hurt.ogg, random/pop.ogg
- step/stone1-3.ogg, dig/stone1-2.ogg
- step/grass1-3.ogg, dig/grass1-2.ogg
- step/wood1-3.ogg, dig/wood1-2.ogg
- step/sand1-3.ogg, dig/sand1-2.ogg
- liquid/swim1-2.ogg, liquid/lavapop.ogg

Music:
- Files live in subfolders:
  - music/menu/*.ogg
  - music/creative/*.ogg
  - music/plains/*.ogg
  - music/forest/*.ogg
  - music/desert/*.ogg
  - music/ocean/*.ogg
  - music/cold/*.ogg
  - music/caves/*.ogg
  - music/bloodmoon/*.ogg
  - music/cherry/*.ogg
  - music/mesa/*.ogg
  - music/volcanic/*.ogg
- File names do not matter. Supported audio files in a music folder are eligible
  for random selection.
- Electron development discovers tracks from `public/assets/rvx/sounds/music/`
  automatically. Packaged Electron builds need a rebuild so `dist/` contains
  the new assets.
- Browser and non-Electron playback use `public/assets/rvx/sounds/music-index.json`.
  Vite regenerates that file when the dev server starts, when builds start, and
  when files under the music folder hot-update.
- If you add a new music event or folder, update `public/assets/rvx/sounds.json`
  with the matching `music.<folder>` event. The generated index handles track
  discovery.
