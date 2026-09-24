import type * as THREE from 'three';

// Stacks named onBeforeCompile patches on one material (world lighting, the
// viewmodel projection, ...) without one replacing another, and keys the
// compiled program by the set of patches so identical materials share it.

type CompileHook = THREE.Material['onBeforeCompile'];
export type ShaderPatch = (shader: Parameters<CompileHook>[0], renderer: Parameters<CompileHook>[1]) => void;

interface PatchState {
    base: CompileHook;
    baseKey: string;
    patches: Map<string, ShaderPatch>;
}

const states = new WeakMap<THREE.Material, PatchState>();

/** Adds `patch` under `id` (once per material) and schedules a recompile. */
export function addShaderPatch(material: THREE.Material, id: string, patch: ShaderPatch): void {
    let state = states.get(material);
    if (!state) {
        state = { base: material.onBeforeCompile, baseKey: material.customProgramCacheKey(), patches: new Map() };
        states.set(material, state);
        const own = state;
        material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
            own.base.call(this, shader, renderer);
            for (const apply of own.patches.values()) apply(shader, renderer);
        };
    }
    if (state.patches.has(id)) return;
    state.patches.set(id, patch);
    const key = `${state.baseKey}|atlas:${[...state.patches.keys()].join('+')}`;
    material.customProgramCacheKey = () => key;
    material.needsUpdate = true;
}

export function hasShaderPatch(material: THREE.Material, id: string): boolean {
    return states.get(material)?.patches.has(id) ?? false;
}
