
import { BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import { getAtlasDimensions, ATLAS_RAW_TILE_SIZE, ATLAS_PADDING, ATLAS_STRIDE } from '../../utils/textures';

export function resolveTexture(
    type: BlockType, 
    _dir: 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back', 
    dx: number, 
    dy: number, 
    dz: number, 
    rotation: number = 0
): { texIdx: number, uvs: number[] } {
    const def = BLOCKS[type];
    let texIdx = def.textureSlot || 0;
    
    // UV Rotation: 0=0, 1=90, 2=180, 3=270
    let uvRot = 0; 

    // --- Block Specific Texture Override Logic ---

    // 1. Grass Block
    if (type === BlockType.GRASS) {
        if (dy === 1) texIdx = 1; // Top
        else if (dy === -1) texIdx = 0; // Bottom
        else texIdx = 12; // Side
    } 
    // 2. Snowy Grass
    else if (type === BlockType.SNOWY_GRASS) {
        if (dy === 1) texIdx = 19; 
        else if (dy === -1) texIdx = 0; 
        else texIdx = 25; 
    }
    // 3. Logs (Oak, Spruce, Cherry, Birch) & Basalt
    else if (type === BlockType.LOG || type === BlockType.SPRUCE_LOG || type === BlockType.CHERRY_LOG || type === BlockType.BIRCH_LOG || type === BlockType.BASALT) {
        let topTex = 13; // Generic Log Top
        let sideTex = 7; // Generic Log Side
        
        if (type === BlockType.SPRUCE_LOG) { sideTex = 23; }
        else if (type === BlockType.CHERRY_LOG) { sideTex = 74; topTex = 75; }
        else if (type === BlockType.BIRCH_LOG) { sideTex = 87; topTex = 88; }
        else if (type === BlockType.BASALT) { sideTex = 83; topTex = 84; }
        
        // Rotation 0: Upright (Y)
        if (rotation === 0) {
            if (dy !== 0) texIdx = topTex;
            else texIdx = sideTex;
        }
        // Rotation 1: X-Axis
        else if (rotation === 1) {
            if (dx !== 0) texIdx = topTex;
            else {
                texIdx = sideTex;
                uvRot = 1; // Rotate 90 deg to align grain
            }
        }
        // Rotation 2: Z-Axis
        else if (rotation === 2) {
            if (dz !== 0) texIdx = topTex;
            else {
                texIdx = sideTex;
                // Only rotate side faces (X faces)
                if (dx !== 0) uvRot = 1; 
            }
        }
    }
    // 4. Furnace
    else if (type === BlockType.FURNACE || type === BlockType.FURNACE_ACTIVE) {
        const frontTex = type === BlockType.FURNACE_ACTIVE ? 47 : 44;
        const sideTex = 45;
        // Rotation: 0=South(Z+), 1=North(Z-), 2=East(X+), 3=West(X-)
        // Logic inverted to ensure it faces the player
        
        let isFront = false;
        if (rotation === 0 && dz === 1) isFront = true;
        else if (rotation === 1 && dz === -1) isFront = true;
        else if (rotation === 2 && dx === 1) isFront = true;
        else if (rotation === 3 && dx === -1) isFront = true;

        if (isFront) texIdx = frontTex;
        else texIdx = sideTex;
    }
    // 5. Crafting Table
    else if (type === BlockType.CRAFTING_TABLE) {
        if (dy === 1) texIdx = 43; // Top (Grid)
        else if (dy === -1) texIdx = 8; // Bottom (Planks)
        else texIdx = 42; // Side (Tools)
    }
    // 6. Chest
    else if (type === BlockType.CHEST) {
        // Front Face Logic (Same as Furnace)
        let isFront = false;
        if (rotation === 0 && dz === 1) isFront = true;
        else if (rotation === 1 && dz === -1) isFront = true;
        else if (rotation === 2 && dx === 1) isFront = true;
        else if (rotation === 3 && dx === -1) isFront = true;

        if (dy !== 0) texIdx = 54; // Top/Bottom
        else if (isFront) texIdx = 52; // Front (Latch)
        else texIdx = 53; // Side/Back
    }
    // 7. Sandstone
    else if (type === BlockType.SANDSTONE || type === BlockType.RED_SANDSTONE) {
        // Red sandstone has specific top/bottom if we want, for now reuse top logic from normal sandstone or generic
        if (type === BlockType.SANDSTONE) {
            if (dy !== 0) texIdx = 28; 
            else texIdx = 18; 
        } else {
            // For red sandstone, just use same texture all around or make top different if we draw it
            // Current atlas only has side drawn at 79. Let's use 79 for all sides for now or reuse 28 tinted?
            // Let's stick to 79 for all faces for Red Sandstone currently as we didn't draw a specific top
            texIdx = 79;
        }
    }
    
    // --- UV Calculation with PADDING ---
    const { width, height } = getAtlasDimensions();
    
    const col = texIdx % ATLAS_COLS;
    const row = Math.floor(texIdx / ATLAS_COLS);

    // Coordinate of the START of the actual texture content (skipping padding)
    const pxX = col * ATLAS_STRIDE + ATLAS_PADDING;
    const pxY = row * ATLAS_STRIDE + ATLAS_PADDING;
    
    // UVs are 0..1. Map exactly to the inner content 16x16
    const u0 = pxX / width;
    const u1 = (pxX + ATLAS_RAW_TILE_SIZE) / width;
    
    // Vertical is inverted in ThreeJS UV space (0 bottom, 1 top)
    // Canvas Top = 0.
    // Texture Top Y = pxY. Texture Bottom Y = pxY + 16.
    // V1 (Top) = 1.0 - (pxY / height)
    // V0 (Bottom) = 1.0 - ((pxY + 16) / height)
    
    const v1 = 1.0 - (pxY / height); 
    const v0 = 1.0 - ((pxY + ATLAS_RAW_TILE_SIZE) / height); 
    
    // Default Quad: [BL, BR, TR, TL] -> [u0, v0], [u1, v0], [u1, v1], [u0, v1]
    let uvs = [u0, v0, u1, v0, u1, v1, u0, v1];

    // --- Apply UV Rotation ---
    if (uvRot === 1) { // 90 deg
        uvs = [u1, v0, u1, v1, u0, v1, u0, v0];
    } else if (uvRot === 2) { // 180 deg
        uvs = [u1, v1, u0, v1, u0, v0, u1, v0];
    } else if (uvRot === 3) { // 270 deg
        uvs = [u0, v1, u0, v0, u1, v0, u1, v1];
    }

    // --- Special Bed Logic (Preserving Complex UVs) ---
    if (type === BlockType.BED_FOOT || type === BlockType.BED_HEAD) {
        // Since we are using standard UV blocks, we re-calculate specific bed UVs similarly
        const calcBedUVs = (tIdx: number) => {
            const bCol = tIdx % ATLAS_COLS; 
            const bRow = Math.floor(tIdx / ATLAS_COLS);
            const bX = bCol * ATLAS_STRIDE + ATLAS_PADDING;
            const bY = bRow * ATLAS_STRIDE + ATLAS_PADDING;
            const bu0 = bX / width;
            const bu1 = (bX + ATLAS_RAW_TILE_SIZE) / width;
            const bv1 = 1.0 - (bY / height);
            const bv0 = 1.0 - ((bY + ATLAS_RAW_TILE_SIZE) / height);
            return { bu0, bu1, bv0, bv1 };
        };

        if (dy === 1) {
            texIdx = type === BlockType.BED_HEAD ? 66 : 65;
            const { bu0, bu1, bv0, bv1 } = calcBedUVs(texIdx);
            
            // Bed Top Rotation Logic
             if (rotation === 1) { // North
                 uvs = [bu0, bv0, bu1, bv0, bu1, bv1, bu0, bv1];
             } else if (rotation === 0) { // South
                 uvs = [bu1, bv1, bu0, bv1, bu0, bv0, bu1, bv0];
             } else if (rotation === 2) { // East
                 uvs = [bu1, bv0, bu1, bv1, bu0, bv1, bu0, bv0];
             } else if (rotation === 3) { // West
                 uvs = [bu0, bv1, bu0, bv0, bu1, bv0, bu1, bv1];
             }
        } else if (dy === -1) {
            texIdx = 8; // Planks
            const { bu0, bu1, bv0, bv1 } = calcBedUVs(texIdx);
            uvs = [bu0, bv0, bu1, bv0, bu1, bv1, bu0, bv1];
        } else {
            // Side logic
            texIdx = 68; // Default side
            let faceDir = -1;
            if (dz === 1) faceDir = 0;
            else if (dz === -1) faceDir = 1;
            else if (dx === 1) faceDir = 2; 
            else if (dx === -1) faceDir = 3;
            
            const isHead = type === BlockType.BED_HEAD;
            if (faceDir === rotation) texIdx = isHead ? 70 : 71;
            else if (faceDir !== -1 && ((rotation === 0 && faceDir === 1) || (rotation === 1 && faceDir === 0) || (rotation === 2 && faceDir === 3) || (rotation === 3 && faceDir === 2))) texIdx = isHead ? 71 : 70;
            
            const { bu0, bu1, bv0, bv1 } = calcBedUVs(texIdx);
            uvs = [bu0, bv0, bu1, bv0, bu1, bv1, bu0, bv1];
        }
    }

    return { texIdx, uvs };
}