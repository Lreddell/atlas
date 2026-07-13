
import { ItemStack } from '../../types';

export type ChunkUpdateCallback = () => void;

export interface FurnaceState {
    input: ItemStack | null;
    fuel: ItemStack | null;
    output: ItemStack | null;
    burnTime: number;      
    maxBurnTime: number;   
    cookTime: number;      
    maxCookTime: number;   
    lastUpdate: number;    
}

export interface ChestState {
    items: (ItemStack | null)[];
}

export interface WorldState {
    /** Section-based chunk columns (blocks + light + metadata per column). */
    columns: Map<string, import('./chunkColumn').ChunkColumn>;
    listeners: Map<string, Set<ChunkUpdateCallback>>;
    furnaces: Map<string, FurnaceState>;
    chests: Map<string, ChestState>;
    time: number; // Global ticks (0-24000 cycle)
}

export const createWorldState = (): WorldState => ({
    columns: new Map(),
    listeners: new Map(),
    furnaces: new Map(),
    chests: new Map(),
    time: 1000 // Start at Day
});
