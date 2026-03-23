Atlas bundles Monocraft from the `Monocraft-ttf/` directory in this folder.

Primary file:
`public/assets/fonts/Monocraft-ttf/Monocraft.ttf`

Additional weights:
`public/assets/fonts/Monocraft-ttf/weights/`

`index.html` loads these local files through `@font-face` declarations. There is no CDN fallback for Monocraft in the current app shell.

If you replace the bundled font files, keep the same paths or update the `@font-face` entries in `index.html` to match.
