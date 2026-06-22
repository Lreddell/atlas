
import * as THREE from 'three';
import { ATLAS_COLS, getTextureRows } from '../data/blocks';
import { createPaddedAtlasCanvas, sanitizeCutoutTiles } from './atlasCanvasTools';
import {
    CUTOUT_TILE_CONFIGS,
    drawFoliageFamilyTiles,
    drawOreFamilyTiles,
    drawTerracottaTiles,
    drawWoodFamilyTiles,
} from './atlasTileFamilies';
import { openAtlasDebugWindow } from './textureAtlasDebug';
import {
    paintPixelTile,
    PR19_TEXTURE_ASSETS,
    PR19_TEXTURE_TILES,
} from '../systems/textures/pr19TexturePixels';

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
    const ctx = rawCanvas.getContext('2d', { willReadFrequently: true });
    
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

    const tilePainter = { ctx, withTile, fill, noise };
    drawWoodFamilyTiles(tilePainter);
    drawFoliageFamilyTiles(tilePainter);
    drawOreFamilyTiles(tilePainter);
    drawTerracottaTiles(tilePainter);

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

    // 5: Sand
    withTile(5, () => { fill('#fff9c4'); noise(0.2); });

    // 6: Bedrock
    withTile(6, () => { fill('#424242'); noise(0.4); });

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

    // 14: Water
    withTile(14, () => { fill('#29b6f6'); noise(0.15); });

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

    // Red Sand
    withTile(78, () => { fill('#bc6a53'); noise(0.2); });

    // Red Sandstone Side
    withTile(79, () => {
        fill('#bf360c'); // Red sandstone base
        ctx.fillStyle = '#e07a3e'; ctx.fillRect(0, 0, 16, 4); ctx.fillRect(0, 8, 16, 3);
        ctx.fillStyle = '#a0522d'; ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1);
        noise(0.1);
    });

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

    PR19_TEXTURE_ASSETS.forEach(({ slot }) => {
        withTile(slot, () => paintPixelTile(ctx, PR19_TEXTURE_TILES[slot]));
    });

    // 169: Packed Ice — denser, more crystalline ice for the Ice Spikes biome.
    withTile(169, () => {
        fill('#b3e5fc');
        ctx.fillStyle = '#81d4fa';
        for (let i = 0; i < 24; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        ctx.fillStyle = '#4fc3f7';
        // Diagonal crystalline streaks
        for (let i = 0; i < 16; i++) {
            ctx.fillRect(i, (i * 2) % 16, 1, 1);
            ctx.fillRect((i * 3) % 16, i, 1, 1);
        }
        ctx.fillStyle = '#e1f5fe';
        ctx.fillRect(2, 2, 2, 1); ctx.fillRect(9, 5, 2, 1); ctx.fillRect(4, 11, 2, 1); ctx.fillRect(12, 13, 2, 1);
    });

    // --- Biome block procedural fallbacks (Task ID 5) ---
    // These are simple fallbacks; the real textures ship as PNG assets in
    // public/assets/textures/blocks/ and override these at runtime.
    const grassTopFallback = (slot: number, base: string, light: string, dark: string) => {
        withTile(slot, () => {
            fill(base);
            ctx.fillStyle = light;
            for (let i = 0; i < 30; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
            ctx.fillStyle = dark;
            for (let i = 0; i < 18; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        });
    };
    const grassSideFallback = (slot: number, grassCol: string) => {
        withTile(slot, () => {
            fill('#5d4037');
            ctx.fillStyle = '#3e2723';
            for (let i = 0; i < 14; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
            // grass fringe top 3 rows
            ctx.fillStyle = grassCol;
            for (let x = 0; x < 16; x++) { ctx.fillRect(x, 0, 1, 1); ctx.fillRect(x, 1, 1, 1); if (Math.random() < 0.6) ctx.fillRect(x, 2, 1, 1); }
        });
    };
    grassTopFallback(170, '#568b48', '#7ab06a', '#3a6b30'); grassSideFallback(171, '#568b48');  // Mossy Grass
    grassTopFallback(172, '#5aaa50', '#7fc870', '#3d7a35'); grassSideFallback(173, '#5aaa50');  // Lush Grass
    grassTopFallback(174, '#2c5230', '#3e7a42', '#1b3a1f'); grassSideFallback(175, '#2c5230');  // Dark Grass
    grassTopFallback(176, '#78aa50', '#9ac870', '#527a35'); grassSideFallback(177, '#78aa50');  // Meadow Grass
    grassTopFallback(178, '#b0a83c', '#c8c060', '#827a28'); grassSideFallback(179, '#b0a83c');  // Savanna Grass
    grassTopFallback(180, '#3c8c32', '#5ab04a', '#2a6a22'); grassSideFallback(181, '#3c8c32');  // Jungle Grass
    // Podzol
    withTile(182, () => { fill('#6e5037'); ctx.fillStyle = '#4a3525'; for (let i=0;i<18;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); ctx.fillStyle='#4a7a3c'; for(let i=0;i<6;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); });
    withTile(183, () => { fill('#5d4037'); ctx.fillStyle='#3e2723'; for (let i=0;i<14;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); ctx.fillStyle='#6e5037'; for(let i=0;i<8;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); });
    // Stone variants
    withTile(184, () => { fill('#8c8a86'); ctx.fillStyle='#6e6c68'; for (let i=0;i<28;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); ctx.fillStyle='#aeaca8'; for(let i=0;i<20;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); }); // Andesite
    withTile(185, () => { fill('#e1e1de'); ctx.fillStyle='#555'; for (let i=0;i<32;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); }); // Diorite
    withTile(186, () => { fill('#af6e5f'); ctx.fillStyle='#8c5040'; for (let i=0;i<28;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); ctx.fillStyle='#d29a8a'; for(let i=0;i<18;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); }); // Granite
    // Coarse Dirt
    withTile(187, () => { fill('#6e5541'); ctx.fillStyle='#503c28'; for (let i=0;i<18;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); ctx.fillStyle='#8c7050'; for(let i=0;i<12;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); });
    // Mud
    withTile(188, () => { fill('#3c3026'); ctx.fillStyle='#2a2018'; for (let i=0;i<16;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); ctx.fillStyle='#504030'; for(let i=0;i<10;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); });
    // Mossy Cobblestone
    withTile(189, () => { fill('#787878'); ctx.fillStyle='#3a3a3a'; for (let x=0;x<16;x++) for (let y=0;y<16;y++) if ((x%8===0||y%8===0) && Math.random()<0.5) ctx.fillRect(x,y,1,1); ctx.fillStyle='#4a7a3c'; for(let i=0;i<14;i++) ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16),1,1); });

    // --- New wood family fallbacks (Task ID 6) ---
    const shadeHex = (hex: string, amount: number): string => {
        const v = parseInt(hex.slice(1), 16);
        const r = Math.max(0, Math.min(255, ((v >> 16) & 255) + amount));
        const g = Math.max(0, Math.min(255, ((v >> 8) & 255) + amount));
        const b = Math.max(0, Math.min(255, (v & 255) + amount));
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    };
    const logTopFallback = (slot: number, ring: string, bark: string) => {
        withTile(slot, () => {
            fill(bark);
            ctx.fillStyle = ring;
            ctx.fillRect(2, 2, 12, 12);
            ctx.fillStyle = shadeHex(ring, -20);
            ctx.fillRect(4, 4, 8, 8);
            ctx.fillStyle = shadeHex(ring, -35);
            ctx.fillRect(7, 7, 2, 2);
        });
    };
    const logSideFallback = (slot: number, bark: string) => {
        withTile(slot, () => {
            fill(bark);
            ctx.fillStyle = shadeHex(bark, -25);
            for (let x = 0; x < 16; x += 3) ctx.fillRect(x, 0, 1, 16);
            ctx.fillStyle = shadeHex(bark, 15);
            for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        });
    };
    const planksFallback = (slot: number, col: string) => {
        withTile(slot, () => {
            fill(col);
            ctx.fillStyle = shadeHex(col, -30);
            ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 8, 16, 1); ctx.fillRect(0, 12, 16, 1); ctx.fillRect(0, 15, 16, 1);
            ctx.fillStyle = shadeHex(col, 15);
            for (let i = 0; i < 16; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        });
    };
    const leavesFallback = (slot: number, col: string) => {
        withTile(slot, () => {
            fill(col);
            ctx.fillStyle = shadeHex(col, 25);
            for (let i = 0; i < 28; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
            ctx.fillStyle = shadeHex(col, -25);
            for (let i = 0; i < 18; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        });
    };
    const saplingFallback = (slot: number, leafCol: string, stemCol: string) => {
        withTile(slot, () => {
            // transparent bg — only draw stem + canopy
            ctx.fillStyle = stemCol;
            ctx.fillRect(7, 11, 2, 4);
            ctx.fillStyle = leafCol;
            ctx.fillRect(5, 5, 6, 5); ctx.fillRect(6, 4, 4, 1); ctx.fillRect(6, 10, 4, 1);
            ctx.fillStyle = shadeHex(leafCol, 25);
            ctx.fillRect(6, 5, 2, 1); ctx.fillRect(9, 7, 1, 1);
        });
    };
    // Jungle
    logTopFallback(190, '#8c6437', '#5f6420'); logSideFallback(191, '#5f6420'); planksFallback(192, '#8c6437'); leavesFallback(193, '#327028'); saplingFallback(194, '#327028', '#5f6420');
    // Dark Oak
    logTopFallback(195, '#46321f', '#302218'); logSideFallback(196, '#302218'); planksFallback(197, '#46321f'); leavesFallback(198, '#1e461e'); saplingFallback(199, '#1e461e', '#302218');
    // Acacia
    logTopFallback(200, '#aa8255', '#694e34'); logSideFallback(201, '#694e34'); planksFallback(202, '#aa8255'); leavesFallback(203, '#6e8c32'); saplingFallback(204, '#6e8c32', '#694e34');

    // ===== Magnetic Fields biome tiles (Magnetic Warden content) =====
    // 205: Magnetite Block — gray metallic with dark flecks + subtle purple sheen.
    withTile(205, () => {
        fill('#4a4a55');
        ctx.fillStyle = '#2e2e36';
        for (let i = 0; i < 26; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        ctx.fillStyle = '#6a6a78';
        for (let i = 0; i < 16; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        ctx.fillStyle = '#5b4a78';
        for (let i = 0; i < 6; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
    });

    // Crystal silhouette on a transparent background (cross-plane cutout).
    const crystalTile = (slot: number, core: string, light: string, dark: string) => {
        withTile(slot, () => {
            const set = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
            // Vertical faceted shard, widest at the middle.
            const spans: [number, number, number][] = [
                [7, 1, 1], [6, 2, 3], [6, 3, 3], [5, 4, 5], [5, 5, 5],
                [4, 6, 7], [4, 7, 7], [5, 8, 5], [5, 9, 5], [6, 10, 3], [6, 11, 3], [7, 12, 1], [7, 13, 1],
            ];
            for (const [x, y, w] of spans) {
                for (let i = 0; i < w; i++) set(x + i, y, core);
            }
            // Left facet lighter, right facet darker for a faceted read.
            for (const [x, y, w] of spans) {
                set(x, y, light);
                set(x + w - 1, y, dark);
            }
        });
    };
    crystalTile(206, '#ff4030', '#ff8a7a', '#a01810'); // Positive Magnetite Crystal (red)
    crystalTile(207, '#3060ff', '#84a4ff', '#102aa0'); // Negative Magnetite Crystal (blue)
    crystalTile(210, '#b388ff', '#e0ccff', '#6a3fb0'); // Magnetic Shield Crystal (violet glow)
    crystalTile(212, '#7fe0ff', '#d6f7ff', '#3aa8d0'); // Magnetite Shard (bright cyan contrast)

    // 211: Charged Magnetite — lighter emissive accent with glowing purple veins.
    withTile(211, () => {
        fill('#5a5470');
        ctx.fillStyle = '#3a3550';
        for (let i = 0; i < 22; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        ctx.fillStyle = '#b9a8ff';
        for (let i = 0; i < 14; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        ctx.fillStyle = '#e6dcff';
        ctx.fillRect(3, 3, 2, 1); ctx.fillRect(10, 6, 2, 1); ctx.fillRect(6, 11, 2, 1); ctx.fillRect(12, 12, 1, 2);
    });

    // 208: Magnetic Spike — dark metal spikes on transparent background.
    withTile(208, () => {
        const tri = (cx: number, baseY: number, h: number, color: string) => {
            ctx.fillStyle = color;
            for (let r = 0; r < h; r++) {
                const half = Math.max(0, Math.floor((h - r) / 2));
                for (let x = cx - half; x <= cx + half; x++) ctx.fillRect(x, baseY - r, 1, 1);
            }
        };
        tri(3, 15, 9, '#2b2b30'); tri(8, 15, 13, '#37373d'); tri(12, 15, 8, '#2b2b30');
        // metallic glints near the tips
        ctx.fillStyle = '#7a7a86';
        ctx.fillRect(8, 3, 1, 2); ctx.fillRect(3, 7, 1, 1); ctx.fillRect(12, 8, 1, 1);
    });

    // 209: Magnetic Boss Summoner — purple housing with a red/blue polarity core.
    withTile(209, () => {
        fill('#3a1054');
        ctx.fillStyle = '#7b1fa2';
        ctx.fillRect(1, 1, 14, 14);
        ctx.fillStyle = '#2a0a3e';
        ctx.fillRect(3, 3, 10, 10);
        ctx.fillStyle = '#ff4030'; ctx.fillRect(4, 6, 3, 4);
        ctx.fillStyle = '#3060ff'; ctx.fillRect(9, 6, 3, 4);
        ctx.fillStyle = '#e0ccff'; ctx.fillRect(7, 4, 2, 8);
    });

    // 213: Magnetite Bricks — dark metallic brick courses with offset joints.
    withTile(213, () => {
        fill('#43434f');
        ctx.fillStyle = '#2c2c36';
        for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);                 // horizontal mortar
        for (let y = 0; y < 16; y += 8) { ctx.fillRect(8, y, 1, 4); ctx.fillRect(0, y + 4, 1, 4); ctx.fillRect(8, y + 4, 1, 4); }
        ctx.fillStyle = '#56566a';
        for (let i = 0; i < 16; i++) ctx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 16), 1, 1);
        ctx.fillStyle = '#5b4a78';
        ctx.fillRect(3, 1, 1, 1); ctx.fillRect(11, 9, 1, 1);
    });

    // 214: Chiseled Magnetite — framed panel with an engraved polarity sigil.
    withTile(214, () => {
        fill('#4a4a58');
        ctx.fillStyle = '#2c2c36';
        ctx.fillRect(1, 1, 14, 14);
        ctx.fillStyle = '#43434f';
        ctx.fillRect(3, 3, 10, 10);
        ctx.fillStyle = '#ff4030'; ctx.fillRect(6, 5, 4, 1); ctx.fillRect(7, 4, 2, 3);   // '+' (red)
        ctx.fillStyle = '#3060ff'; ctx.fillRect(6, 10, 4, 1);                            // '-' (blue)
        ctx.fillStyle = '#6a6a80';
        ctx.fillRect(2, 2, 1, 1); ctx.fillRect(13, 2, 1, 1); ctx.fillRect(2, 13, 1, 1); ctx.fillRect(13, 13, 1, 1);
    });

    sanitizeCutoutTiles(ctx, size, cols, rows, CUTOUT_TILE_CONFIGS);

    const paddedAtlas = createPaddedAtlasCanvas(rawCanvas, rows, ATLAS_COLS, ATLAS_PADDING, ATLAS_STRIDE);
    if (!paddedAtlas) return document.createElement('canvas');

    cachedAtlasDimensions = { width: paddedAtlas.width, height: paddedAtlas.height };
    cachedAtlasURL = paddedAtlas.canvas.toDataURL();
    return paddedAtlas.canvas;
};

/**
 * EXPORT ATLAS DEBUG PNG
 * Overlays tile borders and indices for validation.
 * Call from browser console.
 */
export const exportAtlasDebugPNG = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const { width, height } = getAtlasDimensions();
    const url = getAtlasURL();
    if (!url) return console.error('Atlas not generated yet.');
    openAtlasDebugWindow(url, width, height, ATLAS_COLS, ATLAS_PADDING, ATLAS_STRIDE);
};
