
export interface FoodState {
    foodLevel: number;        // 0-20
    foodSaturationLevel: number; // 0-foodLevel
    foodExhaustionLevel: number; // 0-4
    foodTickTimer: number;    // 0-80 ticks
}

export const createFoodState = (): FoodState => ({
    foodLevel: 20,
    foodSaturationLevel: 5,
    foodExhaustionLevel: 0,
    foodTickTimer: 0
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

export const addExhaustion = (state: FoodState, amount: number) => {
    state.foodExhaustionLevel = Math.min(state.foodExhaustionLevel + amount, 40.0);
};

export const eatFood = (state: FoodState, nutrition: number, saturationModifier: number) => {
    state.foodLevel = Math.min(20, state.foodLevel + nutrition);
    state.foodSaturationLevel = Math.min(
        state.foodLevel, 
        state.foodSaturationLevel + (nutrition * saturationModifier * 2.0)
    );
};

// Returns adjusted health after regeneration/starvation
export const tickFood = (
    state: FoodState, 
    currentHealth: number, 
    gameMode: 'survival' | 'creative' | 'spectator',
    isDead: boolean
): number => {
    if (gameMode !== 'survival' || isDead) return currentHealth;

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
