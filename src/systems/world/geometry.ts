
import { CHUNK_SIZE, WORLD_HEIGHT, MIN_Y, MAX_Y } from '../../constants';
import { FACE_DATA } from './worldConstants';
import { BlockType } from '../../types';
import { BLOCKS, ATLAS_COLS } from '../../data/blocks';
import { index3D } from './worldCoords';
import { resolveTexture } from './textureResolver';
import { getOpacity } from './blockProps';
import { getAtlasDimensions, ATLAS_RAW_TILE_SIZE, ATLAS_PADDING, ATLAS_STRIDE } from '../../utils/textures';

export interface NeighborData {
    left?: Uint8Array;
    right?: Uint8Array;
    front?: Uint8Array;
    back?: Uint8Array;
}

export interface NeighborLight {
    center: Uint8Array;
    left?: Uint8Array;
    right?: Uint8Array;
    front?: Uint8Array;
    back?: Uint8Array;
}

export interface GeometryAttributes {
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array;
    colors: Float32Array;
    indices: Uint32Array;
}

export interface GeometryResult {
    opaque: GeometryAttributes;
    cutout: GeometryAttributes;
    transparent: GeometryAttributes;
}

// Pre-allocate buffers to avoid garbage collection during meshing
// 100k faces per buffer type is ~4.5MB per attribute, sufficient for very complex chunks
const MAX_FACES = 100000;
const MAX_VERTICES = MAX_FACES * 4;
const MAX_INDICES = MAX_FACES * 6;

class GeometryBuffer {
    positions = new Float32Array(MAX_VERTICES * 3);
    normals = new Float32Array(MAX_VERTICES * 3);
    uvs = new Float32Array(MAX_VERTICES * 2);
    colors = new Float32Array(MAX_VERTICES * 3);
    indices = new Uint32Array(MAX_INDICES);
    
    vCount = 0;
    iCount = 0;

    reset() {
        this.vCount = 0;
        this.iCount = 0;
    }

    pushQuad(
        p1x: number, p1y: number, p1z: number,
        p2x: number, p2y: number, p2z: number,
        p3x: number, p3y: number, p3z: number,
        p4x: number, p4y: number, p4z: number,
        nx: number, ny: number, nz: number,
        uMin: number, uMax: number, vMin: number, vMax: number,
        r: number, g: number, b: number
    ) {
        if (this.vCount + 4 > MAX_VERTICES) return;

        let vp = this.vCount * 3;
        let up = this.vCount * 2;
        let ip = this.iCount;
        const vBase = this.vCount;

        // Vertex 1
        this.positions[vp] = p1x; this.positions[vp+1] = p1y; this.positions[vp+2] = p1z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        this.colors[vp] = r; this.colors[vp+1] = g; this.colors[vp+2] = b;
        this.uvs[up] = uMin; this.uvs[up+1] = vMin; // 0,0

        // Vertex 2
        vp += 3; up += 2;
        this.positions[vp] = p2x; this.positions[vp+1] = p2y; this.positions[vp+2] = p2z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        this.colors[vp] = r; this.colors[vp+1] = g; this.colors[vp+2] = b;
        this.uvs[up] = uMax; this.uvs[up+1] = vMin; // 1,0

        // Vertex 3
        vp += 3; up += 2;
        this.positions[vp] = p3x; this.positions[vp+1] = p3y; this.positions[vp+2] = p3z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        this.colors[vp] = r; this.colors[vp+1] = g; this.colors[vp+2] = b;
        this.uvs[up] = uMax; this.uvs[up+1] = vMax; // 1,1

        // Vertex 4
        vp += 3; up += 2;
        this.positions[vp] = p4x; this.positions[vp+1] = p4y; this.positions[vp+2] = p4z;
        this.normals[vp] = nx; this.normals[vp+1] = ny; this.normals[vp+2] = nz;
        this.colors[vp] = r; this.colors[vp+1] = g; this.colors[vp+2] = b;
        this.uvs[up] = uMin; this.uvs[up+1] = vMax; // 0,1

        // Indices (0, 1, 2,  0, 2, 3)
        this.indices[ip] = vBase;
        this.indices[ip+1] = vBase + 1;
        this.indices[ip+2] = vBase + 2;
        this.indices[ip+3] = vBase;
        this.indices[ip+4] = vBase + 2;
        this.indices[ip+5] = vBase + 3;

        this.vCount += 4;
        this.iCount += 6;
    }

