
import { ItemStack } from '../../types';
import { ScheduledTickQueue } from './simulation/ScheduledTickQueue';

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
    chunks: Map<string, Uint8Array>;
    lights: Map<string, Uint8Array>;
    metadata: Map<string, Uint8Array>;
    listeners: Map<string, Set<ChunkUpdateCallback>>;
    furnaces: Map<string, FurnaceState>;
    chests: Map<string, ChestState>;
    scheduledTicks: ScheduledTickQueue;
    simulationTime: number;
    time: number; // Global ticks (0-24000 cycle)
}

export const createWorldState = (): WorldState => ({
    chunks: new Map(),
    lights: new Map(),
    metadata: new Map(),
    listeners: new Map(),
    furnaces: new Map(),
    chests: new Map(),
    scheduledTicks: new ScheduledTickQueue(),
    simulationTime: 0,
    time: 1000 // Start at Day
});
