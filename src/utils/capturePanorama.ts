import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type CubeFaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

// Keep the menu's existing six-image orientation and atlas format. Its legacy
// py/ny names mean bottom/top, respectively.
export const PANORAMA_FACE_ROTATIONS: Record<CubeFaceKey, [number, number]> = {
    px: [0, Math.PI / 2], nx: [0, -Math.PI / 2],
    py: [-Math.PI / 2, 0], ny: [Math.PI / 2, 0],
    pz: [0, Math.PI], nz: [0, 0],
};

/** Capture the game scene directly, independently of UI canvases and view mode.
 * All six square, 90-degree faces share one origin and simulation instant.
 * The live camera, FOV settings and visible framebuffer are never modified.
 */
export function capturePanoramaFaces(
    renderer: THREE.WebGLRenderer, scene: THREE.Scene, source: THREE.Camera, size: number,
): Record<CubeFaceKey, HTMLCanvasElement> {
    const camera = new THREE.PerspectiveCamera(90, 1,
        (source as THREE.PerspectiveCamera).near || 0.1,
        (source as THREE.PerspectiveCamera).far || 1000);
    source.getWorldPosition(camera.position);
    const yaw = new THREE.Euler().setFromQuaternion(source.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    camera.rotation.order = 'YXZ';
    const target = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
    const output = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false });
    // Offscreen world renders are linear HDR. Apply the same exposure, tone
    // mapping and display colour conversion as the normal game framebuffer.
    const outputPass = new OutputPass();
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel();
    const previousAutoClear = renderer.autoClear;
    const pixels = new Uint8Array(size * size * 4);
    const faces = {} as Record<CubeFaceKey, HTMLCanvasElement>;
    try {
        renderer.autoClear = true;
        for (const face of Object.keys(PANORAMA_FACE_ROTATIONS) as CubeFaceKey[]) {
            const [pitch, offset] = PANORAMA_FACE_ROTATIONS[face];
            camera.rotation.set(pitch, yaw + offset, 0);
            renderer.setRenderTarget(target);
            renderer.render(scene, camera);
            outputPass.render(renderer, output, target, 0, false);
            renderer.readRenderTargetPixels(output, 0, 0, size, size, pixels);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Failed to initialize panorama face canvas.');
            const image = context.createImageData(size, size);
            // WebGL readback starts at the bottom; image rows start at the top.
            const rowBytes = size * 4;
            for (let y = 0; y < size; y++) {
                image.data.set(pixels.subarray((size - 1 - y) * rowBytes, (size - y) * rowBytes), y * rowBytes);
            }
            context.putImageData(image, 0, 0);
            faces[face] = canvas;
        }
        return faces;
    } finally {
        renderer.setRenderTarget(previousTarget, previousFace, previousMip);
        renderer.autoClear = previousAutoClear;
        target.dispose();
        output.dispose();
        outputPass.dispose();
    }
}
