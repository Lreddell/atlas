import * as THREE from 'three';
import { generateAtlasCanvas, publishAtlasCanvas } from '../../utils/textures';
import { TEXTURE_PATHS } from './textureMapping';
import { paintResonantTextureTiles } from './resonantTexturePixels';

class TextureAtlasManager {
    private texture: THREE.Texture | null = null;
    private loadedImages: Record<number, HTMLImageElement> = {};

    public getTexture(): THREE.Texture {
        if (!this.texture) this.init();
        return this.texture!;
    }

    public init() {
        if (this.texture) return;
        const canvas = generateAtlasCanvas({});
        paintResonantTextureTiles(canvas);
        publishAtlasCanvas(canvas);
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.premultiplyAlpha = true;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.texture.generateMipmaps = true;
        this.texture.anisotropy = 16;
        this.texture.flipY = true;
        console.log(`[TextureAtlas] Initialized: ${canvas.width}x${canvas.height}, flipY: ${this.texture.flipY}`);
        this.loadExternalTextures();
    }

    private async loadExternalTextures() {
        const promises = Object.entries(TEXTURE_PATHS).map(async ([slot, filename]) => {
            const slotId = Number(slot);
            const path = `assets/textures/${filename}`;
            try {
                const response = await fetch(path);
                if (!response.ok) return;
                const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
                if (contentType && !contentType.startsWith('image/')) return;
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
                        console.error(`[TextureAtlas] Found file '${path}' but failed to load image data.`);
                        URL.revokeObjectURL(objectUrl);
                        resolve(null);
                    };
                });
            } catch {
                // Optional overrides fall back to deterministic procedural pixels.
            }
        });
        await Promise.all(promises);
        if (Object.keys(this.loadedImages).length > 0) {
            console.log(`[TextureAtlas] Loaded ${Object.keys(this.loadedImages).length} external textures. Rebuilding...`);
            this.rebuild();
        }
    }

    public rebuild() {
        const canvas = generateAtlasCanvas(this.loadedImages);
        paintResonantTextureTiles(canvas);
        publishAtlasCanvas(canvas);
        const tex = this.getTexture();
        tex.image = canvas;
        tex.flipY = true;
        tex.premultiplyAlpha = true;
        tex.needsUpdate = true;
        console.log(`[TextureAtlas] Rebuilt: ${canvas.width}x${canvas.height}`);
    }

    public updateFilters(useMipmaps: boolean) {
        const tex = this.getTexture();
        tex.generateMipmaps = useMipmaps;
        tex.minFilter = useMipmaps ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
        tex.anisotropy = useMipmaps ? 16 : 1;
        tex.needsUpdate = true;
    }
}

export const textureAtlasManager = new TextureAtlasManager();
