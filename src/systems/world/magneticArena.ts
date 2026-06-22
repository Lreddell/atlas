// Magnetic Warden arena — a dedicated, deterministic voxel-structure generator.
//
// The arena is the monumental centre of every Magnetic Fields biome instance: a
// large octagonal magnetite fortress with a battlemented outer wall, a wide
// terrace, a lava moat, four tall alternating-polarity climb towers rising from
// the lava (shield crystal on each), and the boss summoner on a raised central
// pedestal. It reserves and fills its whole volume so no caves/terrain cut through.
//
// It is written as composable sub-builders driven by a clipped `setBlock` so each
// world chunk only generates the slice of the structure that overlaps it (the same
// deterministic call from every chunk produces one seamless landmark).

import { BlockType } from '../../types';

// --- Centralized dimensions (all radii in blocks, relative to the centre) ---
export const ARENA_OUTER_RADIUS = 72;        // octagonal footprint → ~150 across
export const ARENA_PROTECTED_RADIUS = 80;    // reserved volume (airspace clear + no caves)
export const ARENA_FOUNDATION_DEPTH = 24;    // solid fill below the base
export const ARENA_WALL_HEIGHT = 11;         // outer rim wall height
export const ARENA_RIM_INNER = 64;           // rim wall band: [RIM_INNER, OUTER]
export const ARENA_TERRACE_INNER = 46;       // terrace floor band: [TERRACE_INNER, RIM_INNER)
export const ARENA_LAVA_OUTER_RADIUS = 44;   // lava moat band: (LAVA_INNER, LAVA_OUTER)
export const ARENA_LAVA_INNER_RADIUS = 28;
export const ARENA_CENTRAL_RADIUS = 26;      // central fight platform
export const ARENA_PILLAR_RADIUS = 36;       // tower centres (in the lava)
export const ARENA_PILLAR_HALF = 3;          // 7×7 towers
export const ARENA_PILLAR_HEIGHT = 26;       // tower top above the base
export const ARENA_MOAT_DEPTH = 9;           // lava depth
export const ARENA_PILLAR_COUNT = 4;

