import React from 'react';
import { BlockType, type ItemStack } from '../types';
import { BLOCKS } from '../data/blocks';

/** Placed under the corresponding body joint, so armor follows every animation. */
export const PlayerArmor: React.FC<{ item?: ItemStack | null; part: 'helmet' | 'chest' | 'shoulder' | 'hips' | 'thigh' | 'shin' | 'boot' }> = ({ item, part }) => {
    if (!item) return null;
    const color = BLOCKS[item.type]?.color ?? '#bfc4c7';
    const plate = (position: [number, number, number], size: [number, number, number], key = 0) => <mesh key={key} position={position} castShadow receiveShadow>
        <boxGeometry args={size} /><meshLambertMaterial color={color} />
    </mesh>;
    switch (part) {
        case 'helmet': return <group>
            {plate([0, 0.5, 0], [0.57, 0.12, 0.57])}
            {plate([-0.265, 0.29, 0.01], [0.055, 0.32, 0.54], 1)}
            {plate([0.265, 0.29, 0.01], [0.055, 0.32, 0.54], 2)}
            {plate([0, 0.29, 0.265], [0.54, 0.32, 0.055], 3)}
            {plate([0, 0.4, -0.265], [0.54, 0.08, 0.055], 4)}
        </group>;
        case 'chest': return <group>{plate([0, 0.35, 0], [0.56, 0.68, 0.33])}{plate([0, 0.39, -0.18], [0.24, 0.42, 0.04], 1)}</group>;
        case 'shoulder': return plate([0, -0.11, 0], [0.27, 0.26, 0.27]);
        case 'hips': return plate([0, 0.76, 0], [0.54, 0.18, 0.31]);
        case 'thigh': return plate([0, -0.17, 0], [0.25, 0.34, 0.25]);
        case 'shin': return plate([0, -0.15, 0], [0.23, 0.29, 0.23]);
        case 'boot': return <group>
            {plate([0, -0.29, -0.025], [0.26, 0.16, 0.29])}
            {plate([0, -0.4, -0.04], [0.27, 0.19, 0.33], 1)}
            {item.type === BlockType.UPGRADED_POLARITY_BOOTS && <mesh position={[0, -0.26, -0.179]}><boxGeometry args={[0.1, 0.065, 0.018]} /><meshLambertMaterial color="#e9e7d5" /></mesh>}
        </group>;
    }
};
