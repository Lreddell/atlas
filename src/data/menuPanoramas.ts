export const MENU_PANORAMA_PATH_KEY = 'atlas.menu.panoramaPath';
export const MENU_PANORAMA_LIBRARY_KEY = 'atlas.menu.panoramaLibrary';

export const BUILT_IN_MENU_PANORAMAS = [
    {
        id: 'default:luminous-coast',
        name: 'Luminous Coast',
        url: './assets/panoramas/luminous-coast.png',
        description: 'Built-in default panorama',
    },
    {
        id: 'default:alpha-1.0.1',
        name: 'Classic Atlas',
        url: './assets/panoramas/alpha-1.0.1.png',
        description: 'Original Alpha 1.0.1 panorama',
    },
] as const;

export const DEFAULT_MENU_PANORAMA = BUILT_IN_MENU_PANORAMAS[0];

export const getBuiltInMenuPanorama = (id: string) =>
    BUILT_IN_MENU_PANORAMAS.find((panorama) => panorama.id === id);

export const readStoredMenuPanoramaPath = (): string | null => {
    if (typeof window === 'undefined') return null;
    const savedPath = window.localStorage.getItem(MENU_PANORAMA_PATH_KEY);
    if (!savedPath) return null;

    // The old Electron build seeded this file as a default without adding it to
    // the user's library. Keep deliberate selections, but move that automatic
    // choice to the new bundled default.
    if (savedPath.replace(/\\/g, '/').toLowerCase().endsWith('/panorama-2026-03-10-07-06-34.png')) {
        try {
            const library = JSON.parse(window.localStorage.getItem(MENU_PANORAMA_LIBRARY_KEY) || '[]');
            if (!Array.isArray(library) || !library.includes(savedPath)) return null;
        } catch {
            return null;
        }
    }
    return savedPath;
};