export interface ArenaCtx {
    /** Place a block at world (x,y,z); implementations clip to the current chunk. */
    setBlock: (x: number, y: number, z: number, type: BlockType) => void;
    /** Chunk world bounds (inclusive) so builders can clip their loops. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

// Octagon membership (a square with chamfered corners) for the footprint/wall.
const inOctagon = (adx: number, adz: number, r: number): boolean =>
    Math.max(adx, adz) <= r && adx + adz <= Math.round(r * 1.34);

/** Pillar centre for tower `i`, on the diagonals so it sits in the lava ring. */
export function arenaPillarCenter(centerX: number, centerZ: number, i: number): { x: number; z: number } {
    const ang = Math.PI / 4 + (i / ARENA_PILLAR_COUNT) * Math.PI * 2;
    return {
        x: centerX + Math.round(Math.cos(ang) * ARENA_PILLAR_RADIUS),
        z: centerZ + Math.round(Math.sin(ang) * ARENA_PILLAR_RADIUS),
    };
}

/** Alternating polarity per tower (1 = positive/red, -1 = negative/blue). */
export const arenaPillarPolarity = (i: number): number => (i % 2 === 0 ? 1 : -1);

/**
 * Generate (the part of) the Magnetic Warden arena that overlaps this chunk.
 * centerX/centerZ = instance centre, baseY = plateau surface Y.
 */
export function generateMagneticWardenArena(
    centerX: number,
    centerZ: number,
    baseY: number,
    ctx: ArenaCtx,
): void {
    clearArenaAirspace(centerX, centerZ, baseY, ctx);
    buildProtectedFoundationVolume(centerX, centerZ, baseY, ctx);
    buildOuterFoundation(centerX, centerZ, baseY, ctx);
    buildOuterTerrace(centerX, centerZ, baseY, ctx);
    buildOuterRim(centerX, centerZ, baseY, ctx);
    buildLavaMoat(centerX, centerZ, baseY, ctx);
    buildCentralPlatform(centerX, centerZ, baseY, ctx);
    buildLaunchRoutes(centerX, centerZ, baseY, ctx);
    buildMagneticPillarTowers(centerX, centerZ, baseY, ctx);
    buildShieldCrystalPedestals(centerX, centerZ, baseY, ctx);
    buildBossSummoner(centerX, centerZ, baseY, ctx);
}

// Iterate the chunk∩(centre±r) columns, invoking fn with world x/z and |dx|,|dz|,dist.
function forColumns(
    centerX: number, centerZ: number, r: number, ctx: ArenaCtx,
    fn: (wx: number, wz: number, adx: number, adz: number, dist: number) => void,
): void {
    const x0 = Math.max(centerX - r, ctx.minX);
    const x1 = Math.min(centerX + r, ctx.maxX);
    const z0 = Math.max(centerZ - r, ctx.minZ);
    const z1 = Math.min(centerZ + r, ctx.maxZ);
    for (let wx = x0; wx <= x1; wx++) {
        const dx = wx - centerX;
        for (let wz = z0; wz <= z1; wz++) {
            const dz = wz - centerZ;
            fn(wx, wz, Math.abs(dx), Math.abs(dz), Math.sqrt(dx * dx + dz * dz));
        }
    }
}

const fillColumn = (ctx: ArenaCtx, wx: number, y0: number, y1: number, wz: number, type: BlockType): void => {
    for (let y = y0; y <= y1; y++) ctx.setBlock(wx, y, wz, type);
};

// 1. Clear everything above the base across the reserved volume (trees/terrain).
function clearArenaAirspace(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const top = baseY + ARENA_WALL_HEIGHT + ARENA_PILLAR_HEIGHT + 6;
    forColumns(centerX, centerZ, ARENA_PROTECTED_RADIUS, ctx, (wx, wz, adx, adz) => {
        if (!inOctagon(adx, adz, ARENA_PROTECTED_RADIUS)) return;
        fillColumn(ctx, wx, baseY + 1, top, wz, BlockType.AIR);
    });
}

// 2. Solid foundation: no caves/holes can cut the structure; looks supported.
function buildProtectedFoundationVolume(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_OUTER_RADIUS + 2, ctx, (wx, wz, adx, adz) => {
        if (!inOctagon(adx, adz, ARENA_OUTER_RADIUS + 2)) return;
        fillColumn(ctx, wx, baseY - ARENA_FOUNDATION_DEPTH, baseY, wz, BlockType.MAGNETITE_BLOCK);
    });
}

// 3. Stepped outer foundation: bevel the footprint edge down into the tiers.
function buildOuterFoundation(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_OUTER_RADIUS + 2, ctx, (wx, wz, adx, adz) => {
        const edge = Math.round(ARENA_OUTER_RADIUS * 1.34) - (adx + adz); // distance inside the octagon corner
        const cheb = ARENA_OUTER_RADIUS - Math.max(adx, adz);
        const margin = Math.min(edge, cheb);
        if (margin < 0 || margin > 3) return;
        // Three stepped brick rings hanging just below the rim for a built bevel.
        const y = baseY - (3 - margin);
        ctx.setBlock(wx, y, wz, BlockType.MAGNETITE_BRICKS);
        ctx.setBlock(wx, y - 1, wz, BlockType.MAGNETITE_SLAB);
    });
}

// 4. Wide outer terrace floor (brick) with concentric chiseled trim rings.
function buildOuterTerrace(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_RIM_INNER, ctx, (wx, wz, adx, adz, dist) => {
        if (dist < ARENA_LAVA_OUTER_RADIUS + 1 || !inOctagon(adx, adz, ARENA_RIM_INNER)) return;
        const ring = (Math.round(dist) % 8 === 0) || (Math.round(dist) % 8 === 1);
        ctx.setBlock(wx, baseY, wz, ring ? BlockType.CHISELED_MAGNETITE : BlockType.MAGNETITE_BRICKS);
    });
}

