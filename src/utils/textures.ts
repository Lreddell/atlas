
import * as THREE from 'three';
import { ATLAS_COLS, getTextureRows } from '../data/blocks';

// Constants for UV mapping
export const ATLAS_RAW_TILE_SIZE = 16;
export const ATLAS_PADDING = 8;
export const ATLAS_STRIDE = ATLAS_RAW_TILE_SIZE + ATLAS_PADDING * 2; // 32px

let cachedAtlasDimensions = { width: 128, height: 128 };
let cachedAtlasURL: string | null = null;
let cachedDirtBG: string | null = null;

export const getAtlasURL = () => cachedAtlasURL;

export const getAtlasDimensions = () => {
    // If running in a worker or before atlas generation, calculate theoretical dimensions
    // We now use exact dimensions without PoT padding to prevent sampling issues
    if (!cachedAtlasURL) {
        const rows = getTextureRows();
        const width = ATLAS_COLS * ATLAS_STRIDE;
        const height = rows * ATLAS_STRIDE;
        return { width, height };
    }
    return cachedAtlasDimensions;
};

// ... celestial textures ...
export const createSunTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if(!ctx) return null;
    
    // Vibrant Yellow Core
    ctx.fillStyle = '#FFF59D'; 
    ctx.fillRect(0,0,64,64);
    
    // Stronger Border
    ctx.fillStyle = '#FBC02D'; 
    ctx.fillRect(0,0,64,4); ctx.fillRect(0,60,64,4);
    ctx.fillRect(0,0,4,64); ctx.fillRect(60,0,4,64);
    
    // Subtle inner detail
    ctx.fillStyle = '#FFEE58';
    ctx.fillRect(12, 12, 12, 12); ctx.fillRect(40, 36, 12, 12);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
};

export const createGlowTexture = (color: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if(!ctx) return null;
    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 60);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,128,128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    return texture;
};

export const createMoonPhaseTexture = (phaseIndex: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if(!ctx) return null;
    ctx.clearRect(0,0,64,64);
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(4, 4, 56, 56);
    ctx.fillStyle = '#9E9E9E'; 
    ctx.fillRect(14, 14, 12, 8);
    ctx.fillRect(35, 40, 14, 14);
    ctx.fillRect(40, 10, 8, 8);
    ctx.fillStyle = 'rgba(5, 5, 16, 0.95)'; 
    if (phaseIndex === 0) ctx.fillRect(0,0,64,64);
    else if (phaseIndex === 1) ctx.fillRect(0, 0, 48, 64);
    else if (phaseIndex === 2) ctx.fillRect(0, 0, 32, 64);
    else if (phaseIndex === 3) ctx.fillRect(0, 0, 16, 64);
    else if (phaseIndex === 5) ctx.fillRect(48, 0, 16, 64);
    else if (phaseIndex === 6) ctx.fillRect(32, 0, 32, 64);
    else if (phaseIndex === 7) ctx.fillRect(16, 0, 48, 64);
    ctx.fillStyle = '#BDBDBD'; 
    ctx.fillRect(4,4,56,4); ctx.fillRect(4,56,56,4);
    ctx.fillRect(4,4,4,56); ctx.fillRect(56,4,4,56);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    return texture;
};

// Generate a dark dirt texture for UI background
export const getDirtBackground = () => {
    if (cachedDirtBG) return cachedDirtBG;
    
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Draw Dirt Base (Darkened)
    ctx.fillStyle = '#1a110d'; // Very dark brown
    ctx.fillRect(0, 0, 64, 64);
    
    // Noise
    for (let i = 0; i < 60; i++) {
        const x = Math.floor(Math.random() * 64);
        const y = Math.floor(Math.random() * 64);
        const w = Math.random() * 4 + 2;
        const h = Math.random() * 4 + 2;
        ctx.fillStyle = Math.random() > 0.5 ? '#2d1e17' : '#0e0806';
        ctx.fillRect(x, y, w, h);
    }
    
    // Vignette / Shadow Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 64, 64);

    cachedDirtBG = canvas.toDataURL();
    return cachedDirtBG;
};

/**
 * Procedurally generates the 16x16-based texture atlas and returns a padded canvas.
 * Accepts optional externalImages map to override procedural generation.
 */
