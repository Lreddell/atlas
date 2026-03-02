
import { ModPack } from './editorTypes';

const STORAGE_KEY = 'atlas_mod_packs';
const ACTIVE_KEY = 'atlas_active_pack_id';

export const PackStorage = {
    loadAllPacks(): ModPack[] {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error("Failed to parse Mod Packs from storage", e);
            return [];
        }
    },

    saveAllPacks(packs: ModPack[]) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
    },

    savePack(pack: ModPack) {
        const packs = this.loadAllPacks();
        const index = packs.findIndex(p => p.meta.id === pack.meta.id);
        const updatedPack = { ...pack, meta: { ...pack.meta, updatedAt: Date.now() } };
        
        if (index >= 0) {
            packs[index] = updatedPack;
        } else {
            packs.push(updatedPack);
        }
        this.saveAllPacks(packs);
    },

    deletePack(packId: string) {
        const packs = this.loadAllPacks();
        const filtered = packs.filter(p => p.meta.id !== packId);
        this.saveAllPacks(filtered);
        
        if (this.getActivePackId() === packId) {
            this.setActivePackId(null);
        }
    },

    getActivePackId(): string | null {
        return localStorage.getItem(ACTIVE_KEY);
    },

    setActivePackId(id: string | null) {
        if (id) localStorage.setItem(ACTIVE_KEY, id);
        else localStorage.removeItem(ACTIVE_KEY);
    },

    exportPack(pack: ModPack) {
        const data = JSON.stringify(pack, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pack.meta.id}_v${pack.meta.version}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    validatePack(obj: any): obj is ModPack {
        if (!obj || typeof obj !== 'object') return false;
        if (!obj.meta || typeof obj.meta !== 'object') return false;
        if (!obj.meta.id || !obj.meta.name) return false;
        if (!obj.textures || !obj.blocks || !obj.items || !obj.recipes) return false;
        return true;
    }
};
