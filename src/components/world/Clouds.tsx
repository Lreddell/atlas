import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GlobalNoise } from '../../utils/noise';
import { registerCloudHandlers } from './cloudState';
import {
  CLOUD_SCALE,
  buildCloudFieldLayout,
  cloudFieldTelemetry,
  cloudGridState,
  recordCloudFieldBuild,
} from './cloudField';

const CLOUD_LEVEL = 192;
const CLOUD_HEIGHT = 4;
const CLOUD_SPEED = 1;
const CLOUD_FADE_SECONDS = 0.8;
const CLOUD_DAY_COLOR = new THREE.Color(0xffffff);
const CLOUD_NIGHT_COLOR = new THREE.Color(0x1a1a2e).multiplyScalar(0.4);
const activeCloudMaterials = new Set<THREE.MeshLambertMaterial>();
let cloudNaturalOpacity = 0.8;
let cloudDayFactor = 1;
let onTextureUpdate: ((url: string) => void) | null = null;

interface CloudData {
  width: number;
  height: number;
  data: Uint8Array;
}

interface CloudShaderUniforms {
  gridOffset: { value: THREE.Vector2 };
  maskSize: { value: THREE.Vector2 };
  mask: { value: THREE.DataTexture };
}

const applyCloudAppearance = (material: THREE.MeshLambertMaterial, opacityMultiplier: number): void => {
  material.color.lerpColors(CLOUD_NIGHT_COLOR, CLOUD_DAY_COLOR, cloudDayFactor);
  material.opacity = cloudNaturalOpacity * opacityMultiplier;
};

const updateCloudColor = (dayFactor: number) => {
  cloudDayFactor = THREE.MathUtils.clamp(dayFactor, 0, 1);
  cloudNaturalOpacity = 0.6 + 0.2 * cloudDayFactor;
  for (const material of activeCloudMaterials) {
    material.color.lerpColors(CLOUD_NIGHT_COLOR, CLOUD_DAY_COLOR, cloudDayFactor);
  }
};

const setCloudTexture = (url: string) => onTextureUpdate?.(url);
registerCloudHandlers({ setTexture: setCloudTexture, updateColor: updateCloudColor });

const createMaskTexture = ({ width, height, data }: CloudData): THREE.DataTexture => {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(rgba, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

const createCloudMaterial = (
  side: THREE.Side,
  texture: THREE.DataTexture,
  width: number,
  height: number,
  uniformsRef: React.MutableRefObject<CloudShaderUniforms | null>,
): THREE.MeshLambertMaterial => {
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: cloudNaturalOpacity,
    depthWrite: true,
    depthTest: true,
    side,
  });
  material.customProgramCacheKey = () => 'atlas-fixed-instanced-cloud-field-v1';
  material.onBeforeCompile = (shader) => {
    const uniforms: CloudShaderUniforms = {
      gridOffset: { value: new THREE.Vector2() },
      maskSize: { value: new THREE.Vector2(width, height) },
      mask: { value: texture },
    };
    uniformsRef.current = uniforms;
    shader.uniforms.uCloudGridOffset = uniforms.gridOffset;
    shader.uniforms.uCloudMaskSize = uniforms.maskSize;
    shader.uniforms.uCloudMask = uniforms.mask;
    shader.vertexShader = `
attribute vec2 cloudCell;
varying vec2 vCloudCell;
${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvCloudCell = cloudCell;',
    );
    shader.fragmentShader = `
uniform vec2 uCloudGridOffset;
uniform vec2 uCloudMaskSize;
uniform sampler2D uCloudMask;
varying vec2 vCloudCell;
${shader.fragmentShader}`.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
vec2 cloudMaskUv = fract((vCloudCell + uCloudGridOffset + vec2(0.5)) / uCloudMaskSize);
if (texture2D(uCloudMask, cloudMaskUv).r < 0.5) discard;`,
    );
  };
  applyCloudAppearance(material, 1);
  activeCloudMaterials.add(material);
  return material;
};

