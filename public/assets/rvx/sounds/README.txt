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
- File names do not matter. Any .ogg files in a folder are eligible for random selection.
- Electron discovers tracks from these folders automatically.
- The web build uses `public/assets/rvx/sounds/music-index.json`, so add new tracks there if you want them available outside Electron.
- If you add a new music event or folder, update `public/assets/rvx/sounds.json` too.
