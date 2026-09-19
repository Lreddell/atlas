// Gate 0: Waystones and expedition anchors.
// Waystones are earned post-boss travel nodes, not arbitrary teleports.
// Expedition anchors are bounded death-recovery tools, not fast travel.

export interface WaystoneState {
  siteId: string;
  discovered: boolean;
  active: boolean;
  /** Landing volume validated before travel commits. */
  landingX: number;
  landingY: number;
  landingZ: number;
}

export interface ExpeditionAnchorState {
  siteId: string;
  charges: number;
  maxCharges: number;
  /** Common regional refill material item id. */
  refillItemId: string;
}

export const EXPEDITION_ANCHOR_DEFAULT_CHARGES = 5;

export function createExpeditionAnchor(siteId: string, refillItemId: string): ExpeditionAnchorState {
  return {
    siteId,
    charges: EXPEDITION_ANCHOR_DEFAULT_CHARGES,
    maxCharges: EXPEDITION_ANCHOR_DEFAULT_CHARGES,
    refillItemId,
  };
}

export function refillAnchor(
  anchor: ExpeditionAnchorState,
  materialCount: number,
): { anchor: ExpeditionAnchorState; consumed: number } {
  if (anchor.charges >= anchor.maxCharges || materialCount <= 0) {
    return { anchor, consumed: 0 };
  }
  const needed = anchor.maxCharges - anchor.charges;
  const consumed = Math.min(needed, materialCount);
  return {
    anchor: { ...anchor, charges: anchor.charges + consumed },
    consumed,
  };
}

export function consumeAnchorCharge(
  anchor: ExpeditionAnchorState,
): ExpeditionAnchorState | null {
  if (anchor.charges <= 0) return null;
  return { ...anchor, charges: anchor.charges - 1 };
}

export interface TravelRequest {
  fromSiteId: string;
  toSiteId: string;
  inCombat: boolean;
  inDanger: boolean;
}

export function canWaystoneTravel(
  request: TravelRequest,
  destinations: Map<string, WaystoneState>,
): { ok: boolean; reason?: string } {
  if (request.inCombat || request.inDanger) {
    return { ok: false, reason: 'Cannot travel during active combat.' };
  }
  const dest = destinations.get(request.toSiteId);
  if (!dest || !dest.active || !dest.discovered) {
    return { ok: false, reason: 'Destination waystone is not activated.' };
  }
  return { ok: true };
}

/** Travel commits only after destination landing volume validates. Failure
 * returns the player to the source waystone. Boats stay at source. */
export function validateLandingVolume(
  getBlockSolid: (x: number, y: number, z: number) => boolean,
  x: number,
  y: number,
  z: number,
): boolean {
  // Need two free headroom blocks and solid ground below.
  if (getBlockSolid(x, y, z) || getBlockSolid(x, y + 1, z)) return false;
  if (!getBlockSolid(x, y - 1, z)) return false;
  return true;
}
