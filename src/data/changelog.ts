// In-game changelog ("What's New") data.
//
// This is the single source of truth for the in-game update popup. Each entry's
// `version` MUST exactly match the build's APP_VERSION (package.json "version")
// for the auto-popup to trigger when a player updates to that build.
//
// Keep this in sync with CHANGELOG.md / the GitHub release notes. Newest first.

export interface ChangelogSection {
    title: string;
    items: string[];
}

export interface ChangelogEntry {
    /** Must match APP_VERSION exactly, e.g. "v1.0.3-alpha". */
    version: string;
    /** Player-facing label, e.g. "Alpha 1.0.3". */
    displayVersion: string;
    /** ISO date "YYYY-MM-DD", or empty string while unreleased. */
    date: string;
    /** One-line summary shown under the heading. */
    tagline?: string;
    /** Short TL;DR bullets shown in a highlight box. */
    highlights: string[];
    /** Full categorized notes. */
    sections: ChangelogSection[];
}

// Ordered newest -> oldest.
export const CHANGELOG: ChangelogEntry[] = [
    {
        version: 'v1.0.3-alpha',
        displayVersion: 'Alpha 1.0.3',
        date: '',
        tagline: 'Slab & stair polish, smarter lighting, and new music.',
        highlights: [
            'Big slabs & stairs pass: corner stairs, double-slab merging, and correct shading.',
            'Light now flows correctly through and around shaped blocks.',
            'New death music plus an optional calmer night soundtrack (on by default).',
            'Holding Ctrl no longer blocks scroll-wheel hotbar switching.',
        ],
        sections: [
            {
                title: 'Building & Lighting',
                items: [
                    'Stairs now form corner shapes when placed against neighbouring stairs.',
                    'Placing a matching slab onto a slab merges them back into a full block.',
                    'Light passes through the cut-out part of slabs/stairs and is blocked by the solid part — correctly from both sides.',
                    'Smooth lighting and ambient occlusion now shade slabs and stairs properly (no more over-darkening).',
                    'Selection outlines hug the real block silhouette; stair inventory icons are seamless.',
                    'Dropped and held slabs/stairs render as their true shape instead of a full cube.',
                    'Plants and torches follow proper support rules when placed on shaped blocks.',
                ],
            },
            {
                title: 'Audio',
                items: [
                    'Added death music.',
                    'Optional slower, calmer music at night — enabled by default, toggle in Options.',
                ],
            },
            {
                title: 'Fixes',
                items: [
                    'Fixed held shaped items rendering inside-out.',
                    'Fixed double-slab fusion being mis-detected against the player’s collision box.',
                    'Documentation and licensing cleanup.',
                ],
            },
        ],
    },
    {
        version: 'v1.0.2-alpha',
        displayVersion: 'Alpha 1.0.2',
        date: '2026-06-15',
        tagline: 'A large stability, performance, and content update.',
        highlights: [
            'Chunk streaming moved to a unified Web Worker pool — no more severe frame drops at high render distance.',
            'Minecraft-style movement rebuild with real momentum, sprint-jumping, and auto-step.',
            'First slabs & stairs for 9 material families, with full placement control.',
            'New tools, sandstone crafting, and recipes for every new block.',
        ],
        sections: [
            {
                title: 'Performance & Stability',
                items: [
                    'Generation and meshing now run off the main thread in one shared worker pool.',
                    'Dynamic mesher buffers cut per-context mesh memory from ~60 MB to ~5 MB.',
                    'Fixed frame pacing so the FPS limiter no longer undershoots the target.',
                    'Day/night, cloud, and lighting hot paths no longer allocate every frame.',
                    'Fixed the chunk-fade "ghost chunk" glitch and several mount/unmount bugs.',
                ],
            },
            {
                title: 'Movement',
                items: [
                    'Rebuilt on a friction model with real acceleration toward a top-speed equilibrium.',
                    'Sprint-jumping is faster than running, and sprinting no longer cancels mid-air.',
                    'Auto-step up slabs and single stair steps without jumping.',
                ],
            },
            {
                title: 'Building, Items & Crafting',
                items: [
                    'Slabs and stairs for oak, spruce, birch, cherry, cobblestone, stone, sandstone, red sandstone, and brick.',
                    'Top/bottom slab placement and stair facing + upside-down orientation from where you click.',
                    'New swords, hoes, and gold/diamond tools; sandstone crafting; recipes for all new blocks.',
                ],
            },
        ],
    },
];

/** Entry whose version exactly matches the given build version, if any. */
export const getChangelogEntry = (version: string): ChangelogEntry | undefined =>
    CHANGELOG.find((entry) => entry.version === version);

/** Newest entry overall (used when opening the popup manually). */
export const getLatestChangelogEntry = (): ChangelogEntry | undefined => CHANGELOG[0];
