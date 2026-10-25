# Design improvements through 0.3

The source reference is Atlas main d7444cb. These are implemented native adaptations, not assertions that they existed in that source.

## Encounters

The playable Warden takes ordinary damage through all phases. Crystal wards absorb 60% within visible directional wedges; flanking or breaking them creates openings. Removed hidden per-hit caps, global polarity immunity and lost phase-threshold damage. The Titan's closed shell takes chip damage while its exposed hanging bell remains the best target. Committed attack directions keep telegraphs honest.

Retreat and party wipe clear encounter-owned hazards and reset the Warden. Intro/defeat cinematics restore the chosen camera; Space skips them, and reduced-motion settings disable them. Victory unseals the arena and replaces remaining encounter crystals with beacons. Upgraded boots grant a costly, brief attract/repel field useful outside the arena.

## Environment and exploration

Three native outer sub-biomes surround the exact sampled central arena and source terrace heights. Verge, Barrens and Railgrave differ in surface materials, resources, vegetation, fauna and infrastructure. Native discoveries and a scrollable journal explain the region without a permanent quest overlay.

Ferric reeds turn cultivation into a small material loop: bone meal spreads them, smelting yields iron nuggets, and nuggets feed lodestone mites. Mites follow held nuggets, share magnetic forces, reverse sign when fed and shed a shard with a saved five-minute recovery. They never take dropped player items.

## Original foundry

The Meridian Foundry adds a second kind of dungeon beside the Resonant Vault. Copper trusses, basalt piers, suspended lights, service benches, real machinery and an archive explain its industrial purpose. Terrain-connected stairs and copper entrance ribs provide physical access.

Separation uses dropped metal and native hoppers. Transit uses a real cart, two end markers and a central brake. Ascent uses polarity walls and an upper pressure plate, with an ordinary stair alternative. Shared milestones open a physical archive containing reusable field machinery. Building, repair and alternative solutions remain possible.

Magnetic force is shared by boots, drops, mites and minecarts. Iron backing narrows launch fields; the radial brake is deliberately unbacked. Rail-axis projection prevents sideways force becoming forward cart speed, and attraction damping makes the brake usable.

## Vault and presentation

The source Resonant Vault retains its authored rooms, three layouts, original puzzles, enemies, Titan and two escape routes. Archives add the nine-switch Harmonic Lock. Surface travel respects actual terrain; completed escape settles loaded hazard floors. All 23 original music tracks retain checksums, with native biome/context selection, authored loops and one music authority. The aurora night test was corrected; native models, block-density textures, glow masks and animation replace direct source rendering.

## Distribution

CurseForge is the primary local instance. The standalone Atlas JAR nests Fabric API and Rhino; the small companion pack pins Lithium, FerriteCore and EMI. Remapped-JAR checks cover both mixin refmaps, bundled dependencies, Java bytecode and music checksums. Live harness failures now fail their Gradle tasks instead of looking like successful tests merely because Minecraft shut down cleanly.