// 5. Battlemented outer rim wall with corner buttresses, climb panels, 4 entries.
function buildOuterRim(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_OUTER_RADIUS, ctx, (wx, wz, adx, adz) => {
        if (!inOctagon(adx, adz, ARENA_OUTER_RADIUS) || inOctagon(adx, adz, ARENA_RIM_INNER - 1)) return;
        // Four cardinal entry gaps (a clear approach from each side).
        const isEntry = (adx <= 5 && adz >= ARENA_RIM_INNER - 2) || (adz <= 5 && adx >= ARENA_RIM_INNER - 2);
        if (isEntry) { ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS); return; }

        const onOuter = !inOctagon(adx, adz, ARENA_OUTER_RADIUS - 3);
        if (onOuter) {
            // The wall proper: tall brick with vertical chiseled ribs + battlements.
            const rib = ((wx + wz) & 3) === 0;
            fillColumn(ctx, wx, baseY, baseY + ARENA_WALL_HEIGHT, wz, rib ? BlockType.CHISELED_MAGNETITE : BlockType.MAGNETITE_BRICKS);
            // Battlement teeth on the very top.
            if (((wx ^ wz) & 1) === 0) ctx.setBlock(wx, baseY + ARENA_WALL_HEIGHT + 1, wz, BlockType.MAGNETITE_BRICK_SLAB);
            // Buttress caps at the octagon corners.
            if (adx + adz >= Math.round(ARENA_OUTER_RADIUS * 1.34) - 1) {
                ctx.setBlock(wx, baseY + ARENA_WALL_HEIGHT + 1, wz, BlockType.CHISELED_MAGNETITE);
            }
        } else {
            // Inner wall face: walkway floor + readable magnet climb panels.
            ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS);
            const seg = Math.floor((wx + wz) / 5) & 1;
            const panel = (((wx * 7 + wz * 13) & 7) < 3);
            if (panel) {
                fillColumn(ctx, wx, baseY + 1, baseY + ARENA_WALL_HEIGHT - 1, wz,
                    seg === 0 ? BlockType.POSITIVE_MAGNET : BlockType.NEGATIVE_MAGNET);
            }
        }
    });
}

// 6. Lava moat ringing the platform, with a brick lip on each edge.
function buildLavaMoat(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_LAVA_OUTER_RADIUS + 2, ctx, (wx, wz, _adx, _adz, dist) => {
        if (dist <= ARENA_CENTRAL_RADIUS || dist > ARENA_LAVA_OUTER_RADIUS + 1) return;
        if (dist > ARENA_LAVA_INNER_RADIUS && dist <= ARENA_LAVA_OUTER_RADIUS) {
            ctx.setBlock(wx, baseY, wz, BlockType.AIR);
            fillColumn(ctx, wx, baseY - ARENA_MOAT_DEPTH + 1, baseY - 1, wz, BlockType.LAVA);
        } else {
            // Inner/outer lip (a 2-block brick rim above the lava).
            ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS);
        }
    });
}

// 7. Central fight platform: brick floor, polarity accents, raised summoner dais.
function buildCentralPlatform(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_CENTRAL_RADIUS, ctx, (wx, wz, adx, adz, dist) => {
        if (dist > ARENA_CENTRAL_RADIUS) return;
        let floor: BlockType = BlockType.MAGNETITE_BRICKS;
        const rd = Math.round(dist);
        if (rd === ARENA_CENTRAL_RADIUS - 1 || rd === ARENA_CENTRAL_RADIUS - 2) floor = BlockType.CHISELED_MAGNETITE; // rim trim
        else if (rd === 14) floor = BlockType.CHISELED_MAGNETITE; // inner accent ring
        // Diagonal polarity spokes (subtle red/blue floor accents).
        else if (adx === adz && rd > 6 && rd < 22) floor = (wx - centerX) * (wz - centerZ) > 0 ? BlockType.POSITIVE_MAGNET : BlockType.NEGATIVE_MAGNET;
        ctx.setBlock(wx, baseY, wz, floor);
        // Raised central dais for the summoner.
        if (dist <= 4) {
            ctx.setBlock(wx, baseY + 1, wz, dist <= 2 ? BlockType.CHISELED_MAGNETITE : BlockType.MAGNETITE_BRICK_SLAB);
        }
    });
}

