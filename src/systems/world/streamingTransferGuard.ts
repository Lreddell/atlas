import { worldManager } from '../WorldManager';
import { compactNeighborPlanes, type NeighborPlanes } from './streamingBorders';
import './streamingGuards';

interface StreamingPostManager {
  postToPool: (message: unknown) => void;
}

const installStreamingTransferGuard = (): void => {
  if (typeof window === 'undefined') return;

  const manager = worldManager as unknown as StreamingPostManager & Record<string, unknown>;
  const installedKey = '__atlasStreamingTransferGuardInstalled';
  if (manager[installedKey]) return;
  manager[installedKey] = true;

  const postToPool = manager.postToPool.bind(manager);
  manager.postToPool = (message: unknown): void => {
    if (!message || typeof message !== 'object') {
      postToPool(message);
      return;
    }

    const payload = message as Record<string, unknown>;
    if (payload.type !== 'MESH') {
      postToPool(message);
      return;
    }

    const lights = payload.lights as (NeighborPlanes & { center?: Uint8Array }) | undefined;
    postToPool({
      ...payload,
      neighbors: compactNeighborPlanes(payload.neighbors as NeighborPlanes | undefined),
      lights: {
        ...compactNeighborPlanes(lights),
        center: lights?.center,
      },
    });
  };
};

installStreamingTransferGuard();
