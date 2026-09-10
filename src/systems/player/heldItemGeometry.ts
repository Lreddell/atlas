import * as THREE from 'three';
import { BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import { isSpriteRenderedType } from '../../data/spriteBlocks';
import { getAtlasDimensions, ATLAS_STRIDE, ATLAS_PADDING, ATLAS_RAW_TILE_SIZE } from '../../utils/textures';
import { resolveTexture } from '../world/textureResolver';
import { buildShapedBlockGeometry } from '../world/shapedGeometry';

export function createHeldItemGeometry(itemType: BlockType | null): THREE.BufferGeometry | null {
    if (!itemType) return null;
    const def = BLOCKS[itemType];

    // Slabs / stairs: build the real partial-box shape in hand instead of a cube.
    if (def.shape) {
        const parentType = (def.textureParent ?? itemType) as BlockType;
        return buildShapedBlockGeometry(itemType, parentType, 0.4);
    }

    const is2D = isSpriteRenderedType(itemType);

    if (!is2D) {
        const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const uvAttribute = geo.attributes.uv;
        const directions = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
        const vectors = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];

        directions.forEach((dir, i) => {
            const vec = vectors[i];
            const { uvs } = resolveTexture(itemType, dir, vec[0], vec[1], vec[2], 0);
            const base = i * 4;
            uvAttribute.setXY(base + 0, uvs[6], uvs[7]);
            uvAttribute.setXY(base + 1, uvs[4], uvs[5]);
            uvAttribute.setXY(base + 2, uvs[0], uvs[1]);
            uvAttribute.setXY(base + 3, uvs[2], uvs[3]);
        });
        uvAttribute.needsUpdate = true;
        return geo;
    } else {
         const geo = new THREE.PlaneGeometry(0.5, 0.5);
         const uvAttribute = geo.attributes.uv;
         const texIdx = def.textureSlot || 0;
         const { width, height } = getAtlasDimensions();

         const col = texIdx % ATLAS_COLS;
         const row = Math.floor(texIdx / ATLAS_COLS);
         const pxX = col * ATLAS_STRIDE + ATLAS_PADDING;
         const pxY = row * ATLAS_STRIDE + ATLAS_PADDING;

         const u0 = pxX / width;
         const u1 = (pxX + ATLAS_RAW_TILE_SIZE) / width;
         const v1 = 1.0 - (pxY / height);
         const v0 = 1.0 - ((pxY + ATLAS_RAW_TILE_SIZE) / height);

         uvAttribute.setXY(0, u0, v1);
         uvAttribute.setXY(1, u1, v1);
         uvAttribute.setXY(2, u0, v0);
         uvAttribute.setXY(3, u1, v0);
         uvAttribute.needsUpdate = true;
         return geo;
    }
}
