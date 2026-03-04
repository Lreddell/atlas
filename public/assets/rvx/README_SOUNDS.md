
# Sound Assets Guide

This project supports OGG Vorbis audio files. 
Sounds are referenced by keys in `public/assets/rvx/sounds.json`.

## Directory Structure

Place your audio files in subdirectories matching the paths in `sounds.json`.
Example structure:

public/assets/rvx/sounds/
├── ui/
│   ├── click.ogg
│   ├── chestopen.ogg
│   └── chestclosed.ogg
├── music/
│   ├── menu/
│   │   └── any-name-here.ogg
│   ├── creative/
│   │   └── any-name-here.ogg
│   ├── plains/
│   │   └── any-name-here.ogg
│   └── ...
├── blocks/
│   ├── step/
│   │   ├── grass1.ogg
│   │   ├── stone1.ogg
│   │   └── wood1.ogg
│   ├── dig/
│   │   ├── grass1.ogg
│   │   └── ...
├── player/
│   ├── hurt.ogg
│   └── ...
└── random/
    ├── pop.ogg
    └── ...

## Fallback

If a file is missing or empty, the engine uses a built-in procedural synthesis to generate a placeholder sound (like a click or pop) so the game doesn't crash or go silent.

## Adding New Sounds

1. Add your .ogg file to the `sounds/` folder.
2. Edit `public/assets/rvx/sounds.json` (or let the default manifest handle it if you match the default paths).
3. If adding a new category (e.g. "music"), just specify `"category": "music"` in the JSON definition. The game engine automatically creates a new volume slider for it in the Options menu.

## Music Folder Auto-Discovery

- Music is discovered from folders under `public/assets/rvx/sounds/music/`.
- Event keys map to folders by name (for example `music.plains` -> `music/plains/`, `music.creative` -> `music/creative/`).
- File names are ignored for selection; any `.ogg` file in the folder can be chosen at random.
- You can add unlimited tracks by dropping files into the folder. No music file list needs to be maintained in `sounds.json`.
