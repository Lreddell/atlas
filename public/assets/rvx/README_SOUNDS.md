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
  music/
    menu/
      any-name-here.ogg
    plains/
      any-name-here.ogg
    caves/
      any-name-here.ogg
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

If you add a brand-new category name, the audio runtime can create a bus for it, but the options menu slider list is still hard-coded. Add UI support in `src/components/ui/PauseMenu.tsx` if you want the category to have a visible slider.

## Music Discovery

- Music events use `music.<folder>` keys in `public/assets/rvx/sounds.json`.
- Electron development scans subfolders under
  `public/assets/rvx/sounds/music/` at runtime. Packaged Electron builds scan
  `dist/assets/rvx/sounds/music/` after the Vite build copies public assets.
- Browser and non-Electron playback fall back to
  `public/assets/rvx/sounds/music-index.json`.
- Vite regenerates `music-index.json` when the dev server starts, when builds
  start, and when files under `public/assets/rvx/sounds/music/` hot-update.
- Adding tracks to an existing folder is enough for Electron development.
  Packaged Electron builds need a rebuild so `dist/` contains the new assets.
- For browser playback, commit the regenerated `music-index.json` if source
  builds need those tracks discoverable before Vite runs.
- If you add a new music folder or context, update `sounds.json` with the
  matching `music.<folder>` event. The generated index covers track discovery;
  the manifest still controls which event names exist.
