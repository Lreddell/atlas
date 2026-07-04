
import { WorldState, FurnaceState, ChestState } from './worldTypes';
import { ItemStack, BlockType } from '../../types';
import { BLOCKS } from '../../data/blocks';

export type SerializedBlockEntity =
    | { id: 'atlas:furnace'; x: number; y: number; z: number; state: FurnaceState }
    | { id: 'atlas:chest'; x: number; y: number; z: number; state: ChestState };

const cloneStack = (stack: ItemStack | null): ItemStack | null => stack
    ? { ...stack, instance: stack.instance ? structuredClone(stack.instance) : undefined }
    : null;

const parsePosition = (key: string): [number, number, number] | null => {
    const values = key.split(',').map(Number);
    return values.length === 3 && values.every(Number.isFinite) ? values as [number, number, number] : null;
};

export function serializeBlockEntities(state: WorldState): SerializedBlockEntity[] {
    const out: SerializedBlockEntity[] = [];
    for (const [key, furnace] of state.furnaces) {
        const pos = parsePosition(key);
        if (!pos) continue;
        out.push({
            id: 'atlas:furnace', x: pos[0], y: pos[1], z: pos[2],
            state: {
                ...furnace,
                input: cloneStack(furnace.input), fuel: cloneStack(furnace.fuel), output: cloneStack(furnace.output),
            },
        });
    }
    for (const [key, chest] of state.chests) {
        const pos = parsePosition(key);
        if (!pos) continue;
        out.push({ id: 'atlas:chest', x: pos[0], y: pos[1], z: pos[2], state: { items: chest.items.map(cloneStack) } });
    }
    return out;
}

export function restoreBlockEntities(state: WorldState, records: readonly SerializedBlockEntity[] | undefined): void {
    state.furnaces.clear();
    state.chests.clear();
    if (!records) return;
    for (const record of records) {
        if (!record || !Number.isFinite(record.x) || !Number.isFinite(record.y) || !Number.isFinite(record.z)) continue;
        const key = `${record.x},${record.y},${record.z}`;
        if (record.id === 'atlas:furnace') {
            const value = record.state;
            state.furnaces.set(key, {
                input: cloneStack(value.input), fuel: cloneStack(value.fuel), output: cloneStack(value.output),
                burnTime: Number(value.burnTime) || 0,
                maxBurnTime: Number(value.maxBurnTime) || 0,
                cookTime: Number(value.cookTime) || 0,
                maxCookTime: Number(value.maxCookTime) || 10000,
                lastUpdate: Number(value.lastUpdate) || 0,
            });
        } else if (record.id === 'atlas:chest' && Array.isArray(record.state.items)) {
            const items = record.state.items.slice(0, 27).map(cloneStack);
            while (items.length < 27) items.push(null);
            state.chests.set(key, { items });
        }
    }
}

export function getFurnace(state: WorldState, x: number, y: number, z: number): FurnaceState | undefined {
    return state.furnaces.get(`${x},${y},${z}`);
}

export function createFurnace(state: WorldState, x: number, y: number, z: number) {
    if (!state.furnaces.has(`${x},${y},${z}`)) {
        state.furnaces.set(`${x},${y},${z}`, {
            input: null, fuel: null, output: null,
            burnTime: 0, maxBurnTime: 0, cookTime: 0, maxCookTime: 10000, 
            lastUpdate: Date.now()
        });
    }
}

export function removeFurnace(state: WorldState, x: number, y: number, z: number) {
    state.furnaces.delete(`${x},${y},${z}`);
}

export function getChest(state: WorldState, x: number, y: number, z: number): ChestState | undefined {
    return state.chests.get(`${x},${y},${z}`);
}

export function createChest(state: WorldState, x: number, y: number, z: number) {
    state.chests.set(`${x},${y},${z}`, {
        items: Array(27).fill(null)
    });
}

export function removeChest(state: WorldState, x: number, y: number, z: number) {
    state.chests.delete(`${x},${y},${z}`);
}

