import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { applyEntityLighting, createEntityLight, type EntityLight } from './materials/entityLighting';
import { easeLight, sampleSmoothLight, type SmoothLight } from './smoothLight';
import { worldLightReader } from './worldLightReader';

/**
 * The world's light where a model stands, for its materials (entityLighting.ts):
 * the voxel sky and block light sampled at a point, eased so walking past a
 * torch or into a cave fades rather than steps. The first sample is taken as is,
 * so a model that appears in the dark doesn't start out lit.
 */
export class EntityWorldLight {
    readonly light: EntityLight = createEntityLight();
    private level: SmoothLight | null = null;
    private readonly sample: SmoothLight = { sky: 1, block: 0 };

    /** Lights these materials by this light (lit materials only; others are left alone). */
    apply(materials: Iterable<THREE.Material>): void {
        for (const material of materials) applyEntityLighting(material, { kind: 'uniform', light: this.light });
    }

    /** Samples the light at a point (a model's middle reads best) and eases toward it. */
    update(x: number, y: number, z: number, dt: number): void {
        sampleSmoothLight(worldLightReader, x, y, z, this.sample);
        if (this.level) easeLight(this.level, this.sample, dt, 10);
        else this.level = { ...this.sample };
        this.light.value.x = this.level.sky;
        this.light.value.y = this.level.block;
    }
}

/** An EntityWorldLight for one model, applied to its materials whenever they change. */
export function useEntityWorldLight(materials: Readonly<Record<string, THREE.Material>>): EntityWorldLight {
    const light = useMemo(() => new EntityWorldLight(), []);
    useEffect(() => light.apply(Object.values(materials)), [light, materials]);
    return light;
}
