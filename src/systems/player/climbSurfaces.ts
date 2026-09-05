// Climb surfaces in flux (the Magnetic Warden's towers).
//
// The arena towers' magnet climb faces carry the Warden's polarity and flip
// whenever it swaps. A climber is attached by attraction (opposite polarity),
// so a flip would normally peel them off on the spot. Instead the encounter
// opens a FLUX WINDOW on the tower before the flip (its telegraph) that runs a
// short grace after it: while the window is open the face holds a climber of
// EITHER polarity, so they can answer the swap with a flip of their own. When
// the window closes the face settles: a climber who now opposes it climbs on,
// one who matches it is SHOCKED, thrown clear toward the platform (never into
// the pit) and hurt a little.
//
// This module is pure (plain vectors, no THREE/world imports) so the rule is
// unit-testable and stays importable by the node --test strip-types runner.

export interface FluxVec3 {
    x: number;
    y: number;
    z: number;
}

export interface ClimbFluxZone {
    /** Stable id (one per tower). */
    id: string;
    /** Inclusive block-cell bounds of the surface's magnet cells. */
    min: FluxVec3;
    max: FluxVec3;
    /** The polarity the surface settles into once the window closes. */
    polarity: number;
    /** Seconds (caller clock) the window opened, for the HUD countdown. */
    opensAt: number;
    /** Seconds (caller clock) the window closes. */
    until: number;
    /** Where a shocked climber is thrown toward (the platform), or null for the face normal. */
    safeTarget: { x: number; z: number } | null;
}

/** Horizontal launch (blocks/s) of a shocked climber toward the safe target. */
export const CLIMB_SHOCK_LAUNCH_SPEED = 20;
/** Upward kick (blocks/s) of that launch. */
export const CLIMB_SHOCK_LAUNCH_UP = 7;
/** Damage a shock deals (a sting, not a killer: losing the climb is the cost). */
export const CLIMB_SHOCK_DAMAGE = 4;
/** How long after a window closes a mismatched climber can still be shocked. */
export const CLIMB_SHOCK_SETTLE_SECONDS = 1.0;

const inBounds = (zone: ClimbFluxZone, x: number, y: number, z: number): boolean =>
    x >= zone.min.x && x <= zone.max.x
    && y >= zone.min.y && y <= zone.max.y
    && z >= zone.min.z && z <= zone.max.z;

/** The ordinary rule: with boots on, opposite signs attract. */
export const attractsByPolarity = (playerPolarity: number, blockPolarity: number): boolean =>
    blockPolarity !== 0 && playerPolarity !== 0 && Math.sign(playerPolarity) !== Math.sign(blockPolarity);

export class ClimbSurfaceRegistry {
    private zones = new Map<string, ClimbFluxZone>();
    /** Shared fight clock (seconds), advanced by the encounter so the player
     *  physics and the windows agree on time (and pause together). */
    clock = 0;
    /** Zone id the player is currently clinging to (written by the player physics for the HUD). */
    attachedZone: string | null = null;

    advance(dt: number): void {
        if (Number.isFinite(dt) && dt > 0) this.clock += dt;
    }

    /** Open (or re-open) a flux window on a surface. */
    setFlux(zone: ClimbFluxZone): void {
        this.zones.set(zone.id, { ...zone, min: { ...zone.min }, max: { ...zone.max }, safeTarget: zone.safeTarget ? { ...zone.safeTarget } : null });
    }

    /** Forget a surface entirely (its crystal broke, the fight ended). */
    clear(id: string): void {
        this.zones.delete(id);
    }

    clearAll(): void {
        this.zones.clear();
        this.attachedZone = null;
    }

    /** Every registered surface (for the renderer's tower state). */
    all(): ClimbFluxZone[] {
        return Array.from(this.zones.values());
    }

    get(id: string): ClimbFluxZone | null {
        return this.zones.get(id) ?? null;
    }

    /** The surface a block cell belongs to, if any. */
    zoneAt(x: number, y: number, z: number): ClimbFluxZone | null {
        for (const zone of this.zones.values()) {
            if (inBounds(zone, x, y, z)) return zone;
        }
        return null;
    }

    /** True while the cell's surface is mid-flip (holds either polarity). */
    inFlux(x: number, y: number, z: number, now: number): boolean {
        const zone = this.zoneAt(x, y, z);
        return zone !== null && now >= zone.opensAt && now < zone.until;
    }

    /** Windows open right now (for the HUD's "flip to hold" warning). */
    activeWindows(now: number): ClimbFluxZone[] {
        const out: ClimbFluxZone[] = [];
        for (const zone of this.zones.values()) {
            if (now >= zone.opensAt && now < zone.until) out.push(zone);
        }
        return out;
    }

    /**
     * The attraction rule with flux applied: inside an open window any magnet
     * face of the surface holds the climber, otherwise opposite attracts.
     */
    isAttractive(playerPolarity: number, blockPolarity: number, x: number, y: number, z: number, now: number): boolean {
        if (blockPolarity === 0) return false;
        if (this.inFlux(x, y, z, now)) return true;
        return attractsByPolarity(playerPolarity, blockPolarity);
    }

    /**
     * Whether a climber attached to this cell is shocked off it: the surface's
     * window has closed and they match its settled polarity. Returns the launch
     * direction (horizontal unit vector) or null to hold on.
     */
    shockAt(
        x: number, y: number, z: number,
        playerPolarity: number,
        now: number,
        faceNormal: FluxVec3,
        climber: FluxVec3,
    ): { x: number; z: number } | null {
        const zone = this.zoneAt(x, y, z);
        // Only a window that actually opened can settle against a climber, and
        // only right as it closes (a climber cannot be holding the wrong
        // polarity any later: they are already off the face).
        if (!zone || zone.until <= zone.opensAt || now < zone.until || now > zone.until + CLIMB_SHOCK_SETTLE_SECONDS) return null;
        if (playerPolarity === 0 || Math.sign(playerPolarity) !== Math.sign(zone.polarity)) return null;
        if (zone.safeTarget) {
            const dx = zone.safeTarget.x - climber.x;
            const dz = zone.safeTarget.z - climber.z;
            const d = Math.hypot(dx, dz);
            if (d > 1e-6) return { x: dx / d, z: dz / d };
        }
        const n = Math.hypot(faceNormal.x, faceNormal.z);
        if (n > 1e-6) return { x: faceNormal.x / n, z: faceNormal.z / n };
        return { x: 0, z: 1 };
    }
}

/** The live registry the encounter writes and the player physics reads. */
export const climbSurfaces = new ClimbSurfaceRegistry();
