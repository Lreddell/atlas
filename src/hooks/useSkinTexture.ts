import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { PlayerSkin } from '../systems/player/playerSkins';

export function useSkinTexture(skin: PlayerSkin) {
    const [loaded, setLoaded] = useState<{ url: string; texture: THREE.Texture } | null>(null);
    useEffect(() => {
        if (!skin.texture) return;
        let cancelled = false;
        const url = skin.texture;
        const texture = new THREE.TextureLoader().load(url, value => {
            if (!cancelled) setLoaded({ url, texture: value });
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return () => { cancelled = true; texture.dispose(); };
    }, [skin.texture]);
    return loaded && loaded.url === skin.texture ? loaded.texture : null;
}

