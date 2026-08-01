export interface NavigationVector {
    x: number;
    y: number;
    z: number;
}

export type NavigationAction = 'walk' | 'step' | 'jump' | 'drop';

export type NavigationFailureReason =
    | 'unloaded'
    | 'hazard'
    | 'unsupported'
    | 'no_clearance'
    | 'step_too_high'
    | 'drop_too_far'
    | 'blocked'
    | 'budget_exhausted'
    | 'no_path'
    | 'cancelled';

export interface NavigationProfile {
    width: number;
    height: number;
    maxStep: number;
    maxJump: number;
    maxDrop: number;
    avoidHazards?: ReadonlySet<number>;
}

export interface NavigationRequest {
    start: NavigationVector;
    goal: NavigationVector;
    profile: NavigationProfile;
    maxExpandedNodes: number;
}

export interface NavigationNode extends NavigationVector {
    action: NavigationAction;
}

export interface NavigationPath {
    nodes: NavigationNode[];
    expandedNodes: number;
    totalCost: number;
}

export interface SegmentResult {
    traversable: boolean;
    action?: NavigationAction;
    reason?: NavigationFailureReason;
}

export interface NavigationWorld {
    /** Null means the owning chunk/column is not currently loaded. */
    getBlock(x: number, y: number, z: number): number | null;
    isLoaded?(x: number, z: number): boolean;
    isSolid?(type: number): boolean;
    isHazard?(type: number): boolean;
}

export interface NavigationRegion {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}
