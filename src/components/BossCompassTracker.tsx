import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { entityManager } from '../systems/entities/EntityManager';
import { bossCompassState } from '../systems/boss/bossCompassState';
import { viewRig } from '../systems/player/viewRig';

const _ndc = new THREE.Vector3();

/**
 * Projects the live boss into the camera each frame and records whether it is
 * on screen and, if not, which way the HUD compass should point (the Warden
 * hovers above the towers and lunges behind you; losing it is the fastest way
 * to eat a hit).
 */
export const BossCompassTracker: React.FC = () => {
    useFrame(({ camera }) => {
        const boss = entityManager.findBoss();
        if (!boss) {
            bossCompassState.active = false;
            bossCompassState.onScreen = true;
            return;
        }
        bossCompassState.active = true;
        bossCompassState.polarity = boss.polarity;
        const eye = viewRig.eye;
        bossCompassState.distance = Math.hypot(boss.pos.x - eye.x, boss.pos.z - eye.z);
        bossCompassState.above = boss.pos.y > eye.y + 3;
        _ndc.set(boss.pos.x, boss.pos.y + boss.height * 0.5, boss.pos.z).project(camera);
        const behind = _ndc.z > 1;
        const inside = !behind && Math.abs(_ndc.x) <= 0.92 && Math.abs(_ndc.y) <= 0.9;
        bossCompassState.onScreen = inside;
        if (inside) return;
        // Behind the camera the projection mirrors: flip it back so the arrow
        // points the way to turn.
        let x = _ndc.x, y = _ndc.y;
        if (behind) { x = -x; y = -y; }
        bossCompassState.angle = Math.atan2(x, y);
    });
    return null;
};