export const Clouds: React.FC<{
  isPaused: boolean;
  renderDistance: number;
  fadeInEnabled?: boolean;
  visible?: boolean;
}> = ({ isPaused, renderDistance, fadeInEnabled = true, visible = true }) => {
  const { camera } = useThree();
  const [cloudData, setCloudData] = useState<CloudData | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const frontRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const frontUniforms = useRef<CloudShaderUniforms | null>(null);
  const backUniforms = useRef<CloudShaderUniforms | null>(null);
  const offsetRef = useRef(0);
  const fadeMultiplierRef = useRef(visible ? 1 : 0);

  const generateProceduralClouds = useCallback(() => {
    const width = 256;
    const height = 256;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let n = GlobalNoise.terrain.noise2D(x * 0.03, y * 0.03);
        n += GlobalNoise.terrain.noise2D(x * 0.1, y * 0.1) * 0.5;
        data[y * width + x] = n > 0.4 ? 255 : 0;
      }
    }
    setCloudData({ width, height, data });
  }, []);

  const processImage = useCallback((image: HTMLImageElement) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas 2D unavailable');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      const data = new Uint8Array(image.width * image.height);
      let visiblePixels = 0;
      for (let index = 0; index < data.length; index += 1) {
        const opaque = pixels[index * 4 + 3] > 50 && pixels[index * 4] > 100;
        data[index] = opaque ? 255 : 0;
        if (opaque) visiblePixels += 1;
      }
      if (visiblePixels === 0) throw new Error('Cloud texture contains no visible pixels');
      setCloudData({ width: image.width, height: image.height, data });
    } catch {
      generateProceduralClouds();
    }
  }, [generateProceduralClouds]);

  useEffect(() => {
    onTextureUpdate = (url) => {
      const image = new Image();
      image.onload = () => processImage(image);
      image.onerror = generateProceduralClouds;
      image.src = url;
    };
    let cancelled = false;
    void (async () => {
      for (const url of ['/assets/textures/environment/clouds.png', 'assets/textures/environment/clouds.png']) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const blobUrl = URL.createObjectURL(await response.blob());
          await new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              if (!cancelled) processImage(image);
              URL.revokeObjectURL(blobUrl);
              resolve();
            };
            image.onerror = () => {
              URL.revokeObjectURL(blobUrl);
              reject(new Error('Cloud image load failed'));
            };
            image.src = blobUrl;
          });
          return;
        } catch {
          // Try the next path.
        }
      }
      if (!cancelled) generateProceduralClouds();
    })();
    return () => {
      cancelled = true;
      onTextureUpdate = null;
    };
  }, [generateProceduralClouds, processImage]);

  const layout = useMemo(() => {
    const value = buildCloudFieldLayout(renderDistance);
    recordCloudFieldBuild(value.buildDurationMs);
    return value;
  }, [renderDistance]);

  const maskTexture = useMemo(() => cloudData ? createMaskTexture(cloudData) : null, [cloudData]);
  const geometry = useMemo(() => {
    const value = new THREE.BoxGeometry(CLOUD_SCALE, CLOUD_HEIGHT, CLOUD_SCALE);
    value.setAttribute('cloudCell', new THREE.InstancedBufferAttribute(layout.cells, 2));
    return value;
  }, [layout]);

  const materials = useMemo(() => {
    if (!maskTexture || !cloudData) return null;
    return {
      front: createCloudMaterial(THREE.FrontSide, maskTexture, cloudData.width, cloudData.height, frontUniforms),
      back: createCloudMaterial(THREE.BackSide, maskTexture, cloudData.width, cloudData.height, backUniforms),
    };
  }, [cloudData, maskTexture]);

  useLayoutEffect(() => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let index = 0; index < layout.instanceCount; index += 1) {
      position.set(layout.cells[index * 2] * CLOUD_SCALE, 0, layout.cells[index * 2 + 1] * CLOUD_SCALE);
      matrix.compose(position, quaternion, scale);
      front.setMatrixAt(index, matrix);
      back.setMatrixAt(index, matrix);
    }
    front.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    back.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    front.instanceMatrix.needsUpdate = true;
    back.instanceMatrix.needsUpdate = true;
  }, [layout, materials]);

  useEffect(() => () => {
    geometry.dispose();
  }, [geometry]);

  useEffect(() => () => {
    maskTexture?.dispose();
  }, [maskTexture]);

  useEffect(() => () => {
    if (!materials) return;
    activeCloudMaterials.delete(materials.front);
    activeCloudMaterials.delete(materials.back);
    materials.front.dispose();
    materials.back.dispose();
  }, [materials]);

  useFrame((_, delta) => {
    const targetOpacity = visible ? 1 : 0;
    if (fadeInEnabled) {
      const step = delta / CLOUD_FADE_SECONDS;
      fadeMultiplierRef.current = THREE.MathUtils.clamp(
        fadeMultiplierRef.current + Math.sign(targetOpacity - fadeMultiplierRef.current) * step,
        0,
        1,
      );
      if (Math.abs(fadeMultiplierRef.current - targetOpacity) <= step) fadeMultiplierRef.current = targetOpacity;
    } else {
      fadeMultiplierRef.current = targetOpacity;
    }
    if (materials) {
      applyCloudAppearance(materials.front, fadeMultiplierRef.current);
      applyCloudAppearance(materials.back, fadeMultiplierRef.current);
    }
    if (groupRef.current) groupRef.current.visible = fadeMultiplierRef.current > 0.001;
    if (isPaused || !cloudData) return;

    offsetRef.current += delta * CLOUD_SPEED;
    const worldWidth = cloudData.width * CLOUD_SCALE;
    if (offsetRef.current >= worldWidth) offsetRef.current -= worldWidth;
    const grid = cloudGridState(camera.position.x, camera.position.z, offsetRef.current);
    if (groupRef.current) {
      groupRef.current.position.set(
        grid.gridU * CLOUD_SCALE + offsetRef.current,
        CLOUD_LEVEL,
        grid.gridV * CLOUD_SCALE,
      );
    }
    frontUniforms.current?.gridOffset.value.set(grid.gridU, grid.gridV);
    backUniforms.current?.gridOffset.value.set(grid.gridU, grid.gridV);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as Window & { __ATLAS_CLOUD_TELEMETRY__?: typeof cloudFieldTelemetry }).__ATLAS_CLOUD_TELEMETRY__ = cloudFieldTelemetry;
  }, []);

  if (!materials || !cloudData) return null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={backRef}
        args={[geometry, materials.back, layout.instanceCount]}
        renderOrder={-101}
        frustumCulled={false}
      />
      <instancedMesh
        ref={frontRef}
        args={[geometry, materials.front, layout.instanceCount]}
        renderOrder={-100}
        frustumCulled={false}
      />
    </group>
  );
};
