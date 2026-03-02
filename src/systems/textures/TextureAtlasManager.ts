
import * as THREE from 'three';
import { generateAtlasCanvas } from '../../utils/textures';
import { TEXTURE_PATHS } from './textureMapping';

class TextureAtlasManager {
    private texture: THREE.Texture | null = null;
    private loadedImages: Record<number, HTMLImageElement> = {};

    /**
     * Retrieves the shared texture instance, initializing it if it doesn't exist.
     */
    public getTexture(): THREE.Texture {
        if (!this.texture) {
            this.init();
        }
        return this.texture!;
    }

    /**
     * Initializes the texture using the current atlas generation logic.
     * Triggers async loading of external texture files.
     */
    public init() {
        if (this.texture) return;

        // Start with procedural only (empty map for images)
        const canvas = generateAtlasCanvas({});
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.premultiplyAlpha = true;
        
        // Match the sharp pixel-art style and default mipmapping from the original logic
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.texture.generateMipmaps = true;
        this.texture.anisotropy = 16;
        
        // Critical: UV math assuming top-to-bottom canvas mapping to V=1..0
        this.texture.flipY = true;

        console.log(`[TextureAtlas] Initialized: ${canvas.width}x${canvas.height}, flipY: ${this.texture.flipY}`);
        
        // Start loading external files
        this.loadExternalTextures();
    }

    private async loadExternalTextures() {
        const promises = Object.entries(TEXTURE_PATHS).map(async ([slot, filename]) => {
            const slotId = Number(slot);
            const path = `assets/textures/${filename}`;
            
            try {
                // 1. Attempt to fetch to check existence and validity
                const response = await fetch(path);
                
                if (!response.ok) {
                    // 404 or other error - File likely missing, fallback to procedural
                    return;
                }

                // 2. File found (200 OK), attempt to process as image
                const blob = await response.blob();
                
                if (blob.size === 0) {
                    console.error(`[TextureAtlas] Found file '${path}' but it is empty (0 bytes).`);
                    return;
                }

                const objectUrl = URL.createObjectURL(blob);
                const img = new Image();
                img.src = objectUrl;

                await new Promise((resolve) => {
                    img.onload = () => {
                        this.loadedImages[slotId] = img;
                        URL.revokeObjectURL(objectUrl);
                        resolve(img);
                    };
                    img.onerror = () => {
                        console.error(`[TextureAtlas] Found file '${path}' but failed to load image data. Is it a valid PNG?`);
                        URL.revokeObjectURL(objectUrl);
                        resolve(null);
                    };
                });

            } catch (e) {
                // Network error or other fetch issue
                // console.debug(`[TextureAtlas] Check failed for ${path}`, e);
            }
        });

        await Promise.all(promises);
        
        // If we loaded any images, rebuild the atlas
        if (Object.keys(this.loadedImages).length > 0) {
            console.log(`[TextureAtlas] Loaded ${Object.keys(this.loadedImages).length} external textures. Rebuilding...`);
            this.rebuild();
        }
    }

    /**
     * Rebuilds the texture image data without replacing the texture object itself.
     * This allows all materials using this texture to stay in sync.
     */
    public rebuild() {
        // Pass the loaded images to the generator
        const canvas = generateAtlasCanvas(this.loadedImages);
        const tex = this.getTexture();
        tex.image = canvas;
        tex.flipY = true; // Ensure flipY persists or is reset correctly
        tex.premultiplyAlpha = true;
        tex.needsUpdate = true;
        
        console.log(`[TextureAtlas] Rebuilt: ${canvas.width}x${canvas.height}`);
    }

    /**
     * Updates the filtering settings of the shared texture.
     */
    public updateFilters(useMipmaps: boolean) {
        const tex = this.getTexture();
        
        tex.generateMipmaps = useMipmaps;
        tex.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
        tex.anisotropy = useMipmaps ? 16 : 1;
        tex.needsUpdate = true;
    }
}

export const textureAtlasManager = new TextureAtlasManager();
