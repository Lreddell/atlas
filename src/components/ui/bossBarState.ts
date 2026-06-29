export interface BossBarState {
    bossId: string;
    entityId: number;
    name: string;
    hp: number;
    maxHp: number;
}

export type BossBarAction =
    | { type: 'spawned'; bossId: string; entityId: number; name: string; maxHp: number }
    | { type: 'damaged'; bossId: string; entityId: number; hp: number; maxHp: number }
    | { type: 'defeated'; bossId: string; entityId: number }
    | { type: 'cleared' };

export const reduceBossBarState = (
    state: BossBarState | null,
    action: BossBarAction,
): BossBarState | null => {
    switch (action.type) {
        case 'spawned':
            return {
                bossId: action.bossId,
                entityId: action.entityId,
                name: action.name,
                hp: action.maxHp,
                maxHp: action.maxHp,
            };
        case 'damaged':
            return state?.entityId === action.entityId
                ? { ...state, hp: action.hp, maxHp: action.maxHp }
                : state;
        case 'defeated':
            return state?.entityId === action.entityId ? null : state;
        case 'cleared':
            return null;
    }
};
