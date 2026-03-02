
To enable the application icon for Windows builds:

1. Obtain or create an 'icon.ico' file (at least 256x256 pixels).
2. Place it in this 'build' directory.
3. Ensure it is named exactly 'icon.ico'.

The 'package.json' build configuration expects "build/icon.ico".
If this file is missing, the 'npm run electron:build' command may fail.
