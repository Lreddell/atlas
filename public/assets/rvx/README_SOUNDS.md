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
2. Reference it from `public/assets/rvx/sounds.json` by relative path without the extension.
3. Use an existing category if you want it exposed through the current options menu sliders: `master`, `music`, `ambient`, `blocks`, `player`, `ui`, `hostile`, or `neutral`.

If you add a brand-new category name, the audio runtime can create a bus for it, but the options menu slider list is still hard-coded. Add UI support in `src/components/ui/PauseMenu.tsx` if you want the category to have a visible slider.

## Music Discovery

- Music events use `music.<folder>` keys in `public/assets/rvx/sounds.json`.
- Electron scans subfolders under `public/assets/rvx/sounds/music/` at runtime.
- The web build falls back to `public/assets/rvx/sounds/music-index.json`.
- Adding tracks to an existing folder is enough for Electron.
- For browser playback, keep `music-index.json` in sync with any tracks you want discoverable.
- If you add a new music folder or event, update both `sounds.json` and `music-index.json`.
