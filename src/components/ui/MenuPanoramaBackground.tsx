import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getDirtBackground } from '../../utils/textures';

const PANORAMA_SPIN_DURATION_SECONDS = 520;
const PANORAMA_REFERENCE_VERTICAL_FOV_DEG = 70;

let panoramaSpinPhaseSeconds = 0;
let panoramaSpinLastTickMs = Date.now();
let panoramaSpinRunning = false;
let panoramaSpinSpeed = 1;

const normalizePanoramaPhase = (value: number) => {
    const mod = value % PANORAMA_SPIN_DURATION_SECONDS;
    return (mod + PANORAMA_SPIN_DURATION_SECONDS) % PANORAMA_SPIN_DURATION_SECONDS;
};

const advancePanoramaPhase = () => {
    const now = Date.now();
    if (panoramaSpinRunning) {
        const deltaSeconds = Math.max(0, Math.min(0.25, (now - panoramaSpinLastTickMs) / 1000));
        panoramaSpinPhaseSeconds = normalizePanoramaPhase(panoramaSpinPhaseSeconds + (deltaSeconds * panoramaSpinSpeed));
    }
    panoramaSpinLastTickMs = now;
};

interface MenuPanoramaBackgroundProps {
    backgroundMode: 'dirt' | 'panorama';
    panoramaBackgroundDataUrl: string | null;
    panoramaFaceDataUrls?: string[] | null;
    panoramaBlur: number;
    panoramaGradient: number;
    panoramaRotationSpeed: number;
    debugFlyMode?: boolean;
}

