
# Custom Textures

To override the default procedural textures with custom .png files:

1. Place your PNG file in the appropriate subdirectory:
   - `blocks/` for block textures (e.g., `dirt.png`)
   - `items/` for item textures (e.g., `wood_pickaxe.png`)

2. Ensure the filename matches the entry in `systems/textures/textureMapping.ts`.
   By default, the mapping expects files like:
   - blocks/dirt.png
   - blocks/grass_top.png
   - items/stick.png

3. The files should ideally be 16x16 pixels to match the pixel-art style, though the engine will scale them to 16x16 automatically if they are larger.

If a file is missing, the game will fallback to the procedural pixel art generation.