    // Creates copies of the active region to send back
    slice(): GeometryAttributes {
        return {
            positions: this.positions.slice(0, this.vCount * 3),
            normals: this.normals.slice(0, this.vCount * 3),
            uvs: this.uvs.slice(0, this.vCount * 2),
            colors: this.colors.slice(0, this.vCount * 3),
            indices: this.indices.slice(0, this.iCount)
        };
    }
}

// Global scratch buffers reused across calls (safe because synchronous per-worker)
const opaqueBuffer = new GeometryBuffer();
const cutoutBuffer = new GeometryBuffer();
const transparentBuffer = new GeometryBuffer();

const MAX_BLOCK_ID = Math.max(
    ...Object.values(BlockType).filter((v): v is number => typeof v === 'number')
);

const IS_CUTOUT = new Uint8Array(MAX_BLOCK_ID + 1);
const IS_TRANSPARENT = new Uint8Array(MAX_BLOCK_ID + 1);
const IS_CROSS = new Uint8Array(MAX_BLOCK_ID + 1);

[
    BlockType.LEAVES,
    BlockType.SPRUCE_LEAVES,
    BlockType.CHERRY_LEAVES,
    BlockType.BIRCH_LEAVES,
    BlockType.TORCH,
    BlockType.SAPLING,
    BlockType.SPRUCE_SAPLING,
    BlockType.BIRCH_SAPLING,
    BlockType.CHERRY_SAPLING,
    BlockType.LAVA,
    BlockType.BED_FOOT,
    BlockType.BED_HEAD,
    BlockType.DEAD_BUSH,
    BlockType.GRASS_PLANT,
    BlockType.ROSE,
    BlockType.DANDELION,
    BlockType.DEBUG_CROSS,
    BlockType.PINK_FLOWER
].forEach(t => { IS_CUTOUT[t] = 1; });

[
    BlockType.WATER,
    BlockType.GLASS,
    BlockType.ICE
].forEach(t => { IS_TRANSPARENT[t] = 1; });

[
    BlockType.TORCH,
    BlockType.SAPLING,
    BlockType.SPRUCE_SAPLING,
    BlockType.BIRCH_SAPLING,
    BlockType.CHERRY_SAPLING,
    BlockType.DEAD_BUSH,
    BlockType.GRASS_PLANT,
    BlockType.ROSE,
    BlockType.DANDELION,
    BlockType.DEBUG_CROSS,
    BlockType.PINK_FLOWER
].forEach(t => { IS_CROSS[t] = 1; });

function isOpaqueGreedyCandidate(type: BlockType): boolean {
    if (type === BlockType.AIR) return false;
    if (IS_CUTOUT[type] || IS_TRANSPARENT[type] || IS_CROSS[type]) return false;
    const def = BLOCKS[type];
    return !!def && !def.transparent;
}

