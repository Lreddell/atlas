// Magnetic Warden arena — a dedicated, deterministic voxel-structure generator.
//
// The arena is the monumental centre of every Magnetic Fields biome instance: a
// large octagonal magnetite fortress whose battlemented outer wall is broken up by
// massive vertical ribs, corner buttress towers, an upper walkway and grouped
// climb panels. Inside, a wide terrace steps down to a RECESSED lava pit (the lava
// sits well below the arena floor, so a missed jump drops into air first), crossed
// by four cardinal bridges to a detailed central platform. Four thick polarity
// towers rise from the pit, each with a flared base, trim bands, a single
// designated magnet climb face, a chiseled cap and a shield-crystal pedestal.
//
// It reserves and fills its whole volume so no caves/terrain cut through, and is
// built per world chunk for the slice that overlaps it (one seamless landmark).

import { BlockType } from '../../types';

// --- Centralized dimensions (all radii in blocks, relative to the centre) ---
export const ARENA_OUTER_RADIUS = 72;        // octagonal footprint → ~150 across
export const ARENA_PROTECTED_RADIUS = 80;    // reserved volume (airspace clear + no caves)
export const ARENA_FOUNDATION_DEPTH = 26;    // solid fill below the base
export const ARENA_WALL_HEIGHT = 12;         // outer rim wall height
export const ARENA_RIM_INNER = 62;           // rim wall band: [RIM_INNER, OUTER]
export const ARENA_TERRACE_INNER = 46;       // terrace floor band: [TERRACE_INNER, RIM_INNER)
export const ARENA_LAVA_OUTER_RADIUS = 44;   // lava pit band: (LAVA_INNER, LAVA_OUTER)
export const ARENA_LAVA_INNER_RADIUS = 26;
export const ARENA_CENTRAL_RADIUS = 24;      // central fight platform
export const ARENA_MOAT_PIT_DEPTH = 12;      // pit floor depth below the arena floor
export const ARENA_LAVA_THICKNESS = 3;       // lava lies at the BOTTOM of the pit
export const ARENA_PILLAR_RADIUS = 35;       // tower centres (in the pit)
export const ARENA_PILLAR_HALF = 3;          // 7×7 towers
export const ARENA_PILLAR_HEIGHT = 26;       // tower top above the arena floor
export const ARENA_PILLAR_COUNT = 4;
export const ARENA_RIB_SPACING = 16;         // massive wall ribs roughly every 16 blocks

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

// True near a rib gridline (gives evenly spaced vertical ribs along the wall).
const onRibLine = (d: number): boolean => {
    const m = ((d % ARENA_RIB_SPACING) + ARENA_RIB_SPACING) % ARENA_RIB_SPACING;
    return m <= 1;
};
// True near the middle of a rib-to-rib bay (where grouped climb panels sit).
const inBayCenter = (d: number): boolean => {
    const m = ((d % ARENA_RIB_SPACING) + ARENA_RIB_SPACING) % ARENA_RIB_SPACING;
    return Math.abs(m - ARENA_RIB_SPACING / 2) <= 1.5;
};

/** Pillar centre for tower `i`, on the diagonals so it sits in the lava pit. */
export function arenaPillarCenter(centerX: number, centerZ: number, i: number): { x: number; z: number } {
    const ang = Math.PI / 4 + (i / ARENA_PILLAR_COUNT) * Math.PI * 2;
    return {
        x: centerX + Math.round(Math.cos(ang) * ARENA_PILLAR_RADIUS),
        z: centerZ + Math.round(Math.sin(ang) * ARENA_PILLAR_RADIUS),
    };
}

/** Alternating polarity per tower (1 = positive/red, -1 = negative/blue). */
export const arenaPillarPolarity = (i: number): number => (i % 2 === 0 ? 1 : -1);

/** Lava surface Y inside the recessed pit (well below the arena floor). */
export const arenaLavaSurfaceY = (baseY: number): number =>
    baseY - ARENA_MOAT_PIT_DEPTH + ARENA_LAVA_THICKNESS;

