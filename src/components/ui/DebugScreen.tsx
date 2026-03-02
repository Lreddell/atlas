
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { worldManager } from '../../systems/WorldManager';
import { getBiome } from '../../systems/world/biomes';
import { BLOCKS } from '../../data/blocks';
import { CHUNK_SIZE } from '../../constants';
import { APP_VERSION } from '../../constants';
import { BlockType } from '../../types';

interface DebugScreenProps {
    playerPosRef: React.MutableRefObject<THREE.Vector3>;
    cameraRef: React.MutableRefObject<{ getCamera: () => { pos: THREE.Vector3, dir: THREE.Vector3 } } | null>;
    dropsCount: number;
    chunksCount: number;
    renderDistance: number;
    fpsRef: React.MutableRefObject<number>; // New Prop
}

export const DebugScreen: React.FC<DebugScreenProps> = ({ 
    playerPosRef, cameraRef, dropsCount, chunksCount, renderDistance, fpsRef
}) => {
    const leftColRef = useRef<HTMLDivElement>(null);
    const rightColRef = useRef<HTMLDivElement>(null);
    
    // For speed calculation
    const lastPos = useRef(new THREE.Vector3());
    const lastFrameTime = useRef(performance.now());

    // Raycast helper for Target Block
    const getTargetBlock = (origin: THREE.Vector3, dir: THREE.Vector3, range: number) => {
        const pos = origin.clone();
        const step = dir.clone().multiplyScalar(0.05);
        const maxSteps = range / 0.05;
        
        for(let i=0; i<maxSteps; i++) {
            pos.add(step);
            const bx = Math.floor(pos.x);
            const by = Math.floor(pos.y);
            const bz = Math.floor(pos.z);
            
            const type = worldManager.getBlock(bx, by, bz, false);
            if (type !== BlockType.AIR) {
                return { type, x: bx, y: by, z: bz };
            }
        }
        return null;
    };

    useEffect(() => {
        let rafId: number;
        const loop = () => {
            const now = performance.now();
            const delta = (now - lastFrameTime.current) / 1000;
            
            // Only update DOM if enough time passed to be readable (e.g. 10fps update rate for text)
            if (now - lastFrameTime.current > 100) {
                lastFrameTime.current = now;

                if (leftColRef.current && rightColRef.current) {
                    const pos = playerPosRef.current;
                    
                    // Speed Calculation (m/s)
                    const dist = pos.distanceTo(lastPos.current);
                    const speed = delta > 0 ? dist / delta : 0;
                    lastPos.current.copy(pos);

                    const camData = cameraRef.current?.getCamera();
                    const dir = camData ? camData.dir : new THREE.Vector3(0,0,1);
                    
                    let facing = "north";
                    let axis = "-Z";
                    if (Math.abs(dir.x) > Math.abs(dir.z)) {
                        if (dir.x > 0) { facing = "east"; axis = "+X"; }
                        else { facing = "west"; axis = "-X"; }
                    } else {
                        if (dir.z > 0) { facing = "south"; axis = "+Z"; }
                        else { facing = "north"; axis = "-Z"; }
                    }
                    
                    const bx = Math.floor(pos.x);
                    const by = Math.floor(pos.y);
                    const bz = Math.floor(pos.z);
                    
                    const cx = Math.floor(bx / CHUNK_SIZE);
                    const cz = Math.floor(bz / CHUNK_SIZE);
                    
                    const light = worldManager.getLight(bx, by, bz);
                    const biome = getBiome(bx, bz);
                    const eyePos = pos.clone().add(new THREE.Vector3(0, 1.62, 0));
                    const target = getTargetBlock(eyePos, dir, 5.0);
                    
                    const line = (txt: string) => `<span style="background-color: rgba(0, 0, 0, 0.4); padding: 1px 3px; display: inline-block; margin-bottom: 1px;">${txt}</span>`;

                    // Use the fpsRef passed from the Canvas loop
                    const currentFps = fpsRef.current;

                    leftColRef.current.innerHTML = [
                        line(`Atlas v${APP_VERSION}`),
                        line(`${currentFps} fps`), // Real Render FPS
                        line(``),
                        line(`XYZ: ${pos.x.toFixed(3)} / ${pos.y.toFixed(5)} / ${pos.z.toFixed(3)}`),
                        line(`Block: ${bx} ${by} ${bz} [${bx & 15} ${by & 15} ${bz & 15}]`),
                        line(`Chunk: ${bx & 15} ${by & 15} ${bz & 15} in ${cx} ${cz}`),
                        line(`Facing: ${facing} (${axis}) (XY: ${dir.x.toFixed(1)} / ${dir.z.toFixed(1)})`),
                        line(``),
                        line(`Biome: ${biome.name}`),
                        line(`Light: ${Math.max(light.sky, light.block)} (${light.sky} sky, ${light.block} block)`),
                        line(`Speed: ${speed.toFixed(2)} m/s`),
                        line(``),
                        line(`Target Block: ${target ? `${target.x}, ${target.y}, ${target.z}` : 'None'}`),
                        line(`Target Type: ${target ? (BLOCKS[target.type]?.name || target.type) : '_'}`)
                    ].join('<br/>');

                    const perf = (window.performance as any);
                    const mem = perf && perf.memory;
                    const memUsed = mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : 0;
                    const memTotal = mem ? Math.round(mem.jsHeapSizeLimit / 1024 / 1024) : 0;
                    const memPerc = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
                    const memString = mem ? `${memPerc}% ${memUsed}/${memTotal}MB` : 'N/A';
                    
                    const time = worldManager.getTime();
                    const day = Math.floor(time / 24000);
                    const timeOfDay = time % 24000;
                    
                    rightColRef.current.innerHTML = [
                        line(`Engine: React + Three.js`),
                        line(`Mem: ${memString}`),
                        line(`CPU: ${navigator.hardwareConcurrency || '?'} cores`),
                        line(`Display: ${window.innerWidth}x${window.innerHeight}`),
                        line(``),
                        line(`Render Dist: ${renderDistance}`),
                        line(`Chunks Loaded: ${chunksCount}`),
                        line(`Entities: ${dropsCount}`),
                        line(``),
                        line(`Day: ${day}`),
                        line(`Tick: ${timeOfDay} / 24000`)
                    ].join('<br/>');
                }
            }
            rafId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(rafId);
    }, [dropsCount, chunksCount, renderDistance, fpsRef]);

    return (
        <div className="absolute inset-0 pointer-events-none z-[100] text-white font-mono text-sm leading-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] select-none p-1 flex justify-between">
            <div ref={leftColRef} className="text-left items-start flex flex-col min-w-[300px]"></div>
            <div ref={rightColRef} className="text-right items-end flex flex-col min-w-[300px]"></div>
        </div>
    );
};
