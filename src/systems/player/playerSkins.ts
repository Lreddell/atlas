import { useSyncExternalStore } from 'react';

export type SkinModel = 'atlas' | 'classic' | 'slim';
export interface SkinPalette { skin: number; hair: number; jacket: number; jacketDark: number; trousers: number; boot: number }
export interface PlayerSkin {
    id: string; name: string; model: SkinModel; palette: SkinPalette;
    texture?: string; legacy?: boolean; detail?: 'scarf' | 'goggles' | 'vest';
}
const palette = (skin: number, hair: number, jacket: number, jacketDark: number, trousers: number, boot: number): SkinPalette => ({ skin, hair, jacket, jacketDark, trousers, boot });
export const BUILTIN_SKINS: readonly PlayerSkin[] = [
    { id: 'explorer', name: 'Explorer', model: 'atlas', palette: palette(0xe0ac8c, 0x4a2f1f, 0x3b5b8f, 0x2c4470, 0x2b2b35, 0x1b1b22) },
    { id: 'ranger', name: 'Woodland Ranger', model: 'atlas', detail: 'scarf', palette: palette(0x995f43, 0x211b16, 0x526846, 0xc9aa68, 0x373e30, 0x38271f) },
    { id: 'prospector', name: 'Prospector', model: 'atlas', detail: 'goggles', palette: palette(0xd59e72, 0x51372d, 0xa26d35, 0xe1c57e, 0x384956, 0x352c25) },
    { id: 'frost', name: 'Frost Wanderer', model: 'atlas', detail: 'scarf', palette: palette(0xf0c6ac, 0xddd9ca, 0x789ca6, 0xe8e4d6, 0x3c505e, 0x293741) },
    { id: 'engineer', name: 'Field Engineer', model: 'atlas', detail: 'vest', palette: palette(0x754933, 0x201918, 0x963f32, 0xd0ac68, 0x393c45, 0x25242a) },
    { id: 'mariner', name: 'Mariner', model: 'atlas', detail: 'vest', palette: palette(0xc08a62, 0x28252a, 0xe3ddc9, 0x315269, 0x32485b, 0x252c34) },
];
interface SkinLibrary { selected: string; imported: PlayerSkin[] }
const KEY = 'atlas.skins.v1';
function readLibrary(): SkinLibrary {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        const imported = Array.isArray(value?.imported) ? value.imported.filter((s: PlayerSkin) =>
            s && typeof s.id === 'string' && s.id.startsWith('import-') && typeof s.name === 'string' &&
            (s.model === 'classic' || s.model === 'slim') && typeof s.texture === 'string' && s.texture.startsWith('data:image/png;base64,')
        ).slice(0, 16).map((s: PlayerSkin) => ({ ...s, palette: BUILTIN_SKINS[0].palette })) : [];
        return { selected: typeof value?.selected === 'string' ? value.selected : 'explorer', imported };
    } catch { return { selected: 'explorer', imported: [] }; }
}
let library = readLibrary();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useSkinLibrary() { return useSyncExternalStore(subscribe, () => library); }
export function usePlayerSkin() {
    const state = useSkinLibrary();
    return [...BUILTIN_SKINS, ...state.imported].find(s => s.id === state.selected) ?? BUILTIN_SKINS[0];
}
function save(next: SkinLibrary) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw new Error('Skin storage is full or unavailable. Remove an imported skin and try again.'); }
    library = next;
    listeners.forEach(listener => listener());
}
export function equipSkin(skin: PlayerSkin) {
    save({ selected: skin.id, imported: library.imported.map(s => s.id === skin.id ? skin : s) });
}
export function addImportedSkin(skin: PlayerSkin) {
    if (library.imported.length >= 16) throw new Error('Your library has 16 imported skins. Remove one before importing another.');
    save({ ...library, imported: [...library.imported, skin] });
}
export function removeImportedSkin(id: string) {
    save({ selected: library.selected === id ? 'explorer' : library.selected, imported: library.imported.filter(s => s.id !== id) });
}

/** Decode locally and preserve pixel art. No uploads, accounts, or world-save changes. */
export async function importMinecraftSkin(file: File): Promise<PlayerSkin> {
    if (file.size > 2 * 1024 * 1024) throw new Error('Choose a PNG skin smaller than 2 MB.');
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (header.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => header[i] === byte)) throw new Error('Choose a Minecraft skin PNG.');
    const data = new DataView(header.buffer);
    const width = data.getUint32(16), height = data.getUint32(20);
    if (width < 64 || width > 1024 || (width & (width - 1)) !== 0 || (height !== width && height !== width / 2)) {
        throw new Error('Use a 64 × 64 or 64 × 32 skin, or a larger power-of-two version up to 1024 pixels.');
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('This PNG could not be read.')); img.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = width;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Skin import is unavailable on this device.');
        ctx.drawImage(img, 0, 0);
        const scale = width / 64;
        const legacy = height !== width;
        // Old skins often filled unused space with opaque pixels; that is not a hat.
        if (legacy) {
            const hat = ctx.getImageData(32 * scale, 0, 32 * scale, 32 * scale);
            if (hat.data.every((a, i) => i % 4 !== 3 || a === 255)) ctx.clearRect(32 * scale, 0, 32 * scale, 16 * scale);
        }
        const unused = ctx.getImageData(54 * scale, 20 * scale, 2 * scale, 12 * scale);
        const slim = !legacy && unused.data.every((a, i) => i % 4 !== 3 || a === 0);
        return { id: `import-${crypto.randomUUID()}`, name: file.name.replace(/\.png$/i, '').slice(0, 40) || 'Imported Skin',
            model: slim ? 'slim' : 'classic', legacy, palette: BUILTIN_SKINS[0].palette, texture: canvas.toDataURL('image/png') };
    } finally { URL.revokeObjectURL(url); }
}