/**
 * Generate (the part of) the Magnetic Warden arena that overlaps this chunk.
 * centerX/centerZ = instance centre, baseY = plateau / arena-floor Y.
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
    buildLavaMoat(centerX, centerZ, baseY, ctx);
    buildOuterTerrace(centerX, centerZ, baseY, ctx);
    buildOuterRim(centerX, centerZ, baseY, ctx);
    buildCentralPlatform(centerX, centerZ, baseY, ctx);
    buildLaunchRoutes(centerX, centerZ, baseY, ctx);
    buildPillarLandingPools(centerX, centerZ, baseY, ctx);
    buildMagneticPillarTowers(centerX, centerZ, baseY, ctx);
    buildShieldCrystalPedestals(centerX, centerZ, baseY, ctx);
    buildArenaLights(centerX, centerZ, baseY, ctx);
    buildBossSummoner(centerX, centerZ, baseY, ctx);
}

// Glowing Magnetite Shards for night visibility — a ring along the wall top, a
// sparse terrace ring, and a few by the centre. Kept modest (not overdone).
function buildArenaLights(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const ring = (r: number, n: number, y: number, off: number): void => {
        for (let a = 0; a < n; a++) {
            const ang = (a / n) * Math.PI * 2 + off;
            const x = centerX + Math.round(Math.cos(ang) * r);
            const z = centerZ + Math.round(Math.sin(ang) * r);
            if (inChunk(ctx, x, z)) ctx.setBlock(x, y, z, BlockType.MAGNETITE_SHARD);
        }
    };
    ring(ARENA_RIM_INNER - 1, 16, baseY + ARENA_WALL_HEIGHT + 1, 0);                       // wall-top ring
    ring((ARENA_LAVA_OUTER_RADIUS + ARENA_RIM_INNER) / 2, 8, baseY + 1, Math.PI / 8);      // terrace ring
    ring(7, 4, baseY + 1, Math.PI / 4);                                                    // near the summoner
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

const inChunk = (ctx: ArenaCtx, wx: number, wz: number): boolean =>
    wx >= ctx.minX && wx <= ctx.maxX && wz >= ctx.minZ && wz <= ctx.maxZ;

// 1. Clear everything above the base across the reserved volume (trees/terrain).
function clearArenaAirspace(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const top = baseY + ARENA_WALL_HEIGHT + ARENA_PILLAR_HEIGHT + 8;
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
    forColumns(centerX, centerZ, ARENA_OUTER_RADIUS + 3, ctx, (wx, wz, adx, adz) => {
        const corner = Math.round(ARENA_OUTER_RADIUS * 1.34) - (adx + adz);
        const cheb = ARENA_OUTER_RADIUS - Math.max(adx, adz);
        const margin = Math.min(corner, cheb);
        if (margin < 0 || margin > 3) return;
        const y = baseY - (3 - margin);
        ctx.setBlock(wx, y, wz, BlockType.MAGNETITE_BRICKS);
        ctx.setBlock(wx, y - 1, wz, BlockType.MAGNETITE_SLAB);
    });
}

// 4. RECESSED lava pit ringing the platform: lava sits at the bottom, with several
//    blocks of open air above it and a brick lip on each edge.
function buildLavaMoat(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const lavaTop = arenaLavaSurfaceY(baseY);            // e.g. baseY-9
    const pitFloor = baseY - ARENA_MOAT_PIT_DEPTH;       // e.g. baseY-12
    forColumns(centerX, centerZ, ARENA_LAVA_OUTER_RADIUS + 2, ctx, (wx, wz, _adx, _adz, dist) => {
        if (dist <= ARENA_CENTRAL_RADIUS || dist > ARENA_LAVA_OUTER_RADIUS + 1) return;
        if (dist > ARENA_LAVA_INNER_RADIUS && dist <= ARENA_LAVA_OUTER_RADIUS) {
            // Open the pit down to the lava, fill lava only at the very bottom.
            fillColumn(ctx, wx, lavaTop + 1, baseY, wz, BlockType.AIR);
            fillColumn(ctx, wx, pitFloor + 1, lavaTop, wz, BlockType.LAVA);
        } else {
            // Inner/outer lip: a brick rim framing the pit at floor level.
            ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS);
            if (Math.round(dist) === ARENA_LAVA_INNER_RADIUS || Math.round(dist) === ARENA_LAVA_OUTER_RADIUS + 1) {
                ctx.setBlock(wx, baseY + 1, wz, BlockType.MAGNETITE_BRICK_SLAB); // curb
            }
        }
    });
}

// 5. Wide outer terrace floor (brick) with concentric chiseled trim rings.
function buildOuterTerrace(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_RIM_INNER, ctx, (wx, wz, adx, adz, dist) => {
        if (dist < ARENA_LAVA_OUTER_RADIUS + 2 || !inOctagon(adx, adz, ARENA_RIM_INNER)) return;
        const rd = Math.round(dist);
        const ring = rd % 7 === 0;
        ctx.setBlock(wx, baseY, wz, ring ? BlockType.CHISELED_MAGNETITE : BlockType.MAGNETITE_BRICKS);
    });
}

// 7. Outer rim: massive ribs + corner buttresses, stepped trim bands, grouped climb
//    panels, battlements, an inner upper walkway, and four cardinal entry gates.
function buildOuterRim(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const top = baseY + ARENA_WALL_HEIGHT;
    forColumns(centerX, centerZ, ARENA_OUTER_RADIUS, ctx, (wx, wz, adx, adz) => {
        if (!inOctagon(adx, adz, ARENA_OUTER_RADIUS) || inOctagon(adx, adz, ARENA_RIM_INNER - 1)) return;
        const dx = wx - centerX, dz = wz - centerZ;

        // Four cardinal entry gates aligned with the bridges (clear approach in).
        const isEntry = (Math.abs(dx) <= 4 && adz >= ARENA_RIM_INNER - 1) || (Math.abs(dz) <= 4 && adx >= ARENA_RIM_INNER - 1);
        if (isEntry) { ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS); return; }

        const isCorner = adx + adz >= Math.round(ARENA_OUTER_RADIUS * 1.34) - 2;
        const isRib = onRibLine(dx) || onRibLine(dz) || isCorner;
        const onOuterShell = !inOctagon(adx, adz, ARENA_OUTER_RADIUS - 3);
        const onInnerShell = inOctagon(adx, adz, ARENA_RIM_INNER + 1);

        // Stepped trim band along the base of the wall.
        ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICK_SLAB);

        if (onOuterShell) {
            if (isRib) {
                // Massive rib / buttress: taller chiseled column with a slab cap.
                fillColumn(ctx, wx, baseY, top + 3, wz, BlockType.CHISELED_MAGNETITE);
                ctx.setBlock(wx, top + 4, wz, BlockType.MAGNETITE_BRICK_SLAB);
            } else {
                fillColumn(ctx, wx, baseY, top, wz, BlockType.MAGNETITE_BRICKS);
                // Stepped trim band near the top + battlement teeth.
                ctx.setBlock(wx, top - 1, wz, BlockType.CHISELED_MAGNETITE);
                if (((wx ^ wz) & 1) === 0) ctx.setBlock(wx, top + 1, wz, BlockType.MAGNETITE_BRICK_SLAB);
            }
        } else if (onInnerShell) {
            // Inner face: walkway floor, grouped magnet climb panels in bay centres,
            // and an upper walkway slab path along the rim.
            fillColumn(ctx, wx, baseY, top, wz, BlockType.MAGNETITE_BRICKS);
            const bay = inBayCenter(dx) && inBayCenter(dz);
            if (bay && !isRib) {
                const polarity = (Math.floor(dx / ARENA_RIB_SPACING) + Math.floor(dz / ARENA_RIB_SPACING)) & 1;
                fillColumn(ctx, wx, baseY + 2, top - 2, wz, polarity === 0 ? BlockType.POSITIVE_MAGNET : BlockType.NEGATIVE_MAGNET);
            }
            ctx.setBlock(wx, top + 1, wz, BlockType.MAGNETITE_BRICK_SLAB); // upper walkway
        } else {
            fillColumn(ctx, wx, baseY, top, wz, BlockType.MAGNETITE_BRICKS);
        }
    });
}

// 8. Central fight platform: brick floor, radial polarity pattern + trim rings,
//    and a raised stepped summoner pedestal at the exact centre.
function buildCentralPlatform(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    forColumns(centerX, centerZ, ARENA_CENTRAL_RADIUS, ctx, (wx, wz, adx, adz, dist) => {
        if (dist > ARENA_CENTRAL_RADIUS) return;
        const dx = wx - centerX, dz = wz - centerZ;
        const rd = Math.round(dist);
        let floor: BlockType = BlockType.MAGNETITE_BRICKS;
        if (rd >= ARENA_CENTRAL_RADIUS - 1) floor = BlockType.CHISELED_MAGNETITE;     // rim trim
        else if (rd === 16 || rd === 9) floor = BlockType.CHISELED_MAGNETITE;          // concentric rings
        else if (Math.abs(adx - adz) <= 1 && rd > 5) floor = BlockType.CHISELED_MAGNETITE; // radial spokes
        ctx.setBlock(wx, baseY, wz, floor);
        // Raised stepped summoner dais.
        if (dist <= 5) ctx.setBlock(wx, baseY + 1, wz, BlockType.MAGNETITE_BRICKS);
        if (dist <= 3) ctx.setBlock(wx, baseY + 2, wz, BlockType.CHISELED_MAGNETITE);
        if (dx === 0 && dz === 0) ctx.setBlock(wx, baseY + 3, wz, BlockType.CHISELED_MAGNETITE);
    });
}

// 9. Four cardinal bridges across the pit to the platform (so the centre is
//    reachable), with low brick-slab curbs, plus broken stubs toward the towers.
function buildLaunchRoutes(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let d = ARENA_CENTRAL_RADIUS - 1; d <= ARENA_LAVA_OUTER_RADIUS + 2; d++) {
            for (let w = -1; w <= 1; w++) {
                const wx = centerX + sx * d + sz * w;
                const wz = centerZ + sz * d + sx * w;
                if (!inChunk(ctx, wx, wz)) continue;
                ctx.setBlock(wx, baseY, wz, w === 0 ? BlockType.MAGNETITE_BRICKS : BlockType.CHISELED_MAGNETITE);
            }
            // Low curb rails on each side of the deck.
            const rx = centerX + sx * d + sz * 2, rz = centerZ + sz * d + sx * 2;
            const lx = centerX + sx * d - sz * 2, lz = centerZ + sz * d - sx * 2;
            if (inChunk(ctx, rx, rz)) ctx.setBlock(rx, baseY + 1, rz, BlockType.MAGNETITE_BRICK_SLAB);
            if (inChunk(ctx, lx, lz)) ctx.setBlock(lx, baseY + 1, lz, BlockType.MAGNETITE_BRICK_SLAB);
        }
    }
    // Broken stubs reaching from the terrace toward each tower (hint the climb route).
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        const ux = Math.sign(c.x - centerX), uz = Math.sign(c.z - centerZ);
        for (let s = 0; s < 4; s++) {
            const wx = centerX + ux * (ARENA_LAVA_OUTER_RADIUS + 1 + s - 5);
            const wz = centerZ + uz * (ARENA_LAVA_OUTER_RADIUS + 1 + s - 5);
            if (inChunk(ctx, wx, wz)) ctx.setBlock(wx, baseY, wz, BlockType.MAGNETITE_BRICKS);
        }
    }
}

// 9b. Flush water landing pools on the platform edge facing each tower, so a
//     player descending a pillar has a safe place to drop without taking heavy
//     fall damage. The pool sits at the arena floor (1 deep over solid
//     foundation), so it is flush — never floating or in an inescapable hole.
function buildPillarLandingPools(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        const dx = c.x - centerX, dz = c.z - centerZ;
        const len = Math.hypot(dx, dz) || 1;
        const px = Math.round(centerX + (dx / len) * 20);
        const pz = Math.round(centerZ + (dz / len) * 20);
        for (let ox = -2; ox <= 2; ox++) {
            for (let oz = -2; oz <= 2; oz++) {
                if (ox * ox + oz * oz > 6) continue; // ~5-wide disc
                const wx = px + ox, wz = pz + oz;
                if (!inChunk(ctx, wx, wz)) continue;
                ctx.setBlock(wx, baseY, wz, BlockType.WATER);
            }
        }
    }
}

// 10. Four thick polarity towers rising from the pit floor. The two centre-facing
//     faces are an UNBROKEN magnet climb path bottom→top; the other faces are bricks
//     with chiseled vertical CORNER borders for shape (no horizontal bands that would
//     break the climb). Flared base founded in the lava.
function buildMagneticPillarTowers(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const pitFloor = baseY - ARENA_MOAT_PIT_DEPTH;
    const top = baseY + ARENA_PILLAR_HEIGHT;
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        for (let ox = -4; ox <= 4; ox++) {
            for (let oz = -4; oz <= 4; oz++) {
                const wx = c.x + ox, wz = c.z + oz;
                if (!inChunk(ctx, wx, wz)) continue;
                const cheb = Math.max(Math.abs(ox), Math.abs(oz));
                if (cheb === 4) {
                    // Flared 9×9 base founded in the lava (just a short skirt).
                    fillColumn(ctx, wx, pitFloor, baseY - 2, wz, BlockType.MAGNETITE_BRICKS);
                    ctx.setBlock(wx, baseY - 1, wz, BlockType.MAGNETITE_BRICK_SLAB);
                    continue;
                }
                // All-brick shaft by default (chiseled corners for shape). The two
                // centre-facing MAGNET climb faces are NOT here — they're placed only
                // for the duration of a fight (during the summon cutscene), so the
                // tower is plain/unclimbable otherwise.
                const isCorner = Math.abs(ox) === 3 && Math.abs(oz) === 3;
                fillColumn(ctx, wx, pitFloor, top, wz, isCorner ? BlockType.CHISELED_MAGNETITE : BlockType.MAGNETITE_BRICKS);
            }
        }
    }
}

// 11. Tower cap: a chiseled rim set ONE BLOCK INWARD all the way around (even, with
//     shape, but it doesn't block the player), framing a shield crystal that sits on
//     the platform at the centre.
function buildShieldCrystalPedestals(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    const top = baseY + ARENA_PILLAR_HEIGHT;
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        const dirX = Math.sign(c.x - centerX), dirZ = Math.sign(c.z - centerZ);
        for (let ox = -3; ox <= 3; ox++) {
            for (let oz = -3; oz <= 3; oz++) {
                const wx = c.x + ox, wz = c.z + oz;
                if (!inChunk(ctx, wx, wz)) continue;
                const cheb = Math.max(Math.abs(ox), Math.abs(oz));
                // Leave the two centre-facing climb-face cells as the shaft set them
                // (magnet), so the climb path runs unbroken to the very top.
                const isClimbFace = cheb === 3 && (ox === -3 * dirX || oz === -3 * dirZ);
                if (!isClimbFace) ctx.setBlock(wx, top, wz, BlockType.MAGNETITE_BRICKS); // clean 7×7 cap
                if (cheb === 2) ctx.setBlock(wx, top + 1, wz, BlockType.CHISELED_MAGNETITE); // inset rim
            }
        }
        // Raised pedestal (the crystal stands ABOVE the rim). The crystal block
        // itself is NOT generated here — it is spawned by the summon cutscene at
        // top+2 (getShieldCrystalPositions) so the arena is empty until you fight.
        if (inChunk(ctx, c.x, c.z)) {
            ctx.setBlock(c.x, top + 1, c.z, BlockType.CHISELED_MAGNETITE);
        }
    }
}

// --- Dais lifecycle: removed while the boss is alive (so it can't snag on the
//     raised centre), restored when the boss is gone (so you can re-summon). ---

const DAIS_CELLS: { dx: number; dz: number; dy: number; type: BlockType }[] = (() => {
    const cells: { dx: number; dz: number; dy: number; type: BlockType }[] = [];
    for (let dx = -5; dx <= 5; dx++) {
        for (let dz = -5; dz <= 5; dz++) {
            const dist = Math.hypot(dx, dz);
            if (dist > 5) continue;
            cells.push({ dx, dz, dy: 1, type: BlockType.MAGNETITE_BRICKS });
            if (dist <= 3) cells.push({ dx, dz, dy: 2, type: BlockType.CHISELED_MAGNETITE });
            if (dx === 0 && dz === 0) {
                cells.push({ dx, dz, dy: 3, type: BlockType.CHISELED_MAGNETITE });
                cells.push({ dx, dz, dy: 4, type: BlockType.MAGNETIC_BOSS_SUMMONER });
            }
        }
    }
    return cells;
})();

export type ArenaEdit = { x: number; y: number; z: number; type: BlockType };

/** Flatten the raised dais + remove the summoner altar (boss is active). */
export function flattenArenaDais(
    centerX: number, centerZ: number, baseY: number,
    setBlocks: (edits: ArenaEdit[]) => void,
): void {
    setBlocks(DAIS_CELLS.map((c) => ({ x: centerX + c.dx, y: baseY + c.dy, z: centerZ + c.dz, type: BlockType.AIR })));
}

