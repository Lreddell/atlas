import type { VaultEscapeRoute } from './resonantVaultEscapes.ts';

export interface VaultEscapeRoom {
    kind: string;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    depth: number;
}

export interface VaultEscapeOutlet {
    route: VaultEscapeRoute;
    x: number;
    z: number;
    floorY: number;
    surfaceY: number;
    thresholdRadius: number;
    room: string;
}

export interface VaultEscapeLayout {
    rooms: VaultEscapeRoom[];
    surfaceOutlets: {
        grand: VaultEscapeOutlet;
        fracture: VaultEscapeOutlet;
    };
}

function insideHorizontalThreshold(
    outlet: VaultEscapeOutlet,
    player: { x: number; z: number },
): boolean {
    return Math.max(Math.abs(player.x - outlet.x), Math.abs(player.z - outlet.z)) <= outlet.thresholdRadius;
}

export function getCompletedEscapeRoute(
    layout: VaultEscapeLayout,
    player: { x: number; y: number; z: number },
    chosenRoute: VaultEscapeRoute | null,
    connectedToOpenAir: boolean,
): VaultEscapeRoute | null {
    if (!chosenRoute || !connectedToOpenAir) return null;
    const outlet = layout.surfaceOutlets[chosenRoute];
    const surfaceY = outlet.surfaceY;
    if (player.y < surfaceY + 1 || player.y > surfaceY + 6) return null;
    return insideHorizontalThreshold(outlet, player) ? chosenRoute : null;
}