export const generateAtlasCanvas = (externalImages: Record<number, HTMLImageElement> = {}): HTMLCanvasElement => {
    // 1. Generate Raw Atlas (tightly packed 16x16)
    const rawCanvas = document.createElement('canvas');
    const size = 16;
    const cols = ATLAS_COLS; 
    const rows = getTextureRows(); 
    rawCanvas.width = size * cols;
    rawCanvas.height = size * rows;
    const ctx = rawCanvas.getContext('2d');
    
    if (!ctx) return document.createElement('canvas');

    // Hard guarantee no bleed: disable smoothing and use integer-only drawing where possible
    ctx.imageSmoothingEnabled = false;

    /**
     * TILE WRAPPER
     * Computes position, sets translation, and clips to exactly 16x16.
     * Clears the tile area first to ensure no pixel garbage is left behind.
     * Checks for external image override.
     */
    const withTile = (idx: number, fn: () => void) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const ox = col * size;
        const oy = row * size;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.beginPath();
        ctx.rect(0, 0, size, size);
        ctx.clip();
        ctx.clearRect(0, 0, size, size); // Reset tile to fully transparent
        
        if (externalImages[idx]) {
            // Draw external image if available
            ctx.drawImage(externalImages[idx], 0, 0, size, size);
        } else {
            // Fallback to procedural
            fn();
        }
        
        ctx.restore();
    };

    const fill = (color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, size, size);
    };

    const noise = (opacity: number = 0.1, density: number = 1.0) => {
        for(let py = 0; py < size; py++) {
            for(let px = 0; px < size; px++) {
                if(Math.random() > density) continue;
                const val = Math.random();
                ctx.fillStyle = val > 0.5 ? `rgba(255, 255, 255, ${opacity})` : `rgba(0, 0, 0, ${opacity / 2})`;
                ctx.fillRect(px, py, 1, 1);
            }
        }
    };

    const drawPixel = (dx:number, dy:number) => {
        ctx.fillRect(dx, dy, 1, 1);
    };

    const drawTool = (headColor: string, stickColor: string, type: 'pick' | 'axe' | 'shovel' | 'sword' | 'hoe') => {
        ctx.fillStyle = stickColor;
        
        let stickPixels: number[][] = [];
        if (type === 'sword') {
            stickPixels = [[4,11],[5,10],[6,9]]; 
        } else {
            stickPixels = [[4,12],[5,11],[6,10],[7,9],[8,8],[9,7],[10,6]];
        }
        
        stickPixels.forEach(([px, py]) => drawPixel(px,py));
        
        ctx.fillStyle = headColor;
        
        if (type === 'pick') {
            const headPixels = [[7,2],[8,2],[9,2],[10,3],[11,4],[12,5],[13,6],[6,3],[5,4],[4,5],[3,6],[8,5],[9,4],[10,5]];
            headPixels.forEach(([px, py]) => drawPixel(px,py));
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            [[8,2],[9,2],[10,3]].forEach(([px, py]) => drawPixel(px,py));
        } else if (type === 'axe') {
            const headPixels = [[7,4],[7,5],[7,6],[8,3],[9,3],[10,3],[8,4],[9,4],[10,4],[8,5],[9,5],[10,5],[8,6],[9,6],[10,6],[8,7],[9,7],[11,4],[11,5],[11,6]];
            headPixels.forEach(([px, py]) => drawPixel(px,py));
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            [[8,4],[9,4]].forEach(([px, py]) => drawPixel(px,py));
        } else if (type === 'shovel') {
             const headPixels = [[10,5],[11,6],[12,7],[9,6],[10,7],[11,8],[8,7],[9,8],[10,9],[11,5],[10,6]];
             headPixels.forEach(([px, py]) => drawPixel(px,py));
        } else if (type === 'hoe') {
             const headPixels = [[7,2],[8,2],[9,2],[10,3],[11,4],[12,5],[11,6],[11,7],[11,8]];
             headPixels.forEach(([px, py]) => drawPixel(px,py));
             ctx.fillStyle = 'rgba(255,255,255,0.4)';
             [[8,2],[9,2],[10,3]].forEach(([px, py]) => drawPixel(px,py));
        } else if (type === 'sword') {
             ctx.fillStyle = stickColor;
             [[4,11],[5,10]].forEach(([px, py]) => drawPixel(px,py));
             ctx.fillStyle = headColor; 
             [[6,9],[7,8],[8,7]].forEach(([px, py]) => drawPixel(px,py)); 
             for(let i=0; i<6; i++) {
                 drawPixel(7+i, 8-i);
                 drawPixel(8+i, 9-i);
                 drawPixel(9+i, 8-i);
             }
             ctx.fillStyle = 'rgba(255,255,255,0.4)';
             for(let i=1; i<5; i++) drawPixel(8+i, 8-i);
        }
    };

    // 0: Dirt
    withTile(0, () => { fill('#5d4037'); noise(0.2); });
    
    // 1: Grass Top
    withTile(1, () => {
        fill('#4caf50'); // Solid green base
        ctx.fillStyle = '#43a047';
        for(let i=0; i<30; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
        ctx.fillStyle = '#81c784';
        for(let i=0; i<20; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    });

    // 2: Stone
    withTile(2, () => { fill('#9e9e9e'); noise(0.15); });

    // 4: Leaves
    withTile(4, () => {
        // Transparent base for cutout leaves
        ctx.fillStyle = '#388e3c';
        for(let py=0; py<16; py++) for(let px=0; px<16; px++) if(Math.random() < 0.85) ctx.fillRect(px, py, 1, 1);
        noise(0.2);
    });

    // 5: Sand
    withTile(5, () => { fill('#fff9c4'); noise(0.2); });

    // 6: Bedrock
    withTile(6, () => { fill('#424242'); noise(0.4); });

    // 7: Log Side
    withTile(7, () => {
        fill('#5d4037'); // Medium brown base
        ctx.fillStyle = '#3e2723'; // Dark brown bark stripes
        ctx.fillRect(3, 0, 2, 16); ctx.fillRect(11, 0, 2, 16);
        noise(0.1);
    });

    // 8: Planks
    withTile(8, () => {
        fill('#a1887f'); // Base plank color
        ctx.fillStyle = '#6d4c41'; // Dark grain/seams
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 4, 16, 1);
        ctx.fillRect(0, 8, 16, 1); ctx.fillRect(0, 12, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(6, 0, 1, 4); ctx.fillRect(12, 5, 1, 3);
        ctx.fillRect(4, 9, 1, 3); ctx.fillRect(10, 13, 1, 3);
        noise(0.1);
    });

    // 27: Spruce Planks
    withTile(27, () => {
        fill('#5d4037'); // Darker spruce base
        ctx.fillStyle = '#4e342e';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 4, 16, 1);
        ctx.fillRect(0, 8, 16, 1); ctx.fillRect(0, 12, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(6, 0, 1, 4); ctx.fillRect(12, 5, 1, 3);
        ctx.fillRect(4, 9, 1, 3); ctx.fillRect(10, 13, 1, 3);
        noise(0.1);
    });

    // 9: Brick
    withTile(9, () => {
        fill('#b71c1c'); // Red brick base
        ctx.fillStyle = '#e0e0e0'; // Mortar lines
        ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 9, 16, 1); ctx.fillRect(0, 14, 16, 1);
        ctx.fillRect(5, 0, 1, 4); ctx.fillRect(13, 0, 1, 4);
        ctx.fillRect(2, 5, 1, 4); ctx.fillRect(10, 5, 1, 4);
        ctx.fillRect(6, 10, 1, 4); ctx.fillRect(14, 10, 1, 4);
        noise(0.05);
    });

    // 10: Cobblestone
    withTile(10, () => {
        fill('#757575'); noise(0.2);
        ctx.fillStyle = '#424242'; 
        ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 10, 16, 1); ctx.fillRect(5, 2, 4, 1);
    });

    // 11: Glass
    withTile(11, () => {
        fill('rgba(200, 240, 255, 0.2)');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(3, 3, 1, 2); ctx.fillRect(4, 4, 1, 2); ctx.fillRect(10, 11, 2, 1);
    });

    // 12: Grass Side
    withTile(12, () => {
        fill('#5d4037'); // Dirt base
        ctx.fillStyle = '#66bb6a'; ctx.fillRect(0, 0, 16, 4); 
        for(let i=0; i<16; i++) ctx.fillRect(i, 4, 1, Math.floor(Math.random()*4));
        noise(0.1);
    });

    // 13: Log Top
    withTile(13, () => {
        fill('#c9ad88'); noise(0.1);
        ctx.strokeStyle = '#5d4037'; ctx.strokeRect(2.5, 2.5, 11, 11);
    });

    // 14: Water
    withTile(14, () => { fill('#29b6f6'); noise(0.15); });

    // 15: Coal Ore
    withTile(15, () => {
        fill('#9e9e9e'); noise(0.15); 
        ctx.fillStyle = '#212121'; 
        [[4,4],[5,4],[4,5],[10,10],[11,10],[10,11],[12,5],[6,12]].forEach(([ox, oy]) => ctx.fillRect(ox, oy, 2, 2));
    });

    // 16: Iron Ore
    withTile(16, () => {
        fill('#9e9e9e'); noise(0.15); 
        ctx.fillStyle = '#d7ccc8'; 
        [[3,6],[4,6],[4,5],[8,10],[9,10],[8,11],[12,3],[5,13]].forEach(([ox, oy]) => ctx.fillRect(ox, oy, 2, 2));
    });

    // 58: Copper Ore
    withTile(58, () => {
        fill('#9e9e9e'); noise(0.15); 
        ctx.fillStyle = '#e67e22'; 
        [[2,5],[3,6],[3,5],[9,11],[10,11],[9,12],[11,4],[6,13]].forEach(([ox, oy]) => ctx.fillRect(ox, oy, 2, 2));
    });

    // 26: Obsidian
    withTile(26, () => {
        fill('#2e203c'); 
        ctx.fillStyle = '#4b3660'; 
        for(let i=0; i<40; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
        ctx.fillStyle = '#1a1224'; 
        for(let i=0; i<20; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    });

    // 18: Sandstone Side
    withTile(18, () => {
        fill('#e6c27e'); // Solid sandstone base
        ctx.fillStyle = '#dcc082'; ctx.fillRect(0, 0, 16, 4); ctx.fillRect(0, 8, 16, 3);
        ctx.fillStyle = '#c5a76e'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1);
        noise(0.1);
    });

    // 28: Sandstone Top
    withTile(28, () => {
        fill('#e6c27e'); // Solid sandstone base
        ctx.fillStyle = '#dcc082';
        ctx.fillRect(2, 2, 4, 4); ctx.fillRect(10, 10, 4, 4);
        ctx.fillRect(2, 10, 4, 4); ctx.fillRect(10, 2, 4, 4);
        noise(0.15);
    });

    // 19: Snow Block
    withTile(19, () => { fill('#ffffff'); ctx.fillStyle = '#f0faff'; noise(0.05); });

    // 20: Ice
    withTile(20, () => {
        fill('rgba(144, 202, 249, 0.6)');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(2, 2, 4, 1); ctx.fillRect(10, 8, 5, 1); ctx.fillRect(5, 12, 2, 1);
    });

    // 21: Cactus Side
    withTile(21, () => {
        fill('#2e7d32'); // Base green
        ctx.fillStyle = '#1b5e20'; // Dark vertical ribs
        ctx.fillRect(2, 0, 2, 16); ctx.fillRect(7, 0, 2, 16); ctx.fillRect(12, 0, 2, 16);
        ctx.fillStyle = '#000000'; // Spines
        [[1,4], [13, 6], [6, 10], [2, 12]].forEach(([sx, sy]) => ctx.fillRect(sx, sy, 1, 1));
        noise(0.1);
    });

    // 123: Cactus Top
    withTile(123, () => {
        fill('#2e7d32');
        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(0, 0, 16, 16);

        ctx.fillStyle = '#256b2a';
        [
            [1, 1, 3, 2], [6, 2, 2, 2], [10, 1, 3, 3],
            [3, 5, 4, 3], [9, 6, 3, 2], [12, 4, 2, 4],
            [1, 9, 3, 3], [6, 10, 4, 2], [11, 10, 3, 3],
            [4, 13, 3, 2], [9, 13, 2, 2]
        ].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));

        ctx.fillStyle = '#1f5f25';
        [
            [2, 3, 2, 2], [8, 4, 2, 3], [5, 8, 2, 2], [12, 9, 2, 2], [7, 12, 2, 2]
        ].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));

        ctx.fillStyle = '#000000';
        [[1,4], [13,6], [6,2], [10,12], [3,9], [8,5], [12,11]].forEach(([sx, sy]) => ctx.fillRect(sx, sy, 1, 1));
        noise(0.06, 0.55);
    });

    // 124: Cactus Bottom (lime green)
    withTile(124, () => {
        fill('#7cb342');
        ctx.fillStyle = '#9ccc65';
        ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = '#7cb342';
        ctx.fillRect(1, 1, 14, 1);
        ctx.fillRect(1, 14, 14, 1);
        ctx.fillRect(1, 1, 1, 14);
        ctx.fillRect(14, 1, 1, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(3, 3, 6, 1);
        noise(0.06, 0.6);
    });

    // 22: Dead Bush
    withTile(22, () => {
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(7, 10, 2, 6); ctx.fillRect(5, 8, 1, 4); ctx.fillRect(10, 7, 1, 5);
        ctx.fillRect(3, 6, 3, 1); ctx.fillRect(9, 5, 4, 1);
    });

    // 29: Grass Plant
    withTile(29, () => {
        ctx.fillStyle = '#388e3c'; 
        ctx.fillRect(2, 6, 1, 10); ctx.fillRect(5, 4, 1, 12);
        ctx.fillRect(8, 7, 1, 9); ctx.fillRect(11, 5, 1, 11);
        ctx.fillRect(13, 8, 1, 8); ctx.fillRect(1, 10, 3, 1); ctx.fillRect(12, 8, 3, 1);
    });

    // 30: Rose
    withTile(30, () => {
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(7, 6, 2, 10); ctx.fillRect(6, 10, 1, 2); ctx.fillRect(9, 12, 1, 2);
        ctx.fillStyle = '#d32f2f'; ctx.fillRect(6, 2, 4, 4); ctx.fillRect(5, 3, 6, 2); ctx.fillRect(7, 1, 2, 1);
    });

    // 31: Dandelion
    withTile(31, () => {
        ctx.fillStyle = '#558b2f'; ctx.fillRect(7, 8, 2, 8);
        ctx.fillStyle = '#fbc02d'; ctx.fillRect(6, 5, 4, 3); ctx.fillRect(5, 6, 6, 1); ctx.fillRect(7, 4, 2, 1);
    });

    // 72: Debug Cross
    withTile(72, () => {
        ctx.fillStyle = '#000000'; ctx.fillRect(8, 0, 8, 8); ctx.fillRect(0, 8, 8, 8);
        ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8);
    });

    // 23: Spruce Log Side
    withTile(23, () => {
        fill('#3e2723'); // Spruce bark base
        ctx.fillStyle = '#2d1e18'; ctx.fillRect(3, 0, 2, 16); ctx.fillRect(11, 0, 2, 16); noise(0.1);
    });

    // 24: Spruce Leaves
    withTile(24, () => {
        ctx.fillStyle = '#1b5e20'; 
        for(let py=0; py<16; py++) for(let px=0; px<16; px++) if(Math.random() < 0.85) ctx.fillRect(px, py, 1, 1);
        noise(0.2);
    });

    // 25: Snowy Grass Side
    withTile(25, () => {
        fill('#5d4037'); // Dirt base
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 16, 4); 
        for(let i=0; i<16; i++) ctx.fillRect(i, 4, 1, Math.floor(Math.random()*4));
        noise(0.05);
    });

    // 43: Crafting Table Top
    withTile(43, () => {
        fill('#8d6e63');
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#d7ccc8'; ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = '#3e2723'; ctx.fillRect(6, 2, 1, 12); ctx.fillRect(10, 2, 1, 12);
        ctx.fillRect(2, 6, 12, 1); ctx.fillRect(2, 10, 12, 1);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(3, 7, 3, 3); ctx.fillRect(11, 3, 2, 4);
    });

    // 42: Crafting Table Side
    withTile(42, () => {
        fill('#8d6e63'); noise(0.1); 
        ctx.fillStyle = '#3e2723'; ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(4, 4, 8, 8);
    });

    // 45: Furnace Side
    withTile(45, () => {
        fill('#757575'); noise(0.2);
        ctx.fillStyle = '#424242'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 10, 16, 1); ctx.fillRect(5, 2, 4, 1);
    });

    // 44: Furnace Front
    withTile(44, () => {
        fill('#757575'); noise(0.2); 
        ctx.fillStyle = '#424242'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 10, 16, 1);
        ctx.fillStyle = '#111111'; ctx.fillRect(3, 3, 10, 10);
        ctx.fillStyle = '#333333'; ctx.fillRect(3, 3, 10, 1); ctx.fillRect(3, 12, 10, 1);
        ctx.fillRect(3, 3, 1, 10); ctx.fillRect(12, 3, 1, 10);
        ctx.fillStyle = '#555555'; ctx.fillRect(5, 5, 2, 2); ctx.fillRect(9, 5, 2, 2);
        ctx.fillRect(5, 9, 2, 2); ctx.fillRect(9, 9, 2, 2);
    });

    // 47: Furnace Active Front
    withTile(47, () => {
        fill('#757575'); noise(0.2); 
        ctx.fillStyle = '#424242'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 10, 16, 1);
        ctx.fillStyle = '#111111'; ctx.fillRect(3, 3, 10, 10);
        ctx.fillStyle = '#ff5722'; ctx.fillRect(4, 9, 8, 3);
        ctx.fillStyle = '#ffeb3b'; ctx.fillRect(5, 10, 2, 2); ctx.fillRect(9, 10, 2, 2);
    });

    // 52: Chest Front
    withTile(52, () => {
        fill('#8d6e63');
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
        ctx.fillStyle = '#bdbdbd'; ctx.fillRect(7, 6, 2, 3);
        ctx.fillStyle = '#757575'; ctx.fillRect(7, 9, 2, 1);
        noise(0.1);
    });

    // 53: Chest Side
    withTile(53, () => {
        fill('#8d6e63');
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
        noise(0.1);
    });

    // 54: Chest Top/Bottom
    withTile(54, () => {
        fill('#8d6e63');
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
        ctx.fillRect(7, 0, 2, 16); ctx.fillRect(0, 7, 16, 2);
        noise(0.1);
    });

    // 64: Wool
    withTile(64, () => {
        fill('#eeeeee');
        for (let py = 0; py < 16; py += 1) { ctx.fillStyle = py % 2 === 0 ? '#eeeeee' : '#e0e0e0'; ctx.fillRect(0, py, 16, 1); }
        ctx.fillStyle = '#d5d5d5';
        for(let py=0; py<16; py+=2) for(let px=0; px<16; px+=2) if ((px/2)%2 === (py/2)%2) ctx.fillRect(px, py, 1, 1);
    });

    // 65: Bed Foot Top
    withTile(65, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#b71c1c'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 9, 16, 1); noise(0.05);
    });

    // 66: Bed Head Top
    withTile(66, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#eeeeee'; ctx.fillRect(1, 0, 14, 6);
        ctx.fillStyle = '#e0e0e0'; ctx.fillRect(2, 1, 12, 4); noise(0.05);
    });

    // 68: Bed Side
    withTile(68, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, 16, 9); 
        ctx.fillStyle = '#b71c1c'; ctx.fillRect(0, 8, 16, 1); 
        ctx.fillStyle = '#5d4037'; ctx.fillRect(12, 9, 3, 7); ctx.fillRect(0, 9, 16, 2);
    });

    // 69: Bed Left
    withTile(69, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, 16, 9);
        ctx.fillStyle = '#b71c1c'; ctx.fillRect(0, 8, 16, 1);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(1, 9, 3, 7); ctx.fillRect(0, 9, 16, 2); 
    });

    // 70: Bed End
    withTile(70, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, 16, 9);
        ctx.fillStyle = '#b71c1c'; ctx.fillRect(0, 8, 16, 1); 
        ctx.fillStyle = '#5d4037'; ctx.fillRect(1, 9, 3, 7); ctx.fillRect(12, 9, 3, 7); ctx.fillRect(0, 9, 16, 2);
    });

    // 71: Bed Inner
    withTile(71, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(0, 0, 16, 9); 
        ctx.fillStyle = '#b71c1c'; ctx.fillRect(0, 8, 16, 1); 
        ctx.fillStyle = '#5d4037'; ctx.fillRect(0, 9, 16, 2);
    });

    // 67: Bed Item Icon
    withTile(67, () => {
        ctx.fillStyle = '#c62828'; ctx.fillRect(2, 6, 12, 5); 
        ctx.fillStyle = '#eeeeee'; ctx.fillRect(10, 6, 3, 3);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(2, 11, 2, 2); ctx.fillRect(12, 11, 2, 2); ctx.fillRect(2, 10, 12, 1);
    });

    // Tools
    withTile(32, () => drawTool('#8d6e63', '#6d4c41', 'pick'));
    withTile(33, () => drawTool('#9e9e9e', '#6d4c41', 'pick'));
    withTile(34, () => drawTool('#eeeeee', '#6d4c41', 'pick')); 
    withTile(36, () => drawTool('#8d6e63', '#6d4c41', 'axe'));
    withTile(37, () => drawTool('#9e9e9e', '#6d4c41', 'axe'));
    withTile(38, () => drawTool('#eeeeee', '#6d4c41', 'axe')); 
    withTile(39, () => drawTool('#8d6e63', '#6d4c41', 'shovel'));
    withTile(40, () => drawTool('#9e9e9e', '#6d4c41', 'shovel'));
    withTile(41, () => drawTool('#eeeeee', '#6d4c41', 'shovel')); 
    withTile(61, () => drawTool('#e67e22', '#6d4c41', 'pick'));
    withTile(62, () => drawTool('#e67e22', '#6d4c41', 'axe'));
    withTile(63, () => drawTool('#e67e22', '#6d4c41', 'shovel'));
    withTile(105, () => drawTool('#8d6e63', '#6d4c41', 'sword'));
    withTile(106, () => drawTool('#8d6e63', '#6d4c41', 'hoe'));
    withTile(107, () => drawTool('#9e9e9e', '#6d4c41', 'sword'));
    withTile(108, () => drawTool('#9e9e9e', '#6d4c41', 'hoe'));
    withTile(109, () => drawTool('#eeeeee', '#6d4c41', 'sword'));
    withTile(110, () => drawTool('#eeeeee', '#6d4c41', 'hoe'));
    withTile(111, () => drawTool('#e67e22', '#6d4c41', 'sword'));
    withTile(112, () => drawTool('#e67e22', '#6d4c41', 'hoe'));
    withTile(113, () => drawTool('#fbc02d', '#6d4c41', 'pick'));
    withTile(114, () => drawTool('#fbc02d', '#6d4c41', 'axe'));
    withTile(115, () => drawTool('#fbc02d', '#6d4c41', 'shovel'));
    withTile(116, () => drawTool('#fbc02d', '#6d4c41', 'sword'));
    withTile(117, () => drawTool('#fbc02d', '#6d4c41', 'hoe'));
    withTile(118, () => drawTool('#00bcd4', '#6d4c41', 'pick'));
    withTile(119, () => drawTool('#00bcd4', '#6d4c41', 'axe'));
    withTile(120, () => drawTool('#00bcd4', '#6d4c41', 'shovel'));
    withTile(121, () => drawTool('#00bcd4', '#6d4c41', 'sword'));
    withTile(122, () => drawTool('#00bcd4', '#6d4c41', 'hoe'));

    // Coal Item
    withTile(48, () => {
        ctx.fillStyle = '#111111'; ctx.fillRect(4, 3, 9, 10); ctx.fillRect(3, 5, 11, 6);
        ctx.fillStyle = '#2c2c2c'; ctx.fillRect(5, 4, 2, 2); ctx.fillRect(9, 5, 2, 2); ctx.fillRect(6, 8, 2, 2);
    });

    // Charcoal Item
    withTile(57, () => {
        ctx.fillStyle = '#3e2723'; ctx.fillRect(5, 3, 6, 10); ctx.fillRect(4, 4, 8, 8);
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(6, 3, 4, 10);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(5, 5, 1, 2); ctx.fillRect(8, 9, 2, 1);
    });

    // Iron Ingot
    withTile(49, () => {
        ctx.fillStyle = '#d7ccc8'; ctx.fillRect(4, 6, 8, 4); ctx.fillRect(3, 5, 10, 6);
        ctx.fillStyle = '#eeeeee'; ctx.fillRect(4, 6, 6, 2);
    });

    // Copper Ingot
    withTile(60, () => {
        ctx.fillStyle = '#d35400'; ctx.fillRect(4, 6, 8, 4); ctx.fillRect(3, 5, 10, 6);
        ctx.fillStyle = '#e67e22'; ctx.fillRect(4, 6, 6, 2);
    });

    // Apple
    withTile(50, () => { fill('#ff1744'); noise(0.2); });

    // Oak Sapling
    withTile(51, () => {
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(7, 9, 2, 7); // stem
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(5, 3, 6, 7); ctx.fillRect(4, 4, 8, 5); // canopy
        ctx.fillStyle = '#388e3c'; ctx.fillRect(6, 4, 4, 4); // highlight
    });
    // Spruce Sapling
    withTile(146, () => {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(7, 11, 2, 5); // stem
        ctx.fillStyle = '#1b5e20'; // dark spruce green
        ctx.fillRect(7, 3, 2, 2); // top
        ctx.fillRect(5, 5, 6, 2); // mid tier
        ctx.fillRect(4, 7, 8, 2); // lower tier
        ctx.fillRect(3, 9, 10, 2); // base tier
    });
    // Birch Sapling
    withTile(147, () => {
        ctx.fillStyle = '#e0e0e0'; ctx.fillRect(7, 9, 2, 7); // white stem
        ctx.fillStyle = '#424242'; ctx.fillRect(7, 11, 1, 1); ctx.fillRect(8, 14, 1, 1); // bark marks
        ctx.fillStyle = '#7cb342'; ctx.fillRect(5, 3, 6, 6); ctx.fillRect(4, 4, 8, 4); // canopy
        ctx.fillStyle = '#9ccc65'; ctx.fillRect(6, 4, 4, 3); // highlight
    });
    // Cherry Sapling
    withTile(148, () => {
        ctx.fillStyle = '#5d4037'; ctx.fillRect(7, 9, 2, 7); // stem
        ctx.fillStyle = '#81c784'; ctx.fillRect(5, 3, 6, 7); ctx.fillRect(4, 4, 8, 5); // canopy
        ctx.fillStyle = '#f48fb1'; ctx.fillRect(5, 4, 2, 2); ctx.fillRect(9, 5, 2, 2); ctx.fillRect(7, 7, 2, 1); // pink blossoms
    });

    // Raw Iron
    withTile(55, () => {
        ctx.fillStyle = '#a1887f'; ctx.fillRect(5, 5, 6, 6); ctx.fillRect(4, 6, 8, 4);
        ctx.fillStyle = '#d7ccc8'; ctx.fillRect(6, 6, 2, 2); ctx.fillRect(8, 8, 2, 2);
        ctx.fillStyle = '#5d4037'; ctx.fillRect(5, 8, 1, 1);
    });

    // Raw Copper
    withTile(59, () => {
        ctx.fillStyle = '#a1887f'; ctx.fillRect(5, 5, 6, 6); ctx.fillRect(4, 6, 8, 4);
        ctx.fillStyle = '#e67e22'; ctx.fillRect(6, 6, 2, 2); ctx.fillRect(8, 8, 2, 2);
        ctx.fillStyle = '#d35400'; ctx.fillRect(5, 8, 1, 1);
    });

    // Stick
    withTile(35, () => {
        ctx.fillStyle = '#6d4c41'; for(let i=0; i<8; i++) ctx.fillRect(11-i, 4+i, 1, 1);
    });

    // Torch
    withTile(56, () => {
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(7, 6, 2, 10);
        ctx.fillStyle = '#212121'; ctx.fillRect(6, 4, 4, 2);
        ctx.fillStyle = '#ffeb3b'; ctx.fillRect(7, 1, 2, 3);
        ctx.fillStyle = '#ff9800'; ctx.fillRect(7, 0, 2, 1); ctx.fillRect(6, 2, 1, 2); ctx.fillRect(9, 2, 1, 2);
    });

    // Lava
    withTile(17, () => {
        fill('#f44336'); // Hot red base
        ctx.fillStyle = '#ff5722'; for(let i=0; i<40; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
        ctx.fillStyle = '#b71c1c'; for(let i=0; i<20; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    });

    // Wheat Seeds
    withTile(73, () => {
        ctx.fillStyle = '#81c784'; [[6,5],[9,5],[7,7],[10,8]].forEach(([px, py]) => ctx.fillRect(px, py, 2, 2));
        ctx.fillStyle = '#2e7d32'; [[8,6],[6,9]].forEach(([px, py]) => ctx.fillRect(px, py, 2, 2));
    });

    // Cherry Log Side
    withTile(74, () => {
        fill('#3e1e24'); // Cherry bark base
        ctx.fillStyle = '#2d1e18'; ctx.fillRect(2, 0, 2, 16); ctx.fillRect(9, 0, 3, 16); noise(0.1);
    });

    // Cherry Log Top
    withTile(75, () => {
        fill('#f8bbd0'); // Light pink wood base
        ctx.strokeStyle = '#3e1e24'; ctx.strokeRect(2.5, 2.5, 11, 11); noise(0.05);
    });

    // Cherry Leaves
    withTile(76, () => {
        ctx.fillStyle = '#f8bbd0'; 
        for(let py=0; py<16; py++) for(let px=0; px<16; px++) if(Math.random() < 0.85) ctx.fillRect(px, py, 1, 1);
        ctx.fillStyle = '#f48fb1'; for(let i=0; i<40; i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
    });

    // Cherry Planks
    withTile(77, () => {
        fill('#f48fb1'); // Pink plank base
        ctx.fillStyle = '#d8a0a8'; 
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 4, 16, 1);
        ctx.fillRect(0, 8, 16, 1); ctx.fillRect(0, 12, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(6, 0, 1, 4); ctx.fillRect(12, 5, 1, 3);
        ctx.fillRect(4, 9, 1, 3); ctx.fillRect(10, 13, 1, 3);
        noise(0.05);
    });

    // Red Sand
    withTile(78, () => { fill('#bc6a53'); noise(0.2); });

    // Red Sandstone Side
    withTile(79, () => {
        fill('#bf360c'); // Red sandstone base
        ctx.fillStyle = '#e07a3e'; ctx.fillRect(0, 0, 16, 4); ctx.fillRect(0, 8, 16, 3);
        ctx.fillStyle = '#a0522d'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1);
        noise(0.1);
    });

    // Terracotta
    withTile(80, () => { fill('#a1887f'); noise(0.05); });
    // Yellow Terracotta
    withTile(81, () => { fill('#fbc02d'); noise(0.05); });
    // Red Terracotta
    withTile(82, () => { fill('#8d6e63'); noise(0.05); });

    // Basalt Side
    withTile(83, () => {
        fill('#424242'); // Dark stone base
        ctx.fillStyle = '#212121'; ctx.fillRect(2, 0, 3, 16); ctx.fillRect(8, 0, 3, 16); ctx.fillRect(14, 0, 2, 16);
        noise(0.1);
    });

    // Basalt Top
    withTile(84, () => { fill('#616161'); noise(0.1); });

    // Magma
    withTile(85, () => {
        fill('#d32f2f'); // Lava stone base
        ctx.fillStyle = '#ff5722'; 
        [[3,3],[4,4],[5,3],[10,10],[11,9],[12,10],[6,12],[7,13]].forEach(([px, py]) => ctx.fillRect(px, py, 2, 2));
        ctx.fillStyle = '#ffeb3b'; 
        [[4,3],[11,10],[7,12]].forEach(([px, py]) => ctx.fillRect(px, py, 1, 1));
    });

    // Pink Petals
    withTile(86, () => {
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(7, 9, 2, 7);
        ctx.fillStyle = '#f48fb1';
        [[6,5],[5,6],[7,6],[6,7]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        [[9,7],[8,8],[10,8],[9,9]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        [[6,10],[5,11],[7,11],[6,12]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
    });

    // Birch Log Side
    withTile(87, () => {
        fill('#e3dfd3'); // Cream bark base
        ctx.fillStyle = '#212121'; 
        ctx.fillRect(2, 3, 3, 1); ctx.fillRect(10, 7, 4, 1);
        ctx.fillRect(5, 12, 2, 1); ctx.fillRect(1, 14, 3, 1); ctx.fillRect(12, 2, 2, 1);
        noise(0.05);
    });

    // Birch Log Top
    withTile(88, () => {
        fill('#e3dfd3');
        ctx.strokeStyle = '#bdbdbd'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, 14, 14); ctx.lineWidth = 1;
        noise(0.05);
    });

    // Birch Leaves
    withTile(89, () => {
        ctx.fillStyle = '#81c784'; 
        for(let py=0; py<16; py++) for(let px=0; px<16; px++) if(Math.random() < 0.85) ctx.fillRect(px, py, 1, 1);
        noise(0.1);
    });

    // Birch Planks
    withTile(90, () => {
        fill('#f0f4c3'); // Pale wood base
        ctx.fillStyle = '#d4e157'; 
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 4, 16, 1);
        ctx.fillRect(0, 8, 16, 1); ctx.fillRect(0, 12, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(6, 0, 1, 4); ctx.fillRect(12, 5, 1, 3);
        ctx.fillRect(4, 9, 1, 3); ctx.fillRect(10, 13, 1, 3);
        noise(0.05);
    });

    // Terracottas
    withTile(91, () => { fill('#d1b1a1'); noise(0.05); });
    withTile(92, () => { fill('#a05425'); noise(0.05); });
    withTile(93, () => { fill('#95576c'); noise(0.05); });
    withTile(94, () => { fill('#876b62'); noise(0.05); });
    withTile(95, () => { fill('#4d3323'); noise(0.05); });

    // Ores
    withTile(96, () => { fill('#9e9e9e'); noise(0.15); ctx.fillStyle = '#fdd835'; [[4,4],[5,4],[6,5],[10,10],[11,10],[12,9],[5,12]].forEach(([px, py]) => ctx.fillRect(px, py, 2, 2)); });
    withTile(97, () => { fill('#9e9e9e'); noise(0.15); ctx.fillStyle = '#00e5ff'; [[5,5],[6,6],[10,8],[11,7],[4,12],[8,3],[12,12]].forEach(([px, py]) => ctx.fillRect(px, py, 2, 2)); });
    withTile(98, () => { fill('#9e9e9e'); noise(0.15); ctx.fillStyle = '#1a237e'; [[4,6],[5,5],[5,6],[6,5],[10,10],[11,10],[10,11],[11,11],[7,3]].forEach(([px, py]) => ctx.fillRect(px, py, 1, 1)); });
    withTile(99, () => { fill('#9e9e9e'); noise(0.15); ctx.fillStyle = '#00e676'; [[5,5],[10,9],[3,11],[12,4],[8,8]].forEach(([px, py]) => ctx.fillRect(px, py, 2, 2)); });

    // Raw Gold
    withTile(100, () => {
        ctx.fillStyle = '#fdd835'; 
        [[5,5],[6,5],[7,5],[4,6],[5,6],[6,6],[7,6],[8,6],[4,7],[5,7],[6,7],[7,7],[8,7],[5,8],[6,8],[7,8],[5,9],[6,9],[9,8],[10,8],[10,9]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        ctx.fillStyle = '#fbc02d'; 
        [[5,6],[6,5],[7,6],[5,7],[6,8]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
    });

    // Gold Ingot
    withTile(101, () => {
        ctx.fillStyle = '#f9a825'; ctx.fillRect(3, 6, 10, 4);
        ctx.fillStyle = '#fbc02d'; ctx.fillRect(4, 6, 8, 3);
        ctx.fillStyle = '#fff59d'; ctx.fillRect(4, 6, 6, 1); ctx.fillRect(4, 7, 2, 1);
    });

    // Diamond
    withTile(102, () => {
        ctx.fillStyle = '#00bcd4'; 
        [[7,2],[8,2],[6,3],[9,3],[5,4],[10,4],[4,5],[11,5],[4,6],[11,6],[5,7],[10,7],[6,8],[9,8],[7,9],[8,9],[7,13],[8,13]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        ctx.fillStyle = '#00e5ff'; 
        [[7,3],[8,3],[6,4],[7,4],[8,4],[9,4],[5,5],[6,5],[7,5],[8,5],[9,5],[10,5],[5,6],[6,6],[7,6],[8,6],[9,6],[10,6],[6,7],[7,7],[8,7],[9,7],[7,8],[8,8],[7,10],[8,10],[7,11],[8,11],[7,12],[8,12]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        ctx.fillStyle = '#84ffff'; [[7,4],[8,4],[7,5],[8,5]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
    });

    // Emerald
    withTile(103, () => {
        ctx.fillStyle = '#2e7d32'; 
        [[7,3],[8,3],[6,4],[9,4],[5,5],[10,5],[5,9],[10,9],[6,10],[9,10],[7,11],[8,11]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        ctx.fillRect(5, 6, 1, 3); ctx.fillRect(10, 6, 1, 3);
        ctx.fillStyle = '#00e676'; ctx.fillRect(6, 5, 4, 5); 
        ctx.fillStyle = '#b9f6ca'; ctx.fillRect(7, 6, 2, 2);
    });

    // Lapis
    withTile(104, () => {
        ctx.fillStyle = '#1a237e'; 
        [[6,4],[7,4],[8,4],[9,4],[5,5],[10,5],[4,6],[11,6],[4,7],[11,7],[4,8],[11,8],[5,9],[10,9],[6,10],[7,10],[8,10],[9,10],[5,6],[5,7],[5,8],[10,6],[10,7],[10,8]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
        ctx.fillStyle = '#3949ab'; [[6,6],[7,7],[8,6]].forEach(([px,py]) => ctx.fillRect(px,py, 1, 1));
    });

    const sanitizeCutoutTile = (
        tileCol: number,
        tileRow: number,
        alphaCutoff = 160,
        iterations = 4,
        forcedTransparentRgb?: [number, number, number]
    ) => {
        const tileX = tileCol * size;
        const tileY = tileRow * size;
        const imageData = ctx.getImageData(tileX, tileY, size, size);
        const pixels = imageData.data;
        const tileWidth = size;

        let opaqueRSum = 0;
        let opaqueGSum = 0;
        let opaqueBSum = 0;
        let opaqueCount = 0;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * tileWidth + x) * 4;
                const alpha = pixels[idx + 3];
                pixels[idx + 3] = alpha >= alphaCutoff ? 255 : 0;
                if (pixels[idx + 3] > 0) {
                    opaqueRSum += pixels[idx];
                    opaqueGSum += pixels[idx + 1];
                    opaqueBSum += pixels[idx + 2];
                    opaqueCount++;
                }
            }
        }

        for (let pass = 0; pass < iterations; pass++) {
            const source = new Uint8ClampedArray(pixels);

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const idx = (y * tileWidth + x) * 4;
                    const alpha = source[idx + 3];
                    if (alpha > 0) continue;

                    let rSum = 0;
                    let gSum = 0;
                    let bSum = 0;
                    let count = 0;

                    for (let oy = -1; oy <= 1; oy++) {
                        for (let ox = -1; ox <= 1; ox++) {
                            if (ox === 0 && oy === 0) continue;
                            const nx = x + ox;
                            const ny = y + oy;
                            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                            const nIdx = (ny * tileWidth + nx) * 4;
                            const nAlpha = source[nIdx + 3];
                            if (nAlpha === 0) continue;
                            rSum += source[nIdx];
                            gSum += source[nIdx + 1];
                            bSum += source[nIdx + 2];
                            count++;
                        }
                    }

                    if (count > 0) {
                        pixels[idx] = Math.round(rSum / count);
                        pixels[idx + 1] = Math.round(gSum / count);
                        pixels[idx + 2] = Math.round(bSum / count);
                    }
                }
            }
        }

        const fallbackR = forcedTransparentRgb?.[0] ?? (opaqueCount > 0 ? Math.round(opaqueRSum / opaqueCount) : 96);
        const fallbackG = forcedTransparentRgb?.[1] ?? (opaqueCount > 0 ? Math.round(opaqueGSum / opaqueCount) : 144);
        const fallbackB = forcedTransparentRgb?.[2] ?? (opaqueCount > 0 ? Math.round(opaqueBSum / opaqueCount) : 96);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * tileWidth + x) * 4;
                if (pixels[idx + 3] !== 0) continue;

                if (pixels[idx] === 0 && pixels[idx + 1] === 0 && pixels[idx + 2] === 0) {
                    pixels[idx] = fallbackR;
                    pixels[idx + 1] = fallbackG;
                    pixels[idx + 2] = fallbackB;
                    continue;
                }

                const isNearWhite = pixels[idx] > 180 && pixels[idx + 1] > 180 && pixels[idx + 2] > 180;
                if (isNearWhite) {
                    pixels[idx] = fallbackR;
                    pixels[idx + 1] = fallbackG;
                    pixels[idx + 2] = fallbackB;
                }
            }
        }

        ctx.putImageData(imageData, tileX, tileY);
    };

    const cutoutSlots = [4, 22, 24, 29, 30, 31, 51, 73, 76, 86, 89];
    for (const slot of cutoutSlots) {
        const tileCol = slot % cols;
        const tileRow = Math.floor(slot / cols);
        if (tileRow < rows) {
            const isSpruceLeaves = slot === 24;
            const slotCutoff = isSpruceLeaves ? 170 : 160;
            const forcedRgb: [number, number, number] | undefined = isSpruceLeaves ? [46, 107, 78] : undefined;
            sanitizeCutoutTile(tileCol, tileRow, slotCutoff, 4, forcedRgb);
        }
    }

    
    // --- 2. Create Padded Atlas ---
    const paddedCanvas = document.createElement('canvas');
    const paddedCols = ATLAS_COLS;
    const paddedRows = rows;
    
    const finalWidth = paddedCols * ATLAS_STRIDE;
    const finalHeight = paddedRows * ATLAS_STRIDE;
    
    paddedCanvas.width = finalWidth;
    paddedCanvas.height = finalHeight;
    const pCtx = paddedCanvas.getContext('2d');
    
    if (!pCtx) return document.createElement('canvas');

    // Hard guarantee no blur in copy
    pCtx.imageSmoothingEnabled = false;
    
    for(let i=0; i < paddedCols * paddedRows; i++) {
        const col = i % paddedCols;
        const row = Math.floor(i / paddedCols);
        const srcX = col * 16;
        const srcY = row * 16;
        const destX = col * ATLAS_STRIDE + ATLAS_PADDING;
        const destY = row * ATLAS_STRIDE + ATLAS_PADDING;
        
        // Center 16x16
        pCtx.drawImage(rawCanvas, srcX, srcY, 16, 16, destX, destY, 16, 16);
        // Top edge padding
        pCtx.drawImage(rawCanvas, srcX, srcY, 16, 1, destX, destY - ATLAS_PADDING, 16, ATLAS_PADDING);
        // Bottom edge padding
        pCtx.drawImage(rawCanvas, srcX, srcY + 15, 16, 1, destX, destY + 16, 16, ATLAS_PADDING);
        // Left edge padding
        pCtx.drawImage(rawCanvas, srcX, srcY, 1, 16, destX - ATLAS_PADDING, destY, ATLAS_PADDING, 16);
        // Right edge padding
        pCtx.drawImage(rawCanvas, srcX + 15, srcY, 1, 16, destX + 16, destY, ATLAS_PADDING, 16);
        // Corners
        pCtx.drawImage(rawCanvas, srcX, srcY, 1, 1, destX - ATLAS_PADDING, destY - ATLAS_PADDING, ATLAS_PADDING, ATLAS_PADDING);
        pCtx.drawImage(rawCanvas, srcX + 15, srcY, 1, 1, destX + 16, destY - ATLAS_PADDING, ATLAS_PADDING, ATLAS_PADDING);
        pCtx.drawImage(rawCanvas, srcX, srcY + 15, 1, 1, destX - ATLAS_PADDING, destY + 16, ATLAS_PADDING, ATLAS_PADDING);
        pCtx.drawImage(rawCanvas, srcX + 15, srcY + 15, 1, 1, destX + 16, destY + 16, ATLAS_PADDING, ATLAS_PADDING);
    }

    cachedAtlasDimensions = { width: finalWidth, height: finalHeight };
    cachedAtlasURL = paddedCanvas.toDataURL();
    return paddedCanvas;
};

/**
 * EXPORT ATLAS DEBUG PNG
 * Overlays tile borders and indices for validation.
 * Call from browser console.
 */
export const exportAtlasDebugPNG = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const { width, height } = getAtlasDimensions();
    const url = getAtlasURL();
    if (!url) return console.error("Atlas not generated yet.");

    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);

        const rows = height / ATLAS_STRIDE;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < ATLAS_COLS; c++) {
                const idx = r * ATLAS_COLS + c;
                const ox = c * ATLAS_STRIDE;
                const oy = r * ATLAS_STRIDE;
                
                // Outer padding border
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                ctx.lineWidth = 1;
                ctx.strokeRect(ox + 0.5, oy + 0.5, ATLAS_STRIDE - 1, ATLAS_STRIDE - 1);
                
                // Inner 16x16 border
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                ctx.strokeRect(ox + ATLAS_PADDING + 0.5, oy + ATLAS_PADDING + 0.5, 15, 15);
                
                // Index text
                ctx.fillStyle = 'white';
                ctx.font = '8px monospace';
                ctx.textBaseline = 'top';
                ctx.fillText(idx.toString(), ox + 2, oy + 2);
            }
        }

        const debugUrl = canvas.toDataURL();
        const win = window.open();
        if (win) {
            win.document.write(`<img src="${debugUrl}" style="image-rendering:pixelated; background:#222;"/>`);
        } else {
            console.log("Atlas Debug URL:", debugUrl);
        }
    };
    img.src = url;
};

// Expose to console (browser only)
if (typeof window !== "undefined") {
  (window as any).exportAtlasDebug = exportAtlasDebugPNG;
}