/** Rebuild the dais + summoner altar (boss gone — re-summonable). */
export function restoreArenaDais(
    centerX: number, centerZ: number, baseY: number,
    setBlocks: (edits: ArenaEdit[]) => void,
): void {
    setBlocks(DAIS_CELLS.map((c) => ({ x: centerX + c.dx, y: baseY + c.dy, z: centerZ + c.dz, type: c.type })));
}

// --- Bridge lifecycle: the four cardinal causeways across the lava moat are
//     removed while the boss is alive (sealing the player on the central island —
//     they must climb the towers / use polarity), and rebuilt once the boss is
//     gone or the player leaves/dies. Only the spans OVER the moat are toggled;
//     the inner terrace stays solid so the player never drops out of the world. ---

const BRIDGE_CELLS: { dx: number; dy: number; dz: number; type: BlockType }[] = (() => {
    const cells: { dx: number; dy: number; dz: number; type: BlockType }[] = [];
    // Mirror buildLaunchRoutes, but only the portion crossing the moat (so the
    // inner terrace ring under the player is left untouched).
    const from = ARENA_LAVA_INNER_RADIUS - 1;
    const to = ARENA_LAVA_OUTER_RADIUS + 2;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (let d = from; d <= to; d++) {
            for (let w = -1; w <= 1; w++) {
                cells.push({
                    dx: sx * d + sz * w, dy: 0, dz: sz * d + sx * w,
                    type: w === 0 ? BlockType.MAGNETITE_BRICKS : BlockType.CHISELED_MAGNETITE,
                });
            }
            cells.push({ dx: sx * d + sz * 2, dy: 1, dz: sz * d + sx * 2, type: BlockType.MAGNETITE_BRICK_SLAB });
            cells.push({ dx: sx * d - sz * 2, dy: 1, dz: sz * d - sx * 2, type: BlockType.MAGNETITE_BRICK_SLAB });
        }
    }
    return cells;
})();

