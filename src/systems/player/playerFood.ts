export interface FoodState {
    foodLevel: number;        // 0-20
    foodSaturationLevel: number; // 0-foodLevel
    foodExhaustionLevel: number; // 0-4
    foodTickTimer: number;    // 0-80 ticks
    /**
     * Remaining survival ticks of Forager's Reserve. Optional so worlds saved
     * before this experiment hydrate safely with no active effect.
     */
    foragersReserveTicks?: number;
}

export const FORAGERS_RESERVE_DURATION_TICKS = 20 * 90;
export const FORAGERS_RESERVE_EXHAUSTION_FACTOR = 0.55;
const FORAGERS_RESERVE_NUTRITION_THRESHOLD = 9;

export const createFoodState = (): FoodState => ({
    foodLevel: 20,
    foodSaturationLevel: 5,
    foodExhaustionLevel: 0,
    foodTickTimer: 0,
    foragersReserveTicks: 0,
});

export const MAX_EXHAUSTION = 4.0;

export const EXHAUSTION_COSTS = {
    SWIM: 0.01,         // per meter (Sprint Swimming)
    BLOCK_BREAK: 0.005, // per block broken
    SPRINT: 0.1,        // per meter
    JUMP: 0.05,         // per jump
    ATTACK: 0.1,        // per attack landed
    DAMAGE: 0.1,        // per damage instance
    JUMP_SPRINT: 0.2,   // per jump while sprinting
    REGEN: 6.0          // per 1HP healed (Natural Regen)
};

export const hasForagersReserve = (state: FoodState): boolean =>
    (state.foragersReserveTicks ?? 0) > 0;

export const getForagersReserveSeconds = (state: FoodState): number =>
    Math.ceil((state.foragersReserveTicks ?? 0) / 20);

export const addExhaustion = (state: FoodState, amount: number) => {
    const adjustedAmount = hasForagersReserve(state)
        ? amount * FORAGERS_RESERVE_EXHAUSTION_FACTOR
        : amount;
    state.foodExhaustionLevel = Math.min(state.foodExhaustionLevel + adjustedAmount, 40.0);
};

export const eatFood = (state: FoodState, nutrition: number, saturationModifier: number) => {
    state.foodLevel = Math.min(20, state.foodLevel + nutrition);
    state.foodSaturationLevel = Math.min(
        state.foodLevel,
        state.foodSaturationLevel + (nutrition * saturationModifier * 2.0)
    );

    // The current food roster has one deliberately prepared expedition meal:
    // Forager's Bowl (9 nutrition). Snacks remain immediate hunger recovery;
    // a full meal also creates a short preparation window for travel and danger.
    if (nutrition >= FORAGERS_RESERVE_NUTRITION_THRESHOLD) {
        state.foragersReserveTicks = FORAGERS_RESERVE_DURATION_TICKS;
    }
};

// Returns adjusted health after regeneration/starvation
export const tickFood = (
    state: FoodState,
    currentHealth: number,
    gameMode: 'survival' | 'creative' | 'spectator',
    isDead: boolean
): number => {
    if (isDead) {
        state.foragersReserveTicks = 0;
        return currentHealth;
    }
    if (gameMode !== 'survival') return currentHealth;

    const reserveTicks = state.foragersReserveTicks ?? 0;
    if (reserveTicks > 0) {
        state.foragersReserveTicks = reserveTicks - 1;
    }

    // 1. Process Exhaustion
    if (state.foodExhaustionLevel >= MAX_EXHAUSTION) {
        state.foodExhaustionLevel -= MAX_EXHAUSTION;
        if (state.foodSaturationLevel > 0) {
            state.foodSaturationLevel = Math.max(0, state.foodSaturationLevel - 1.0);
        } else {
            state.foodLevel = Math.max(0, state.foodLevel - 1);
        }
    }

    let newHealth = currentHealth;

    // 2. Regeneration
    if (state.foodSaturationLevel > 0 && state.foodLevel >= 20 && currentHealth < 20) {
        state.foodTickTimer++;
        if (state.foodTickTimer >= 10) { // Every 0.5s (10 ticks)
            const healAmount = 1; // 0.5 heart
            newHealth = Math.min(20, currentHealth + healAmount);
            // Saturation boost consumes saturation directly, not via exhaustion
            state.foodSaturationLevel = Math.max(0, state.foodSaturationLevel - 1.5);
            state.foodTickTimer = 0;
        }
    } else if (state.foodLevel >= 18 && currentHealth < 20) {
        state.foodTickTimer++;
        if (state.foodTickTimer >= 80) { // Every 4s (80 ticks)
            newHealth = Math.min(20, currentHealth + 1);
            addExhaustion(state, EXHAUSTION_COSTS.REGEN);
            state.foodTickTimer = 0;
        }
    } else if (state.foodLevel <= 0) {
        state.foodTickTimer++;
        if (state.foodTickTimer >= 80) { // Every 4s
            if (currentHealth > 1) { // Stops at 1HP
                newHealth = Math.max(1, currentHealth - 1);
            }
            state.foodTickTimer = 0;
        }
    } else {
        state.foodTickTimer = 0;
    }

    return newHealth;
};
