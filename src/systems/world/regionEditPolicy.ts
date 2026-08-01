export interface EditPosition {
    x: number;
    y: number;
    z: number;
}

export const findFirstBlockedEdit = <T extends EditPosition>(
    positions: readonly T[],
    canEdit: (position: T) => boolean,
): T | null => positions.find(position => !canEdit(position)) ?? null;
