
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface CameraControlsHandle {
    lock: () => void;
    unlock: () => void;
    getCamera: () => { pos: THREE.Vector3; dir: THREE.Vector3 };
    getRotation: () => { x: number; y: number };
    setRotation: (x: number, y: number) => void;
    getFov: () => number;
}

interface CameraControlsProps {
    onLock: () => void;
    onUnlock: () => void;
    disableMouseLook?: boolean;
}

export const CameraControls = forwardRef<CameraControlsHandle, CameraControlsProps>(({ onLock, onUnlock, disableMouseLook = false }, ref) => {
    const { camera, gl } = useThree();
    const isLocked = useRef(false);
    const lockElRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        lockElRef.current = gl.domElement;
        // ensure it can be focused to receive key events
        if (lockElRef.current) {
            lockElRef.current.tabIndex = -1;
            lockElRef.current.style.outline = 'none';
        }
    }, [gl]);

    useImperativeHandle(ref, () => ({
        lock: () => {
            const el = lockElRef.current;
            if (!el) return;
            if (typeof el.focus === 'function') el.focus();
            const p = (el as any).requestPointerLock?.();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        },
        unlock: () => {
            document.exitPointerLock();
        },
        getCamera: () => {
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            return { pos: camera.position.clone(), dir };
        },
        getRotation: () => ({ x: camera.rotation.x, y: camera.rotation.y }),
        getFov: () => {
            const perspective = camera as THREE.PerspectiveCamera;
            return Number.isFinite(perspective.fov) ? perspective.fov : 70;
        },
        setRotation: (x: number, y: number) => {
            camera.rotation.order = 'YXZ';
            const maxPitch = (Math.PI / 2) - 0.0001;
            camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, x));
            camera.rotation.y = y;
        }
    }));

    useEffect(() => {
        camera.rotation.order = 'YXZ'; 

        const onMouseMove = (e: MouseEvent) => {
            if (!isLocked.current) return;
            if (disableMouseLook) return;
            
            // Defensively handle movement values to prevent NaN propagation
            const mx = Number.isFinite(e.movementX) ? e.movementX : 0;
            const my = Number.isFinite(e.movementY) ? e.movementY : 0;

            camera.rotation.y -= mx * 0.002;
            camera.rotation.x -= my * 0.002;
            camera.rotation.x = Math.max(-1.55, Math.min(1.55, camera.rotation.x));
            
            // Final NaN Check
            if (!Number.isFinite(camera.rotation.x)) camera.rotation.x = 0;
            if (!Number.isFinite(camera.rotation.y)) camera.rotation.y = 0;
        };

        const onPointerLockChange = () => {
            if (lockElRef.current && document.pointerLockElement === lockElRef.current) {
                isLocked.current = true;
                onLock();
            } else {
                isLocked.current = false;
                onUnlock();
            }
        };

        const onPointerLockError = () => {
            isLocked.current = false;
            onUnlock();
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('pointerlockchange', onPointerLockChange);
        document.addEventListener('pointerlockerror', onPointerLockError);
        
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('pointerlockchange', onPointerLockChange);
            document.removeEventListener('pointerlockerror', onPointerLockError);
        };
    }, [camera, onLock, onUnlock, disableMouseLook]);
    
    // Per-frame sanity check for camera
    useFrame(() => {
        if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z)) {
            console.error("Camera position NaN detected, resetting.");
            camera.position.set(0, 100, 0);
        }
        if (!Number.isFinite(camera.rotation.x) || !Number.isFinite(camera.rotation.y) || !Number.isFinite(camera.rotation.z)) {
            console.error("Camera rotation NaN detected, resetting.");
            camera.rotation.set(0, 0, 0);
        }
    });

    return null;
});