/** Drop the four causeways into the lava (boss is active — player is sealed in). */
export function flattenArenaBridges(
    centerX: number, centerZ: number, baseY: number,
    setBlocks: (edits: ArenaEdit[]) => void,
): void {
    setBlocks(BRIDGE_CELLS.map((c) => ({ x: centerX + c.dx, y: baseY + c.dy, z: centerZ + c.dz, type: BlockType.AIR })));
}

/** Rebuild the four causeways (boss gone / player left — arena is open again). */
export function restoreArenaBridges(
    centerX: number, centerZ: number, baseY: number,
    setBlocks: (edits: ArenaEdit[]) => void,
): void {
    setBlocks(BRIDGE_CELLS.map((c) => ({ x: centerX + c.dx, y: baseY + c.dy, z: centerZ + c.dz, type: c.type })));
}

// --- Pillar climb-face lifecycle: the towers are plain brick by default. The two
//     centre-facing MAGNET climb faces are PLACED only for a fight (during the summon
//     cutscene) so the player can climb to break the shield crystals, then STRIPPED
//     back to brick once the boss is past 50% (anti-cheese) AND on any arena reset —
//     so the magnets are never left on the walls after a fight. Cheap: solid→solid,
//     no lighting flood, only a remesh. ---

/** The climbable magnet inner-face cells of the towers (baseY..top), each with its
 *  magnet type. Pass `onlyPillar` to restrict to a single tower. */
