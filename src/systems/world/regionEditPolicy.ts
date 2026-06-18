export interface EditPosition {
    x: number;
    y: number;
    z: number;
}

export const findFirstBlockedEdit = (
    positions: readonly EditPosition[],
    canEdit: (position: EditPosition) => boolean,
): EditPosition | null => positions.find(position => !canEdit(position)) ?? null;
