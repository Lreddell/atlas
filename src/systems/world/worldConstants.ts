
import { CHUNK_SIZE, WORLD_HEIGHT } from '../../constants';

export const FACE_DATA = {
    right: {
        dir: [1, 0, 0] as [number, number, number],
        corners: [[1,0,1], [1,0,0], [1,1,0], [1,1,1]],
        aoVectors: [[[0,0,1],[0,-1,0]], [[0,0,-1],[0,-1,0]], [[0,0,-1],[0,1,0]], [[0,0,1],[0,1,0]]]
    },
    left: {
        dir: [-1, 0, 0] as [number, number, number],
        corners: [[0,0,0], [0,0,1], [0,1,1], [0,1,0]],
        aoVectors: [[[0,0,-1],[0,-1,0]], [[0,0,1],[0,-1,0]], [[0,0,1],[0,1,0]], [[0,0,-1],[0,1,0]]]
    },
    top: {
        dir: [0, 1, 0] as [number, number, number],
        corners: [[0,1,1], [1,1,1], [1,1,0], [0,1,0]],
        aoVectors: [[[-1,0,0],[0,0,1]], [[1,0,0],[0,0,1]], [[1,0,0],[0,0,-1]], [[-1,0,0],[0,0,-1]]]
    },
    bottom: {
        dir: [0, -1, 0] as [number, number, number],
        corners: [[0,0,0], [1,0,0], [1,0,1], [0,0,1]],
        aoVectors: [[[-1,0,0],[0,0,-1]], [[1,0,0],[0,0,-1]], [[1,0,0],[0,0,1]], [[-1,0,0],[0,0,1]]]
    },
    front: {
        dir: [0, 0, 1] as [number, number, number],
        corners: [[0,0,1], [1,0,1], [1,1,1], [0,1,1]],
        aoVectors: [[[-1,0,0],[0,-1,0]], [[1,0,0],[0,-1,0]], [[1,0,0],[0,1,0]], [[-1,0,0],[0,1,0]]]
    },
    back: {
        dir: [0, 0, -1] as [number, number, number],
        corners: [[1,0,0], [0,0,0], [0,1,0], [1,1,0]],
        aoVectors: [[[1,0,0],[0,-1,0]], [[-1,0,0],[0,-1,0]], [[-1,0,0],[0,1,0]], [[1,0,0],[0,1,0]]]
    }
};

export const NEIGHBORS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

// Doubled queue sizes for safety with increased height
export const QUEUE_SIZE = 200000;
export const SHARED_SKY_Q = new Int32Array(QUEUE_SIZE * 3);
export const SHARED_BLOCK_Q = new Int32Array(QUEUE_SIZE * 3);
export const SHARED_GEN_Q = new Int32Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT * 2);
