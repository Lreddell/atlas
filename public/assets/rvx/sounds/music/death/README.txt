Drop any number of audio files into this folder.

All files in this folder are eligible for random selection by the `music.death` event key.
File names do not matter.

This music plays on the death screen: the current track fades out quickly, then a
track from this folder plays once. After it ends there is silence until you act. On
respawn or returning to the menu it fades out quickly and the normal music resumes.

The desktop build scans this folder automatically. For browser builds, regenerate
the music index after changing tracks:

  node scripts/generate_music_index.mjs