export const MenuPanoramaBackground: React.FC<MenuPanoramaBackgroundProps> = ({
    backgroundMode,
    panoramaBackgroundDataUrl,
    panoramaFaceDataUrls,
    panoramaBlur,
    panoramaGradient,
    panoramaRotationSpeed,
    debugFlyMode = false,
}) => {
    const [bgPattern, setBgPattern] = useState('');
    const [isDocumentVisible, setIsDocumentVisible] = useState(() => (
        typeof document === 'undefined' ? true : document.visibilityState === 'visible'
    ));
    const [viewportSize, setViewportSize] = useState(() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 1280,
        height: typeof window !== 'undefined' ? window.innerHeight : 720,
    }));

    useEffect(() => {
        setBgPattern(getDirtBackground());
    }, []);

    useEffect(() => {
        const onResize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };

        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const onVisibilityChange = () => {
            setIsDocumentVisible(document.visibilityState === 'visible');
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, []);

    const hasFaceCubemap = !!panoramaFaceDataUrls && panoramaFaceDataUrls.length === 6;
    const usingPanorama = backgroundMode === 'panorama' && (!!panoramaBackgroundDataUrl || hasFaceCubemap);
    const debugPanoramaActive = debugFlyMode && (!!panoramaBackgroundDataUrl || hasFaceCubemap);
    const effectiveUsingPanorama = usingPanorama || debugPanoramaActive;
    const [atlasFaceDataUrls, setAtlasFaceDataUrls] = useState<string[] | null>(null);

    const clampedRotationSpeed = useMemo(() => {
        if (!Number.isFinite(panoramaRotationSpeed)) return 1;
        return Math.max(0, Math.min(4, panoramaRotationSpeed));
    }, [panoramaRotationSpeed]);

    const isRotationOff = clampedRotationSpeed === 0;
    const debugFlyModeRef = useRef(debugFlyMode);
    const isDocumentVisibleRef = useRef(isDocumentVisible);
    const isRotationOffRef = useRef(isRotationOff);
    const clampedRotationSpeedRef = useRef(clampedRotationSpeed);

    useEffect(() => {
        debugFlyModeRef.current = debugFlyMode;
    }, [debugFlyMode]);

    useEffect(() => {
        isDocumentVisibleRef.current = isDocumentVisible;
    }, [isDocumentVisible]);

    useEffect(() => {
        isRotationOffRef.current = isRotationOff;
    }, [isRotationOff]);

    useEffect(() => {
        clampedRotationSpeedRef.current = clampedRotationSpeed;
    }, [clampedRotationSpeed]);

    useEffect(() => {
        advancePanoramaPhase();
        panoramaSpinSpeed = clampedRotationSpeed;

        if (usingPanorama && isDocumentVisible && !isRotationOff && !debugFlyMode) {
            panoramaSpinRunning = true;
            panoramaSpinLastTickMs = Date.now();
        } else {
            panoramaSpinRunning = false;
        }

        return () => {
            if (usingPanorama && !debugFlyMode) {
                advancePanoramaPhase();
                panoramaSpinRunning = false;
            }
        };
    }, [usingPanorama, clampedRotationSpeed, isDocumentVisible, isRotationOff, debugFlyMode]);

    useEffect(() => {
        if (!effectiveUsingPanorama || hasFaceCubemap || !panoramaBackgroundDataUrl) {
            setAtlasFaceDataUrls(null);
            return;
        }

        let isCancelled = false;
        const image = new Image();
        image.decoding = 'async';

        image.onload = () => {
            if (isCancelled) return;

            const srcWidth = image.naturalWidth || image.width;
            const srcHeight = image.naturalHeight || image.height;
            if (srcWidth <= 0 || srcHeight <= 0) {
                setAtlasFaceDataUrls(null);
                return;
            }

            const cellWidth = Math.floor(srcWidth / 4);
            const cellHeight = Math.floor(srcHeight / 3);
            if (cellWidth <= 0 || cellHeight <= 0) {
                setAtlasFaceDataUrls(null);
                return;
            }

            const extractCell = (cellX: number, cellY: number) => {
                const canvas = document.createElement('canvas');
                canvas.width = cellWidth;
                canvas.height = cellHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;
                ctx.drawImage(
                    image,
                    cellX * cellWidth,
                    cellY * cellHeight,
                    cellWidth,
                    cellHeight,
                    0,
                    0,
                    cellWidth,
                    cellHeight,
                );
                return canvas.toDataURL('image/png');
            };

            const front = extractCell(0, 1);
            const right = extractCell(1, 1);
            const back = extractCell(2, 1);
            const left = extractCell(3, 1);
            const bottom = extractCell(1, 0);
            const top = extractCell(1, 2);

            if (!front || !right || !back || !left || !bottom || !top) {
                setAtlasFaceDataUrls(null);
                return;
            }

            setAtlasFaceDataUrls([front, right, back, left, bottom, top]);
        };

        image.onerror = () => {
            if (!isCancelled) setAtlasFaceDataUrls(null);
        };

        image.src = panoramaBackgroundDataUrl;

        return () => {
            isCancelled = true;
        };
    }, [effectiveUsingPanorama, hasFaceCubemap, panoramaBackgroundDataUrl]);

    const cubeFaceMap = useMemo(() => {
        const faces = hasFaceCubemap
            ? panoramaFaceDataUrls
            : atlasFaceDataUrls;

        if (!faces || faces.length !== 6) return null;
        return {
            front: faces[0],
            right: faces[1],
            back: faces[2],
            left: faces[3],
            top: faces[5],
            bottom: faces[4],
        };
    }, [hasFaceCubemap, panoramaFaceDataUrls, atlasFaceDataUrls]);

    const canRenderWebGLPanorama = effectiveUsingPanorama && !!cubeFaceMap;
    const [debugHostEl, setDebugHostEl] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!canRenderWebGLPanorama || !debugHostEl || !cubeFaceMap) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setClearColor(0x2f5cab, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(debugHostEl.clientWidth, debugHostEl.clientHeight, false);
        debugHostEl.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const initialWidth = Math.max(1, debugHostEl.clientWidth);
        const initialHeight = Math.max(1, debugHostEl.clientHeight);
        const initialAspect = initialWidth / initialHeight;
        const camera = new THREE.PerspectiveCamera(PANORAMA_REFERENCE_VERTICAL_FOV_DEG, initialAspect, 0.1, 100000);
        camera.position.set(0, 0, 0);
        camera.rotation.order = 'YXZ';
        camera.rotation.set(THREE.MathUtils.degToRad(-12), -((panoramaSpinPhaseSeconds / PANORAMA_SPIN_DURATION_SECONDS) * Math.PI * 2), 0);

        const loader = new THREE.TextureLoader();
        const mkTex = (src: string, rotDeg = 0) => {
            const tex = loader.load(src);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            tex.center.set(0.5, 0.5);
            tex.rotation = THREE.MathUtils.degToRad(rotDeg);
            tex.needsUpdate = true;
            return tex;
        };

        const texRight = mkTex(cubeFaceMap.right);
        const texLeft = mkTex(cubeFaceMap.left);
        const texTop = mkTex(cubeFaceMap.top, 180);
        const texBottom = mkTex(cubeFaceMap.bottom, 180);
        const texFront = mkTex(cubeFaceMap.front);
        const texBack = mkTex(cubeFaceMap.back);

        const materials = [
            new THREE.MeshBasicMaterial({ map: texRight, side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: texLeft, side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: texTop, side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: texBottom, side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: texFront, side: THREE.BackSide }),
            new THREE.MeshBasicMaterial({ map: texBack, side: THREE.BackSide }),
        ];

        const boxSize = Math.max(viewportSize.width, viewportSize.height) * 4;
        const skybox = new THREE.Mesh(new THREE.BoxGeometry(boxSize, boxSize, boxSize), materials);
        scene.add(skybox);

        const keysDown = new Set<string>();
        const debugPosition = new THREE.Vector3();
        let rafId = 0;
        let lastTick = performance.now();

        const onResize = () => {
            const w = Math.max(1, debugHostEl.clientWidth);
            const h = Math.max(1, debugHostEl.clientHeight);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h, false);
        };

        const onMouseMove = (event: MouseEvent) => {
            if (!debugFlyModeRef.current) return;
            if (document.pointerLockElement !== renderer.domElement) return;
            const movementX = Number.isFinite(event.movementX) ? event.movementX : 0;
            const movementY = Number.isFinite(event.movementY) ? event.movementY : 0;
            camera.rotation.y -= movementX * 0.0025;
            camera.rotation.x -= movementY * 0.0025;
            camera.rotation.x = Math.max(-1.5533, Math.min(1.5533, camera.rotation.x));
        };

        const onKeyDown = (event: KeyboardEvent) => keysDown.add(event.code);
        const onKeyUp = (event: KeyboardEvent) => keysDown.delete(event.code);

        const onClick = () => {
            if (!debugFlyModeRef.current) return;
            if (document.pointerLockElement !== renderer.domElement) {
                const p = renderer.domElement.requestPointerLock?.();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            }
        };

        const animate = (now: number) => {
            const dt = Math.max(0, Math.min(0.05, (now - lastTick) / 1000));
            lastTick = now;

            const forwardIntent = (keysDown.has('KeyW') ? 1 : 0) - (keysDown.has('KeyS') ? 1 : 0);
            const strafeIntent = (keysDown.has('KeyD') ? 1 : 0) - (keysDown.has('KeyA') ? 1 : 0);
            const verticalIntent = (keysDown.has('Space') ? 1 : 0) - ((keysDown.has('ShiftLeft') || keysDown.has('ShiftRight')) ? 1 : 0);

            if (debugFlyModeRef.current) {
                if (forwardIntent || strafeIntent || verticalIntent) {
                    const speed = boxSize * 0.12;
                    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const up = new THREE.Vector3(0, 1, 0);
                    debugPosition.addScaledVector(forward, forwardIntent * speed * dt);
                    debugPosition.addScaledVector(right, strafeIntent * speed * dt);
                    debugPosition.addScaledVector(up, verticalIntent * speed * dt);
                }
                camera.position.copy(debugPosition);
            } else {
                if (isDocumentVisibleRef.current && !isRotationOffRef.current) {
                    panoramaSpinSpeed = clampedRotationSpeedRef.current;
                    panoramaSpinRunning = true;
                    advancePanoramaPhase();
                } else {
                    panoramaSpinRunning = false;
                    panoramaSpinLastTickMs = Date.now();
                }
                camera.position.set(0, 0, 0);
                camera.rotation.set(
                    THREE.MathUtils.degToRad(-12),
                    -((panoramaSpinPhaseSeconds / PANORAMA_SPIN_DURATION_SECONDS) * Math.PI * 2),
                    0
                );
            }

            renderer.render(scene, camera);
            rafId = requestAnimationFrame(animate);
        };

        window.addEventListener('resize', onResize);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        renderer.domElement.addEventListener('click', onClick);

        rafId = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            renderer.domElement.removeEventListener('click', onClick);
            if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();

            skybox.geometry.dispose();
            for (const material of materials) {
                const map = material.map;
                if (map) map.dispose();
                material.dispose();
            }
            renderer.dispose();
            if (renderer.domElement.parentElement === debugHostEl) {
                debugHostEl.removeChild(renderer.domElement);
            }
        };
    }, [canRenderWebGLPanorama, debugHostEl, cubeFaceMap, viewportSize.width, viewportSize.height]);

    return (
        <>
            {!effectiveUsingPanorama && (
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `url(${bgPattern})`,
                        backgroundSize: '64px',
                        imageRendering: 'pixelated',
                    }}
                />
            )}

            {effectiveUsingPanorama && (
                <div className="absolute inset-0" style={{ backgroundColor: '#2f5cab' }} />
            )}

            {canRenderWebGLPanorama && (
                <div className={`absolute inset-0 ${debugFlyMode ? 'pointer-events-auto' : 'pointer-events-none'}`} ref={setDebugHostEl} />
            )}

            {effectiveUsingPanorama && (
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backdropFilter: `blur(${panoramaBlur}px)`,
                        WebkitBackdropFilter: `blur(${panoramaBlur}px)`,
                        background: `linear-gradient(to bottom, rgba(0,0,0,${panoramaGradient}), rgba(0,0,0,${panoramaGradient * 0.45}) 45%, rgba(0,0,0,${panoramaGradient}))`,
                    }}
                />
            )}
        </>
    );
};