function canSmelt(f: FurnaceState): boolean {
    if (!f.input) return false;
    const def = BLOCKS[f.input.type];
    if (!def.smeltsInto) return false;
    if (!f.output) return true;
    if (f.output.type !== def.smeltsInto) return false;
    if (f.output.count >= 64) return false;
    return true;
}

function smelt(f: FurnaceState) {
    const def = BLOCKS[f.input!.type];
    const product = def.smeltsInto!;
    f.input!.count--;
    if (f.input!.count <= 0) f.input = null;
    if (f.output) f.output.count++;
    else f.output = { type: product, count: 1 };
}

export function tickTileEntities(
    state: WorldState, 
    delta: number, 
    getBlockFn: (x:number, y:number, z:number)=>BlockType,
    setBlockFn: (x:number, y:number, z:number, t:BlockType, r?:number)=>void,
    getMetadataFn: (x:number, y:number, z:number)=>number
) {
    const ms = delta * 1000;
    state.furnaces.forEach((f, key) => {
        const [x, y, z] = key.split(',').map(Number);
        let blockChanged = false;

        if (f.burnTime > 0) {
            f.burnTime -= ms;
            if (f.burnTime <= 0) f.burnTime = 0;
        }

        const validSmelt = canSmelt(f);

        if (f.burnTime <= 0 && validSmelt && f.fuel) {
            const fuelDef = BLOCKS[f.fuel.type];
            if (fuelDef.isFuel) {
                f.maxBurnTime = fuelDef.fuelValue || 10000;
                f.burnTime = f.maxBurnTime;
                f.fuel.count--;
                if (f.fuel.count <= 0) f.fuel = null;
                
                if (getBlockFn(x,y,z) === BlockType.FURNACE) {
                     const meta = getMetadataFn(x,y,z);
                     setBlockFn(x,y,z, BlockType.FURNACE_ACTIVE, meta);
                     blockChanged = true;
                }
            }
        }

        const isBurning = f.burnTime > 0;
        
        if (!isBurning && !blockChanged && getBlockFn(x,y,z) === BlockType.FURNACE_ACTIVE) {
             const meta = getMetadataFn(x,y,z);
             setBlockFn(x,y,z, BlockType.FURNACE, meta);
             blockChanged = true;
        }

        if (isBurning && validSmelt) {
            f.cookTime += ms;
            if (f.cookTime >= f.maxCookTime) {
                f.cookTime = 0;
                smelt(f);
            }
        } else {
             if (f.cookTime > 0) f.cookTime = 0;
        }
    });
}

export function handleBlockReplaced(state: WorldState, x: number, y: number, z: number, oldType: BlockType, newType: BlockType): ItemStack[] {
    const droppedItems: ItemStack[] = [];
    
    // Check if tile entity type changed (ignoring active/inactive furnace toggle)
    const isFurnaceSwap = (oldType === BlockType.FURNACE && newType === BlockType.FURNACE_ACTIVE) ||
                          (oldType === BlockType.FURNACE_ACTIVE && newType === BlockType.FURNACE);

    if ((oldType === BlockType.FURNACE || oldType === BlockType.FURNACE_ACTIVE) && !isFurnaceSwap) {
        const f = getFurnace(state, x, y, z);
        if (f) {
            if (f.input) droppedItems.push(f.input);
            if (f.fuel) droppedItems.push(f.fuel);
            if (f.output) droppedItems.push(f.output);
        }
        removeFurnace(state, x, y, z);
    }
    
    if (oldType === BlockType.CHEST) {
        const c = getChest(state, x, y, z);
        if (c && c.items) c.items.forEach(it => { if(it) droppedItems.push(it); });
        removeChest(state, x, y, z);
    }

    if ((newType === BlockType.FURNACE || newType === BlockType.FURNACE_ACTIVE) && !isFurnaceSwap) createFurnace(state, x, y, z);
    if (newType === BlockType.CHEST) createChest(state, x, y, z);

    return droppedItems;
}