function collectClimbFaceCells(
    centerX: number, centerZ: number, baseY: number, onlyPillar?: number,
): { x: number; y: number; z: number; magnet: BlockType }[] {
    const out: { x: number; y: number; z: number; magnet: BlockType }[] = [];
    const top = baseY + ARENA_PILLAR_HEIGHT;
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        if (onlyPillar !== undefined && i !== onlyPillar) continue;
        const c = arenaPillarCenter(centerX, centerZ, i);
        const magnet = arenaPillarPolarity(i) > 0 ? BlockType.POSITIVE_MAGNET : BlockType.NEGATIVE_MAGNET;
        const dirX = Math.sign(c.x - centerX), dirZ = Math.sign(c.z - centerZ);
        for (let ox = -3; ox <= 3; ox++) {
            for (let oz = -3; oz <= 3; oz++) {
                const cheb = Math.max(Math.abs(ox), Math.abs(oz));
                const isCorner = Math.abs(ox) === 3 && Math.abs(oz) === 3;
                const innerFace = cheb === 3 && !isCorner && (ox === -3 * dirX || oz === -3 * dirZ);
                if (!innerFace) continue;
                for (let y = baseY; y <= top; y++) out.push({ x: c.x + ox, y, z: c.z + oz, magnet });
            }
        }
    }
    return out;
}

