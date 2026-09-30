import { useFrame } from '@react-three/fiber';
import { recordDevQaFrame } from '../systems/debug/devQa';

// DEV-only. Feeds frame timings and the renderer to the QA bridge. Priority 0
// on purpose: a positive priority would switch off R3F's automatic render.
export const DevQaProbe = () => {
    useFrame(({ gl, scene, camera }) => recordDevQaFrame(gl, scene, camera));
    return null;
};
