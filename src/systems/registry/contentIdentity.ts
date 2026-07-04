import { BlockType } from '../../types';

export type ResourceId = `${string}:${string}`;

const normalizeName = (name: string) => name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const runtimeToResource = new Map<number, ResourceId>();
const resourceToRuntime = new Map<ResourceId, number>();

for (const [name, value] of Object.entries(BlockType)) {
    if (typeof value !== 'number') continue;
    const id = `atlas:${normalizeName(name)}` as ResourceId;
    runtimeToResource.set(value, id);
    resourceToRuntime.set(id, value);
}

export function resourceIdForRuntimeId(id: number): ResourceId | undefined {
    return runtimeToResource.get(id);
}

export function runtimeIdForResourceId(id: string): number | undefined {
    return resourceToRuntime.get(id as ResourceId);
}

export function registerRuntimeContent(id: ResourceId, runtimeId: number): void {
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)) throw new Error(`Invalid resource id: ${id}`);
    const oldId = runtimeToResource.get(runtimeId);
    const oldRuntime = resourceToRuntime.get(id);
    if ((oldId && oldId !== id) || (oldRuntime !== undefined && oldRuntime !== runtimeId)) {
        throw new Error(`Content identity collision: ${id} / ${runtimeId}`);
    }
    runtimeToResource.set(runtimeId, id);
    resourceToRuntime.set(id, runtimeId);
}

export function createContentManifest(): Record<ResourceId, number> {
    return Object.fromEntries(resourceToRuntime.entries()) as Record<ResourceId, number>;
}
