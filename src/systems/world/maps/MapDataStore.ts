export interface MapMarker { id: string; x: number; z: number; label: string; color: string }
export interface MapData {
    id: string;
    centerX: number;
    centerZ: number;
    scale: number;
    explored: string[];
    markers: MapMarker[];
}

export class MapDataStore {
    private maps = new Map<string, MapData>();
    create(id: string, centerX: number, centerZ: number, scale = 1): MapData {
        const map = { id, centerX, centerZ, scale, explored: [], markers: [] };
        this.maps.set(id, map);
        return structuredClone(map);
    }
    markExplored(id: string, cx: number, cz: number): void {
        const map = this.maps.get(id);
        const key = `${cx},${cz}`;
        if (map && !map.explored.includes(key)) map.explored.push(key);
    }
    addMarker(id: string, marker: MapMarker): void {
        const map = this.maps.get(id);
        if (map) map.markers = [...map.markers.filter((value) => value.id !== marker.id), { ...marker }];
    }
    serialize(): MapData[] { return Array.from(this.maps.values()).map((value) => structuredClone(value)); }
    restore(data: unknown): void {
        this.maps.clear();
        if (!Array.isArray(data)) return;
        for (const map of data) if (map?.id) this.maps.set(map.id, structuredClone(map));
    }
}

export const mapDataStore = new MapDataStore();