export function generateGeometryData(
    _cx: number, 
    _cz: number, 
    chunk: Uint8Array, 
    metaData: Uint8Array | undefined,
    neighbors: NeighborData,
    lights: NeighborLight
): GeometryResult {
    // Reset pointers
    opaqueBuffer.reset();
    cutoutBuffer.reset();
    transparentBuffer.reset();
    
    const getLightFast = (x: number, y: number, z: number): number => {
        if (y < MIN_Y || y > MAX_Y) return (15 << 4);
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
            return lights.center[index3D(x, y, z)];
        }
        let t: Uint8Array | undefined;
        let lx = x; let lz = z;
        if (x < 0) { t = lights.left; lx += CHUNK_SIZE; }
        else if (x >= CHUNK_SIZE) { t = lights.right; lx -= CHUNK_SIZE; }
        else if (z < 0) { t = lights.back; lz += CHUNK_SIZE; }
        else if (z >= CHUNK_SIZE) { t = lights.front; lz -= CHUNK_SIZE; }
        if (t && y >= MIN_Y && y <= MAX_Y) {
            const clampedX = Math.max(0, Math.min(CHUNK_SIZE - 1, lx));
            const clampedZ = Math.max(0, Math.min(CHUNK_SIZE - 1, lz));
            return t[index3D(clampedX, y, clampedZ)];
        }
        return (15 << 4);
    };

    const directions = ['right', 'left', 'top', 'bottom', 'front', 'back'] as const;
    const { width: atlasWidth, height: atlasHeight } = getAtlasDimensions();
    const aoScratch = new Float32Array(12);

    const getTypeFast = (x: number, y: number, z: number): BlockType => {
        if (y < MIN_Y || y > MAX_Y) return BlockType.AIR;
        if (x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE) {
            return chunk[index3D(x, y, z)] as BlockType;
        }

        if (x < 0) {
            if (!neighbors.left) return BlockType.AIR;
            const lz = Math.max(0, Math.min(CHUNK_SIZE - 1, z));
            return neighbors.left[index3D(CHUNK_SIZE + x, y, lz)] as BlockType;
        }
        if (x >= CHUNK_SIZE) {
            if (!neighbors.right) return BlockType.AIR;
            const lz = Math.max(0, Math.min(CHUNK_SIZE - 1, z));
            return neighbors.right[index3D(x - CHUNK_SIZE, y, lz)] as BlockType;
        }
        if (z < 0) {
            if (!neighbors.back) return BlockType.AIR;
            const lx = Math.max(0, Math.min(CHUNK_SIZE - 1, x));
            return neighbors.back[index3D(lx, y, CHUNK_SIZE + z)] as BlockType;
        }
        if (z >= CHUNK_SIZE) {
            if (!neighbors.front) return BlockType.AIR;
            const lx = Math.max(0, Math.min(CHUNK_SIZE - 1, x));
            return neighbors.front[index3D(lx, y, z - CHUNK_SIZE)] as BlockType;
        }
        return BlockType.AIR;
    };

    const isAOOccluder = (type: BlockType) => type !== BlockType.AIR && getOpacity(type) >= 2;

    const emitGreedySurface = (y: number, topFace: boolean) => {
        const visited = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        const nY = topFace ? y + 1 : y - 1;
        const dirName = topFace ? 'top' : 'bottom';
        const face = FACE_DATA[dirName];
        const normalY = topFace ? 1 : -1;

        for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const visitIndex = z * CHUNK_SIZE + x;
                if (visited[visitIndex]) continue;

                const type = getTypeFast(x, y, z);
                if (!isOpaqueGreedyCandidate(type)) continue;

                const baseRotation = metaData ? metaData[index3D(x, y, z)] : 0;

                const nType = getTypeFast(x, nY, z);
                if (isOpaqueGreedyCandidate(nType)) continue;

                let width = 1;
                while (x + width < CHUNK_SIZE) {
                    const tx = x + width;
                    const tVisit = z * CHUNK_SIZE + tx;
                    if (visited[tVisit]) break;
                    const tType = getTypeFast(tx, y, z);
                    if (tType !== type) break;
                    const tRotation = metaData ? metaData[index3D(tx, y, z)] : 0;
                    if (tRotation !== baseRotation) break;
                    if (isOpaqueGreedyCandidate(getTypeFast(tx, nY, z))) break;
                    width++;
                }

                let depth = 1;
                outer: while (z + depth < CHUNK_SIZE) {
                    const tz = z + depth;
                    for (let ix = 0; ix < width; ix++) {
                        const tx = x + ix;
                        const tVisit = tz * CHUNK_SIZE + tx;
                        if (visited[tVisit]) break outer;
                        const tType = getTypeFast(tx, y, tz);
                        if (tType !== type) break outer;
                        const tRotation = metaData ? metaData[index3D(tx, y, tz)] : 0;
                        if (tRotation !== baseRotation) break outer;
                        if (isOpaqueGreedyCandidate(getTypeFast(tx, nY, tz))) break outer;
                    }
                    depth++;
                }

                for (let dz = 0; dz < depth; dz++) {
                    for (let dx = 0; dx < width; dx++) {
                        visited[(z + dz) * CHUNK_SIZE + (x + dx)] = 1;
                    }
                }

                const { uvs } = resolveTexture(type, dirName, 0, normalY, 0, baseRotation);

                const c0 = face.corners[0];
                const c1 = face.corners[1];
                const c2 = face.corners[2];
                const c3 = face.corners[3];

                const writeAOColor = (cornerIndex: number, offset: number, tx: number, tz: number) => {
                    const ax1 = face.aoVectors[cornerIndex][0];
                    const ax2 = face.aoVectors[cornerIndex][1];

                    const baseX = tx;
                    const baseY = y + normalY;
                    const baseZ = tz;

                    const rc = getLightFast(baseX, baseY, baseZ);
                    const rs1 = getLightFast(baseX + ax1[0], baseY + ax1[1], baseZ + ax1[2]);
                    const rs2 = getLightFast(baseX + ax2[0], baseY + ax2[1], baseZ + ax2[2]);
                    const rco = getLightFast(
                        baseX + ax1[0] + ax2[0],
                        baseY + ax1[1] + ax2[1],
                        baseZ + ax1[2] + ax2[2]
                    );

                    const s1Occ = isAOOccluder(getTypeFast(baseX + ax1[0], baseY + ax1[1], baseZ + ax1[2])) ? 1 : 0;
                    const s2Occ = isAOOccluder(getTypeFast(baseX + ax2[0], baseY + ax2[1], baseZ + ax2[2])) ? 1 : 0;
                    const cornerOcc = isAOOccluder(getTypeFast(baseX + ax1[0] + ax2[0], baseY + ax1[1] + ax2[1], baseZ + ax1[2] + ax2[2])) ? 1 : 0;
                    const aoOcclusion = (s1Occ === 1 && s2Occ === 1) ? 3 : (s1Occ + s2Occ + cornerOcc);
                    const aoMul = 1.0 - aoOcclusion * 0.14;

                    const sky = (((rc >> 4) & 0xF) + ((rs1 >> 4) & 0xF) + ((rs2 >> 4) & 0xF) + ((rco >> 4) & 0xF)) / 4.0;
                    const block = ((rc & 0xF) + (rs1 & 0xF) + (rs2 & 0xF) + (rco & 0xF)) / 4.0;

                    aoScratch[offset] = (sky / 15.0) * aoMul;
                    aoScratch[offset + 1] = (block / 15.0) * aoMul;
                    aoScratch[offset + 2] = 1.0;
                };

                for (let dz = 0; dz < depth; dz++) {
                    for (let dx = 0; dx < width; dx++) {
                        const tx = x + dx;
                        const tz = z + dz;

                        const p0x = tx + c0[0];
                        const p0y = y + c0[1];
                        const p0z = tz + c0[2];

                        const p1x = tx + c1[0];
                        const p1y = y + c1[1];
                        const p1z = tz + c1[2];

                        const p2x = tx + c2[0];
                        const p2y = y + c2[1];
                        const p2z = tz + c2[2];

                        const p3x = tx + c3[0];
                        const p3y = y + c3[1];
                        const p3z = tz + c3[2];

                        writeAOColor(0, 0, tx, tz);
                        writeAOColor(1, 3, tx, tz);
                        writeAOColor(2, 6, tx, tz);
                        writeAOColor(3, 9, tx, tz);

                        if (opaqueBuffer.vCount + 4 <= MAX_VERTICES) {
                            let vp = opaqueBuffer.vCount * 3;
                            let up = opaqueBuffer.vCount * 2;
                            let ip = opaqueBuffer.iCount;
                            const vBase = opaqueBuffer.vCount;

                            opaqueBuffer.positions[vp] = p0x; opaqueBuffer.positions[vp + 1] = p0y; opaqueBuffer.positions[vp + 2] = p0z;
                            opaqueBuffer.normals[vp] = 0; opaqueBuffer.normals[vp + 1] = normalY; opaqueBuffer.normals[vp + 2] = 0;
                            opaqueBuffer.colors[vp] = aoScratch[0]; opaqueBuffer.colors[vp + 1] = aoScratch[1]; opaqueBuffer.colors[vp + 2] = aoScratch[2];
                            opaqueBuffer.uvs[up] = uvs[0]; opaqueBuffer.uvs[up + 1] = uvs[1];

                            vp += 3; up += 2;
                            opaqueBuffer.positions[vp] = p1x; opaqueBuffer.positions[vp + 1] = p1y; opaqueBuffer.positions[vp + 2] = p1z;
                            opaqueBuffer.normals[vp] = 0; opaqueBuffer.normals[vp + 1] = normalY; opaqueBuffer.normals[vp + 2] = 0;
                            opaqueBuffer.colors[vp] = aoScratch[3]; opaqueBuffer.colors[vp + 1] = aoScratch[4]; opaqueBuffer.colors[vp + 2] = aoScratch[5];
                            opaqueBuffer.uvs[up] = uvs[2]; opaqueBuffer.uvs[up + 1] = uvs[3];

                            vp += 3; up += 2;
                            opaqueBuffer.positions[vp] = p2x; opaqueBuffer.positions[vp + 1] = p2y; opaqueBuffer.positions[vp + 2] = p2z;
                            opaqueBuffer.normals[vp] = 0; opaqueBuffer.normals[vp + 1] = normalY; opaqueBuffer.normals[vp + 2] = 0;
                            opaqueBuffer.colors[vp] = aoScratch[6]; opaqueBuffer.colors[vp + 1] = aoScratch[7]; opaqueBuffer.colors[vp + 2] = aoScratch[8];
                            opaqueBuffer.uvs[up] = uvs[4]; opaqueBuffer.uvs[up + 1] = uvs[5];

                            vp += 3; up += 2;
                            opaqueBuffer.positions[vp] = p3x; opaqueBuffer.positions[vp + 1] = p3y; opaqueBuffer.positions[vp + 2] = p3z;
                            opaqueBuffer.normals[vp] = 0; opaqueBuffer.normals[vp + 1] = normalY; opaqueBuffer.normals[vp + 2] = 0;
                            opaqueBuffer.colors[vp] = aoScratch[9]; opaqueBuffer.colors[vp + 1] = aoScratch[10]; opaqueBuffer.colors[vp + 2] = aoScratch[11];
                            opaqueBuffer.uvs[up] = uvs[6]; opaqueBuffer.uvs[up + 1] = uvs[7];

                            opaqueBuffer.indices[ip] = vBase;
                            opaqueBuffer.indices[ip + 1] = vBase + 1;
                            opaqueBuffer.indices[ip + 2] = vBase + 2;
                            opaqueBuffer.indices[ip + 3] = vBase;
                            opaqueBuffer.indices[ip + 4] = vBase + 2;
                            opaqueBuffer.indices[ip + 5] = vBase + 3;

                            opaqueBuffer.vCount += 4;
                            opaqueBuffer.iCount += 6;
                        }
                    }
                }
            }
        }
    };

    for (let y = MIN_Y; y < MIN_Y + WORLD_HEIGHT; y++) {
        emitGreedySurface(y, true);
        emitGreedySurface(y, false);
    }

    for (let y = MIN_Y; y < MIN_Y + WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const index = index3D(x, y, z);
          const type = chunk[index] as BlockType;
          if (type === BlockType.AIR) continue;

          let targetBuffer = opaqueBuffer;
          const def = BLOCKS[type];
          
          if (!def) continue;
          
          if (IS_CUTOUT[type] === 1) {
              targetBuffer = cutoutBuffer;
          } else if (IS_TRANSPARENT[type] === 1) {
              targetBuffer = transparentBuffer;
          }
          
          const isCross = IS_CROSS[type] === 1;

          if (isCross) {
              const raw = getLightFast(x, y, z);
              const r = ((raw >> 4) & 0xF) / 15.0;
              const g = (raw & 0xF) / 15.0;
              
              const texIdx = def.textureSlot || 0;
              
              const col = texIdx % ATLAS_COLS;
              const row = Math.floor(texIdx / ATLAS_COLS);
              
              const pxX = col * ATLAS_STRIDE + ATLAS_PADDING;
              const pxY = row * ATLAS_STRIDE + ATLAS_PADDING;
              
              const u0 = pxX / atlasWidth;
              const u1 = (pxX + ATLAS_RAW_TILE_SIZE) / atlasWidth;
              const v1 = 1.0 - (pxY / atlasHeight);
              const v0 = 1.0 - ((pxY + ATLAS_RAW_TILE_SIZE) / atlasHeight);

              const min = 0.0;
              const max = 1.0;
              
              // Cross 1
              targetBuffer.pushQuad(
                  x+min, y, z+min, 
                  x+max, y, z+max, 
                  x+max, y+1, z+max, 
                  x+min, y+1, z+min, 
                  0, 1, 0, 
                  u0, u1, v0, v1, r, g, 1.0
              );
              // Cross 2
              targetBuffer.pushQuad(
                  x+min, y, z+max, 
                  x+max, y, z+min, 
                  x+max, y+1, z+min, 
                  x+min, y+1, z+max, 
                  0, 1, 0, 
                  u0, u1, v0, v1, r, g, 1.0
              );
              continue;
          }
          
          const rotation = metaData ? metaData[index] : 0;
          const isFluid = type === BlockType.WATER || type === BlockType.LAVA;
          const isBed = type === BlockType.BED_FOOT || type === BlockType.BED_HEAD;
          const isGreedyOpaque = isOpaqueGreedyCandidate(type);
          
          let blockHeight = 1.0;
          
          if (isBed) {
              blockHeight = 0.5; 
          } else if (isFluid) {
              let submerged = false;
              if (y < MAX_Y) {
                  const upIndex = index + (CHUNK_SIZE * CHUNK_SIZE);
                  if (upIndex < chunk.length && chunk[upIndex] === type) {
                      submerged = true;
                  }
              }

              if (submerged) {
                  blockHeight = 1.0;
              } else {
                  const level = rotation & 0xF; 
                  if (level === 0) blockHeight = 0.88; 
                  else if (level >= 8) blockHeight = 1.0; 
                  else blockHeight = (8 - level) / 9.0; 
              }
          }

          for (const dir of directions) {
             if (isBed && dir === 'bottom') continue;
                 if (isGreedyOpaque && (dir === 'top' || dir === 'bottom')) continue;

             const face = FACE_DATA[dir];
             const dx = face.dir[0]; const dy = face.dir[1]; const dz = face.dir[2];

             let nType: BlockType = BlockType.AIR;
             const nx = x + dx; const ny = y + dy; const nz = z + dz;
             
             if (ny < MIN_Y || ny > MAX_Y) nType = BlockType.AIR;
             else if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE) {
                 nType = chunk[index3D(nx, ny, nz)] as BlockType;
             } else {
                 if (nx < 0) nType = neighbors.left ? neighbors.left[index3D(CHUNK_SIZE + nx, ny, nz)] as BlockType : BlockType.AIR;
                 else if (nx >= CHUNK_SIZE) nType = neighbors.right ? neighbors.right[index3D(nx - CHUNK_SIZE, ny, nz)] as BlockType : BlockType.AIR;
                 else if (nz < 0) nType = neighbors.back ? neighbors.back[index3D(nx, ny, CHUNK_SIZE + nz)] as BlockType : BlockType.AIR;
                 else if (nz >= CHUNK_SIZE) nType = neighbors.front ? neighbors.front[index3D(nx, ny, nz - CHUNK_SIZE)] as BlockType : BlockType.AIR;
             }
             
             const nDef = BLOCKS[nType];
             const nIsFluid = nType === BlockType.WATER || nType === BlockType.LAVA;

             let visible = false;

             if (isFluid) {
                 if (nType === type) visible = false;
                 else if ((nType as BlockType) === BlockType.AIR) visible = true;
                 else if (nIsFluid && nType !== type) visible = true;
                 else if (IS_CUTOUT[nType] === 1) visible = true;
                 else if (IS_TRANSPARENT[nType] === 1 && nType !== type) visible = true;
                 else if (!nDef) visible = true; 
                 else if (dir === 'top' && blockHeight < 1.0) visible = true;
                 else visible = false;

             } else {
                 if ((nType as BlockType) === BlockType.AIR) visible = true;
                 else if (nIsFluid) visible = true; 
                 else if (!nDef) visible = true; 
                 else if (IS_CUTOUT[type] === 1 && IS_CUTOUT[nType] === 1 && type === nType) visible = false;
                 else if (def.transparent && IS_CUTOUT[nType] === 1 && type !== nType) visible = true;
                 else if (def.transparent && IS_TRANSPARENT[nType] === 1 && type !== nType) visible = true;
                 else if (def.transparent) visible = false;
                 else if (!def.transparent && nDef.transparent) visible = true;
                 else if (isBed && (nType as BlockType) === BlockType.AIR) visible = true; 
             }
             
             if (visible) {
                 const { uvs } = resolveTexture(type, dir, dx, dy, dz, rotation);

                 const c0 = face.corners[0];
                 const c1 = face.corners[1];
                 const c2 = face.corners[2];
                 const c3 = face.corners[3];

                 // Adjust height for fluids/beds
                 let cy0 = c0[1]; let cy1 = c1[1]; let cy2 = c2[1]; let cy3 = c3[1];
                 
                 if ((isFluid || isBed) && dir !== 'bottom') {
                     if (cy0 === 1) cy0 = blockHeight;
                     if (cy1 === 1) cy1 = blockHeight;
                     if (cy2 === 1) cy2 = blockHeight;
                     if (cy3 === 1) cy3 = blockHeight;
                 }

                 // AO and Light Calculation per vertex
                 // Calculate lighting for each vertex (0, 1, 2, 3) corresponding to corner indices
                 const writeAOColor = (cornerIndex: number, offset: number) => {
                     const ax1 = face.aoVectors[cornerIndex][0];
                     const ax2 = face.aoVectors[cornerIndex][1];
                     
                     const rc = getLightFast(nx, ny, nz);
                     const rs1 = getLightFast(nx + ax1[0], ny + ax1[1], nz + ax1[2]);
                     const rs2 = getLightFast(nx + ax2[0], ny + ax2[1], nz + ax2[2]);
                     const rco = getLightFast(nx + ax1[0] + ax2[0], ny + ax1[1] + ax2[1], nz + ax1[2] + ax2[2]);

                     const s1Occ = isAOOccluder(getTypeFast(nx + ax1[0], ny + ax1[1], nz + ax1[2])) ? 1 : 0;
                     const s2Occ = isAOOccluder(getTypeFast(nx + ax2[0], ny + ax2[1], nz + ax2[2])) ? 1 : 0;
                     const cornerOcc = isAOOccluder(getTypeFast(nx + ax1[0] + ax2[0], ny + ax1[1] + ax2[1], nz + ax1[2] + ax2[2])) ? 1 : 0;
                     const aoOcclusion = (s1Occ === 1 && s2Occ === 1) ? 3 : (s1Occ + s2Occ + cornerOcc);
                     const aoMul = 1.0 - aoOcclusion * 0.14;

                     const sky = (((rc >> 4) & 0xF) + ((rs1 >> 4) & 0xF) + ((rs2 >> 4) & 0xF) + ((rco >> 4) & 0xF)) / 4.0;
                     const block = ((rc & 0xF) + (rs1 & 0xF) + (rs2 & 0xF) + (rco & 0xF)) / 4.0;
                     aoScratch[offset] = (sky / 15.0) * aoMul;
                     aoScratch[offset + 1] = (block / 15.0) * aoMul;
                     aoScratch[offset + 2] = 1.0;
                 };

                 writeAOColor(0, 0);
                 writeAOColor(1, 3);
                 writeAOColor(2, 6);
                 writeAOColor(3, 9);

                 // Correct texture UVs
                 let u0 = uvs[0], v0 = uvs[1];
                 let u1 = uvs[2], v1 = uvs[3];
                 let u2 = uvs[4], v2 = uvs[5];
                 let u3 = uvs[6], v3 = uvs[7];

                 if (isBed && dir !== 'top' && dir !== 'bottom') {
                     // Simple bed side mapping adjustment
                     const vTop = uvs[1];
                     const vBottom = uvs[5];
                     const vMid = (vTop + vBottom) * 0.5;
                     
                     // If vertex is high, it maps to vMid or vTop?
                     // Standard cube side: BL(0), BR(1), TR(2), TL(3).
                     // BL(0) y=0 -> vBottom. BR(1) y=0 -> vBottom.
                     // TR(2) y=1 -> vTop. TL(3) y=1 -> vTop.
                     // Bed: y=0.5. 
                     if (cy0 > 0.1) v0 = vMid; else v0 = vBottom;
                     if (cy1 > 0.1) v1 = vMid; else v1 = vBottom;
                     if (cy2 > 0.1) v2 = vMid; else v2 = vBottom;
                     if (cy3 > 0.1) v3 = vMid; else v3 = vBottom;
                 }

                 // Push Quad with per-vertex colors
                 // Note: pushQuad expects uniform color, but we need AO per vertex.
                 // Optimization constraint: GeometryBuffer.pushQuad assumes 1 color for all 4 verts.
                 // To support AO, we need to modify pushQuad or manually push. 
                 // Let's modify pushQuad to take 4 colors or just write directly here for speed.
                 
                 // Manually push to support AO variations
                 if (targetBuffer.vCount + 4 <= MAX_VERTICES) {
                     let vp = targetBuffer.vCount * 3;
                     let up = targetBuffer.vCount * 2;
                     let ip = targetBuffer.iCount;
                     const vBase = targetBuffer.vCount;

                     // V0
                     targetBuffer.positions[vp] = x + c0[0]; targetBuffer.positions[vp+1] = y + cy0; targetBuffer.positions[vp+2] = z + c0[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     targetBuffer.colors[vp] = aoScratch[0]; targetBuffer.colors[vp+1] = aoScratch[1]; targetBuffer.colors[vp+2] = aoScratch[2];
                     targetBuffer.uvs[up] = u0; targetBuffer.uvs[up+1] = v0;

                     // V1
                     vp+=3; up+=2;
                     targetBuffer.positions[vp] = x + c1[0]; targetBuffer.positions[vp+1] = y + cy1; targetBuffer.positions[vp+2] = z + c1[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     targetBuffer.colors[vp] = aoScratch[3]; targetBuffer.colors[vp+1] = aoScratch[4]; targetBuffer.colors[vp+2] = aoScratch[5];
                     targetBuffer.uvs[up] = u1; targetBuffer.uvs[up+1] = v1;

                     // V2
                     vp+=3; up+=2;
                     targetBuffer.positions[vp] = x + c2[0]; targetBuffer.positions[vp+1] = y + cy2; targetBuffer.positions[vp+2] = z + c2[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     targetBuffer.colors[vp] = aoScratch[6]; targetBuffer.colors[vp+1] = aoScratch[7]; targetBuffer.colors[vp+2] = aoScratch[8];
                     targetBuffer.uvs[up] = u2; targetBuffer.uvs[up+1] = v2;

                     // V3
                     vp+=3; up+=2;
                     targetBuffer.positions[vp] = x + c3[0]; targetBuffer.positions[vp+1] = y + cy3; targetBuffer.positions[vp+2] = z + c3[2];
                     targetBuffer.normals[vp] = dx; targetBuffer.normals[vp+1] = dy; targetBuffer.normals[vp+2] = dz;
                     targetBuffer.colors[vp] = aoScratch[9]; targetBuffer.colors[vp+1] = aoScratch[10]; targetBuffer.colors[vp+2] = aoScratch[11];
                     targetBuffer.uvs[up] = u3; targetBuffer.uvs[up+1] = v3;

                     // Indices
                     targetBuffer.indices[ip] = vBase;
                     targetBuffer.indices[ip+1] = vBase+1;
                     targetBuffer.indices[ip+2] = vBase+2;
                     targetBuffer.indices[ip+3] = vBase;
                     targetBuffer.indices[ip+4] = vBase+2;
                     targetBuffer.indices[ip+5] = vBase+3;

                     targetBuffer.vCount += 4;
                     targetBuffer.iCount += 6;
                 }
             }
          }
        }
      }
    }
    
    return {
        opaque: opaqueBuffer.slice(),
        cutout: cutoutBuffer.slice(),
        transparent: transparentBuffer.slice()
    };
}
