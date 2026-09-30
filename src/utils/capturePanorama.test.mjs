import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { capturePanoramaFaces } from './capturePanorama.ts';

function harness(fail = false) {
    const original = { name: 'previous target' };
    let target = original;
    let disposed = false;
    const shots = [];
    const renderer = {
        autoClear: false,
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1,
        getRenderTarget: () => target,
        getActiveCubeFace: () => 3,
        getActiveMipmapLevel: () => 2,
        setRenderTarget(t, face, mip) {
            target = t;
            if (t !== original) t.addEventListener('dispose', () => { disposed = true; });
            else { assert.equal(face, 3); assert.equal(mip, 2); }
        },
        render(scene, camera) {
            if (fail) throw new Error('capture failed');
            if (!scene.isScene) return; // OutputPass draws a full-screen quad.
            shots.push({ scene, origin: camera.position.clone(), dir: camera.getWorldDirection(new THREE.Vector3()), fov: camera.fov, aspect: camera.aspect });
        },
        readRenderTargetPixels(_target, _x, _y, _w, _h, data) {
            data.fill(25, 0, 8); data.fill(200, 8); // bottom and top rows
        },
    };
    return { renderer, shots, restored: () => target === original && !renderer.autoClear && disposed };
}

test('panorama renders six square world views at one origin and preserves the live camera', () => {
    const previousDocument = globalThis.document;
    globalThis.document = { createElement: () => {
        const canvas = {};
        canvas.getContext = () => ({
            createImageData: () => ({ data: new Uint8ClampedArray(16) }),
            putImageData: image => { canvas.pixels = image.data; },
        });
        return canvas;
    } };
    try {
        const h = harness();
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(73, 1.8);
        camera.position.set(51, 72, -80);
        camera.rotation.set(0.6, 0, 0, 'YXZ');
        const rotation = camera.rotation.clone();
        const faces = capturePanoramaFaces(h.renderer, scene, camera, 2);
        assert.equal(h.shots.length, 6);
        for (const shot of h.shots) {
            assert.equal(shot.scene, scene);
            assert.deepEqual(shot.origin, camera.position);
            assert.equal(shot.fov, 90); assert.equal(shot.aspect, 1);
        }
        assert.ok(h.shots[0].dir.x < -0.999);
        assert.ok(h.shots[1].dir.x > 0.999);
        assert.ok(h.shots[2].dir.y < -0.999);
        assert.ok(h.shots[3].dir.y > 0.999);
        assert.ok(h.shots[4].dir.z > 0.999);
        assert.ok(h.shots[5].dir.z < -0.999);
        assert.equal(faces.nz.pixels[0], 200); // readback is flipped upright
        assert.equal(faces.nz.pixels[8], 25);
        assert.ok(camera.rotation.equals(rotation));
        assert.equal(camera.fov, 73);
        assert.ok(h.restored());
    } finally { globalThis.document = previousDocument; }
});

test('capture failure restores the render target and disposes GPU resources', () => {
    const h = harness(true);
    assert.throws(() => capturePanoramaFaces(h.renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 2), /capture failed/);
    assert.ok(h.restored());
});
