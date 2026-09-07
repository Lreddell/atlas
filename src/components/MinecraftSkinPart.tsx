import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { minecraftSkinGeometry, type SkinPart } from '../systems/player/minecraftSkinGeometry';
import type { PlayerSkin } from '../systems/player/playerSkins';

export const MinecraftSkinPart: React.FC<{
    skin: PlayerSkin; texture: THREE.Texture | null; part: SkinPart; half?: 'upper' | 'lower';
    position?: [number, number, number]; firstPerson?: boolean;
}> = ({ skin, texture, part, half, position, firstPerson = false }) => {
    const mirrored = !!skin.legacy && (part === 'leftArm' || part === 'leftLeg');
    const sourcePart = mirrored ? (part === 'leftArm' ? 'rightArm' : 'rightLeg') : part;
    const base = useMemo(() => minecraftSkinGeometry(sourcePart, skin.model === 'slim', false, half), [sourcePart, skin.model, half]);
    const layer = useMemo(() => minecraftSkinGeometry(sourcePart, skin.model === 'slim', true, half), [sourcePart, skin.model, half]);
    useEffect(() => () => { base.dispose(); layer.dispose(); }, [base, layer]);
    if (!texture) return null;
    return <group position={position} scale={mirrored ? [-1, 1, 1] : [1, 1, 1]}>
        <mesh geometry={base} castShadow renderOrder={firstPerson ? 999 : 0}>
            <meshLambertMaterial map={texture} depthTest={!firstPerson} depthWrite={!firstPerson} />
        </mesh>
        {(!skin.legacy || part === 'head') && <mesh geometry={layer} castShadow renderOrder={firstPerson ? 1000 : 0}>
            <meshLambertMaterial map={texture} transparent alphaTest={0.01} side={THREE.DoubleSide} depthTest={!firstPerson} depthWrite={!firstPerson} />
        </mesh>}
    </group>;
};