/** Place ONE tower's magnet climb faces (called as each shield crystal spawns, so
 *  the climb lights up pillar-by-pillar during the summon cutscene). */
export function placePillarClimbMagnets(
    centerX: number, centerZ: number, baseY: number, pillarIndex: number,
    setBlocks: (edits: ArenaEdit[]) => void,
): void {
    setBlocks(collectClimbFaceCells(centerX, centerZ, baseY, pillarIndex)
        .map((e) => ({ x: e.x, y: e.y, z: e.z, type: e.magnet })));
}

/** Strip the magnet climb faces back to brick (boss past 50%, and on arena reset). */
export function stripArenaClimbMagnets(
    centerX: number, centerZ: number, baseY: number,
    setBlocks: (edits: ArenaEdit[]) => void,
): void {
    setBlocks(collectClimbFaceCells(centerX, centerZ, baseY)
        .map((e) => ({ x: e.x, y: e.y, z: e.z, type: BlockType.MAGNETITE_BRICKS })));
}

/** World positions of the four shield crystals (raised pedestal tops). */
export function getShieldCrystalPositions(
    centerX: number,
    centerZ: number,
    baseY: number,
): { x: number; y: number; z: number }[] {
    const top = baseY + ARENA_PILLAR_HEIGHT;
    const out: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < ARENA_PILLAR_COUNT; i++) {
        const c = arenaPillarCenter(centerX, centerZ, i);
        out.push({ x: c.x, y: top + 2, z: c.z });
    }
    return out;
}

// 12. Boss summoner on the raised central dais.
function buildBossSummoner(centerX: number, centerZ: number, baseY: number, ctx: ArenaCtx): void {
    if (inChunk(ctx, centerX, centerZ)) ctx.setBlock(centerX, baseY + 4, centerZ, BlockType.MAGNETIC_BOSS_SUMMONER);
}
