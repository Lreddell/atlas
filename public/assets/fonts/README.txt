Atlas bundles Monocraft from the `Monocraft-ttf/` directory in this folder.

Primary file:
`public/assets/fonts/Monocraft-ttf/Monocraft.ttf`

Additional weights:
`public/assets/fonts/Monocraft-ttf/weights/`

`index.html` loads these local files through `@font-face` declarations. There is no CDN fallback for Monocraft in the current app shell.

If you replace the bundled font files, keep the same paths or update the `@font-face` entries in `index.html` to match.

Monocraft's licence (SIL Open Font License 1.1) is `Monocraft-ttf/OFL.txt`.

The interface font, Pixelify Sans, comes from the `@fontsource/pixelify-sans`
package: `src/index.tsx` imports its CSS and Vite bundles the font files into
the build. Its licence (SIL Open Font License 1.1) is `PixelifySans-OFL.txt`,
which ships with the build from this folder.

`AtlasNumerals-Regular.woff` and `AtlasNumerals-Bold.woff` are Atlas's own
digits, drawn on Pixelify Sans's pixel grid to replace its hard-to-read 5 (and
its curled 2 and 7). `index.html` loads them for U+0030-0039 only, ahead of
Pixelify Sans. Regenerate them with `python scripts/build_atlas_numerals.py`.
