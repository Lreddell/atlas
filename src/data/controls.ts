// Every binding the game listens for, as the Controls screen lists them. The
// keys themselves are fixed (handled in playerInput.ts, App.tsx and the
// interaction controller); keep this list in step when one changes.

export interface ControlGroup {
    title: string;
    bindings: readonly (readonly [keys: string, action: string])[];
}

export const CONTROL_GROUPS: readonly ControlGroup[] = [
    {
        title: 'Movement',
        bindings: [
            ['W A S D / Arrow keys', 'Move'],
            ['Space', 'Jump (double-tap in Creative to fly)'],
            ['Ctrl (hold) / double-tap W', 'Sprint'],
            ['Shift', 'Sneak / fly down / leave a boat'],
            ['C', 'Dodge roll; with Polarity Boots, a magnetic dash, repel leap or wall launch'],
        ],
    },
    {
        title: 'Actions & Items',
        bindings: [
            ['Left Click', 'Break / attack'],
            ['Right Click', 'Place / use / eat / board'],
            ['Middle Click', 'Pick the block you are looking at'],
            ['1-9 / Mouse Wheel', 'Choose a hotbar slot'],
            ['E', 'Inventory'],
            ['Q / Ctrl+Q', 'Drop one item / the whole stack'],
        ],
    },
    {
        title: 'Polarity Boots',
        bindings: [
            ['R', 'Flip polarity'],
            ['N', 'Switch polarity power on or off (upgraded boots)'],
        ],
    },
    {
        title: 'Camera',
        bindings: [
            ['F5', 'Free third person'],
            ['F6', 'Over-the-shoulder third person'],
            ['F7', 'Detached camera: place it, park it, put it back'],
        ],
    },
    {
        title: 'Interface',
        bindings: [
            ['T or /', 'Chat and commands'],
            ['Esc', 'Pause / back'],
            ['O', 'Show the current Vault objective again'],
            ['F1', 'Hide the HUD'],
            ['F3', 'Debug screen (position, biome)'],
            ['F4', 'Texture atlas viewer'],
            ['F8', 'Capture a menu panorama'],
        ],
    },
];
