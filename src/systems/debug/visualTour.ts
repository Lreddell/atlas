// The canonical shots every phase of the visual overhaul is compared on.
//
// All positions are in the world created from the seed below (world name
// "Atlas Tour"), so worldgen puts the same terrain in front of the camera every
// time. Yaw/pitch follow CameraControls: yaw 0 looks toward -Z, +PI/2 toward -X,
// -PI/2 toward +X (sunrise side); positive pitch looks up. `capture: 'pane'`
// shots include DOM UI (HUD, inventory) that a canvas read-back can't see, so
// the tour only stages them and a browser-pane screenshot records them.

export const VISUAL_TOUR_SEED = 'atlas-tour';

export interface VisualTourShot {
    id: string;
    label: string;
    /** Camera (player) position the shot is taken from. */
    position: readonly [number, number, number];
    yaw: number;
    pitch: number;
    /** World time in ticks (0 sunrise, 6000 noon, 12000 sunset, 18000 midnight). */
    time: number;
    bloodMoon?: boolean;
    gameMode?: 'spectator' | 'survival' | 'creative';
    hud?: boolean;
    inventory?: boolean;
    capture?: 'canvas' | 'pane';
    /** Where to stand while `commands` run (e.g. /boss spawn places the boss beside the player). */
    spawnAt?: readonly [number, number, number];
    commands?: readonly string[];
    /** Commands run after the capture to undo the shot's setup. */
    cleanup?: readonly string[];
    settleMs?: number;
}

export const VISUAL_TOUR_SHOTS: readonly VisualTourShot[] = [
    { id: 'day_vista', label: 'Day: river valley vista', position: [534, 105, 425], yaw: 0.8, pitch: -0.22, time: 3000 },
    { id: 'golden_hour', label: 'Late afternoon toward the sunset', position: [534, 100, 425], yaw: Math.PI / 2, pitch: -0.12, time: 11300 },
    { id: 'night', label: 'Night toward the rising moon', position: [534, 100, 425], yaw: -Math.PI / 2, pitch: 0.12, time: 14500 },
    { id: 'blood_moon', label: 'Blood moon', position: [534, 100, 425], yaw: -Math.PI / 2, pitch: 0.3, time: 14500, bloodMoon: true },
    { id: 'shore', label: 'Islands across the water', position: [342, 72, 425], yaw: -Math.PI / 2, pitch: -0.12, time: 4500 },
    { id: 'ocean_horizon', label: 'Open ocean to the render-distance edge', position: [342, 72, 425], yaw: Math.PI / 2, pitch: -0.1, time: 4500 },
    { id: 'underwater', label: 'Underwater looking up', position: [342, 57, 425], yaw: -1.2, pitch: 0.15, time: 4500 },
    { id: 'jungle_lagoon', label: 'Jungle lagoon', position: [407, 100, 199], yaw: 0.5, pitch: -0.45, time: 5000 },
    { id: 'dark_forest', label: 'Dark forest under a cliff', position: [343, 100, 191], yaw: 0.5, pitch: -0.45, time: 5000 },
    { id: 'lush_cave', label: 'Lush cave (glow lichen)', position: [407, 14.2, 775], yaw: Math.PI, pitch: -0.1, time: 6000 },
    {
        id: 'magnetic_fields', label: 'Warden arena', position: [-1588, 141, 1516], yaw: 0, pitch: -0.25, time: 5000,
        spawnAt: [-1590, 134, 1503], commands: ['/boss spawn'], cleanup: ['/boss kill'], settleMs: 2500,
    },
    {
        id: 'hud_inventory', label: 'Survival HUD and inventory', position: [534, 80, 425], yaw: 0.8, pitch: -0.1, time: 5000,
        gameMode: 'survival', hud: true, inventory: true, capture: 'pane',
    },
];
