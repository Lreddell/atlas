Drop any number of audio files into this folder.

All files in this folder are eligible for random selection by the `music.death` event key.
File names do not matter.

This music plays on the death screen: the current track fades out quickly, then a
track from this folder plays once. After it ends there is silence until you act. On
respawn or returning to the menu it fades out quickly and the normal music resumes.

NOTE: the desktop (Electron) build scans this folder automatically. For the web
build, also add the file paths to assets/rvx/sounds/music-index.json under a
"death" key (see the other entries there for the format).