// 8. Broken approach bridges from each cardinal entry, stopping short over the lava.
function buildLaunchRoutes(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const reach = ARENA_LAVA_OUTER_RADIUS + 2;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let d = ARENA_LAVA_OUTER_RADIUS + 1; d >= ARENA_LAVA_OUTER_RADIUS - 5; d--) {
            const wx = centerX + sx * d;
            const wz = centerZ + sz * d;
            if (wx < ctx.minX || wx > ctx.maxX || wz < ctx.minZ || wz > ctx.maxZ) continue;
            if (d > reach) continue;
            ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS);
            ctx.setBlock(wx + sz, baseY, wz + sx, BlockType.MAGNETITE_BRICK_SLAB);
            ctx.setBlock(wx - sz, baseY, wz - sx, BlockType.MAGNETITE_BRICK_SLAB);
        }
    }
}

// 9. Four tall 7×7 climb towers rising from the lava: alternating polarity faces,
//    a stepped base founded in the lava, and a chiseled cap.
function buildMagneticPillarTowers(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        const magnet = arenaPillarPolarity(i) > 0 ? BlockType.POSITIVE_MAGNET : BlockType.NEGATIVE_MAGNET;
        const base = baseY - ARENA_MOAT_DEPTH;
        const top = baseY + ARENA_PILLAR_HEIGHT;
        // Stepped 9×9 → 7×7 base founded in the lava.
        for (let ox = -4; ox <= 4; ox++) {
            for (let oz = -4; oz <= 4; oz++) {
                const wx = c.x + ox, wz = c.z + oz;
                if (wx < ctx.minX || wx > ctx.maxX || wz < ctx.minZ || wz > ctx.maxZ) continue;
                const cheb = Math.max(Math.abs(ox), Math.abs(oz));
                if (cheb === 4) { ctx.setBlock(wx, base, wz, BlockType.MAGNETITE_BRICK_SLAB); continue; }
                // Shaft 7×7: outer shell = magnet climb panel, inner = brick core.
                const yTop = cheb === 3 ? top : top + 1; // recessed core, paneled faces stand proud
                for (let y = base; y <= yTop; y++) {
                    ctx.setBlock(wx, y, wz, cheb === 3 ? magnet : BlockType.MAGNETITE_BRICKS);
                }
            }
        }
        // Chiseled cap ring just under the pedestal.
        for (let ox = -3; ox <= 3; ox++) {
            for (let oz = -3; oz <= 3; oz++) {
                if (Math.max(Math.abs(ox), Math.abs(oz)) !== 3) continue;
                ctx.setBlock(c.x + ox, top, c.z + oz, BlockType.CHISELED_MAGNETITE);
            }
        }
    }
}

// 10. Pedestal + shield crystal on each tower top.
function buildShieldCrystalPedestals(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const top = baseY + ARENA_PILLAR_HEIGHT;
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        for (let ox = -1; ox <= 1; ox++) {
            for (let oz = -1; oz <= 1; oz++) {
                ctx.setBlock(c.x + ox, top + 1, c.z + oz, BlockType.CHISELED_MAGNETITE);
            }
        }
        ctx.setBlock(c.x, top + 2, c.z, BlockType.MAGNETIC_SHIELD_CRYSTAL);
    }
}

// 11. Boss summoner on the central dais.
function buildBossSummoner(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    ctx.setBlock(centerX, baseY + 2, centerZ, BlockType.MAGNETIC_BOSS_SUMMONER);
}
