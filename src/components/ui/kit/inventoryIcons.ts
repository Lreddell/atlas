import type { EquipmentSlot } from '../../../types';
import type { PixelPalette } from './PixelArt';

// Faint silhouettes that show what an empty equipment slot takes, and the
// furnace's flame. 12x12 and 14x14 art pixels, drawn at 2x.

const SILHOUETTE: PixelPalette = { o: 'rgba(239, 226, 191, 0.2)' };

const EQUIPMENT_ROWS: Readonly<Record<EquipmentSlot, readonly string[]>> = {
    helmet: [
        '............',
        '............',
        '...oooooo...',
        '..oooooooo..',
        '.oooooooooo.',
        '.oooooooooo.',
        '.ooo....ooo.',
        '.ooo....ooo.',
        '.oo......oo.',
        '............',
        '............',
        '............',
    ],
    chestplate: [
        '............',
        '.oooo..oooo.',
        '.oooooooooo.',
        '.oooooooooo.',
        '.oo.oooo.oo.',
        '...oooooo...',
        '...oooooo...',
        '...oooooo...',
        '...oooooo...',
        '...oooooo...',
        '............',
        '............',
    ],
    leggings: [
        '............',
        '..oooooooo..',
        '..oooooooo..',
        '..oooooooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '............',
        '............',
    ],
    boots: [
        '............',
        '............',
        '............',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '..ooo..ooo..',
        '.oooo.oooo..',
        '.oooo.oooo..',
        '............',
        '............',
        '............',
    ],
    accessory: [
        '............',
        '..o......o..',
        '...o....o...',
        '....o..o....',
        '.....oo.....',
        '....oooo....',
        '...oooooo...',
        '...oooooo...',
        '....oooo....',
        '.....oo.....',
        '............',
        '............',
    ],
};

export const equipmentSilhouette = (slot: EquipmentSlot) => ({ rows: EQUIPMENT_ROWS[slot], palette: SILHOUETTE });

export const FLAME_ROWS = [
    '......o.......',
    '......oo......',
    '.....ooo......',
    '.....oooo.....',
    '....ooooo.o...',
    '....oooooooo..',
    '...ooooyoooo..',
    '...oooyyyooo..',
    '..ooooyyyyooo.',
    '..oooyyYyyooo.',
    '..ooyyYYYyyoo.',
    '...ooyYYYyoo..',
    '....ooyyyoo...',
    '......oo......',
] as const;

export const FLAME_LIT: PixelPalette = { o: '#e2553a', y: '#f39a3a', Y: '#ffe27a' };
export const FLAME_COLD: PixelPalette = { o: 'rgba(179, 164, 124, 0.2)', y: 'rgba(179, 164, 124, 0.2)', Y: 'rgba(179, 164, 124, 0.2)' };
