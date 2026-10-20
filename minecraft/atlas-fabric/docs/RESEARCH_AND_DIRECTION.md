# Atlas regional milestone: research and direction

Reviewed 20 October 2026. This is a design synthesis with explicit implementation boundaries, not a claim that the reference packs run on Fabric 1.21.1. Exact mod candidates, licenses, dependencies and file hashes are in [MOD_MATRIX.md](MOD_MATRIX.md) and [mod-candidates.json](mod-candidates.json).

## Creative sources and authority

Implemented Atlas content is pinned to main `d7444cb6a56b984a1d9a71e6362419d5d6653fed`. Source code defines what existed. The supplied **Atlas Main World Design Bible Illustrated**, SHA-256 `dacd854bdf6f3d969dccda88a63ffa2e6440b20cb47eb033baeb7ed2db7e0dcd`, was reviewed across all 109 pages: 73 pages of text and 36 illustration plates. It defines aspirations, not completed gameplay.

Pages 38–43 establish Shattered Meridian's stable-camera polarity language and the Warden's directional crystals, reflection, frenzy, lateral reward and regional transformation. Pages 68–73 explicitly favor vertical slices and reject cutting readability, resets or build fairness to produce more bosses. Plates 76 and 104 suggest broad geological silhouettes, ferric ruins, paired red/blue materials and an articulated Warden. The native models retain block proportions and restrained emission; the illustrations are references, not textures pasted onto Minecraft models.

The immediate product is Magnetic Fields plus the Resonant Vault/Bell Titan port. The five-region, 31-boss campaign is future work. Compass Beast, Rail Saint, Twin Poles, the Meridian Engine and the First Surveyor are not in this release.

## What ambitious packs teach us

The final column is our design judgment, not a quotation or a measured verdict on a pack.

| Reference and primary source | Distinct approach | Atlas application and restraint |
|---|---|---|
| [TerraFirmaCraft field guide](https://terrafirmacraft.github.io/Field-Guide/en_us/) | Survival knowledge connects geology, climate, resources and crafting. | Make terrain explain materials and equipment. Adopt an in-game field guide; defer nutrition/season overhauls until a complete survival loop can be tested. |
| [Rebirth of the Night](https://github.com/Rebirth-of-the-Night/Rebirth-of-the-Night) | Custom progression, lore and art connect rising survival risk with reward. | Give regional danger a readable identity. Do not import a global raid/escalation stack that can interrupt an authored boss or destroy a new player's base. |
| [GT New Horizons](https://github.com/GTNewHorizons/GT-New-Horizons-Modpack) | Technology tiers place other mods inside a deliberately authored progression. | Curate recipes and rewards around shared systems. Its extensive crafting and quest scale is a long-term production lesson, not a target grind for this encounter slice. |
| [Enigmatica 2: Expert](https://github.com/EnigmaticaModpacks/Enigmatica2Expert) | A maintained expert-pack project treats integration as ongoing engineering. | Version-lock the whole pack and record compatibility. Avoid gating a combat skill behind several unrelated automation trees. |
| [Create](https://github.com/Creators-of-Create/Create) | Visible machinery and construction tools make engineering part of the world. | The powered induction relay is an initial physical building tool. A full Create integration is deferred: the reviewed Create Fabric project had no target release. |
| [DawnCraft](https://www.curseforge.com/minecraft/modpacks/dawn-craft) | A combat/RPG-oriented pack builds a distinct adventure around quests and encounters. | Commit to one coherent combat controller. Do not install a second player attack or dodge system underneath Atlas's server timing. |
| [Prominence II](https://www.curseforge.com/minecraft/modpacks/prominence-2-hasturian-era) | An authored RPG presentation connects quests, character progression and custom content. | Favor concise discovery and earned abilities. Defer talent trees and broad stat inflation until encounter balance has a stable baseline. Its reviewed Fabric release targets 1.20.1. |
| [RLCraft](https://www.curseforge.com/minecraft/modpacks/rlcraft) | Strong survival difficulty creates a clear pack identity. | Preserve meaningful preparation while rejecting unexplained exceptions in this boss fight. This is a design choice, not evidence that every RLCraft player dislikes difficulty. |
| [All the Mods 10 guides](https://allthemods.github.io/alltheguides/atm10/) | Guides organize a broad set of systems into navigable progression. | Ship discoverability and recipes with content. Atlas needs a narrower identity than a broad collection of parallel progression trees. |
| [Better MC Fabric BMC3](https://www.curseforge.com/minecraft/modpacks/better-mc-fabric-bmc3) | A current Fabric 1.21.1 adventure/vanilla-expansion reference. | Its target-loader availability is useful; adopting a large exploration roster before validating Atlas sites would multiply worldgen conflicts. |
| [Fabulously Optimized](https://github.com/Fabulously-Optimized/fabulously-optimized) | Explicitly curates performance and graphics enhancements. | Keep performance choices distinct from content design, maintain pins and test custom render paths. The first Atlas pack deliberately contains only three external utility/performance mods. |

These sources are primary project descriptions, repositories and guides, not benchmark comparisons. No frame-rate, playtime or player-satisfaction numbers were measured for those packs.

## A concrete player-reported failure to avoid

[ATM10 issue 2559](https://github.com/AllTheMods/ATM-10/issues/2559) reports Cataclysm bosses apparently regenerating damage so quickly that the player could not kill them in pack version 2.42. This is an individual bug report, closed as not planned; it does not establish a current universal Cataclysm defect or prove the report's cause. Our inference is narrower: cross-mod damage, caps and healing must be tested together rather than assumed compatible.

Atlas's playable Warden now has no hidden per-hit cap and does not discard damage at phase thresholds. Crystals absorb 60% in a visible directional wedge rather than supplying global immunity. The native Titan's closed shell takes 25% chip damage; its exposed hanging bell remains the rewarding target. Untouched source reducers remain separately tested so adaptation is not misreported as exact source behavior.

## Curated selection

**Core now:** Atlas, its nested Fabric API and Rhino, Lithium 0.15.4, FerriteCore 7.0.3 and EMI 1.1.24. Performance libraries do not define the game's progression. EMI makes native Atlas recipes discoverable without introducing another combat or music controller.

**Recommended prototypes before a larger content pack:** Farmer's Delight Refabricated for one coherent cooking loop; Lithostitched for future region/biome placement; a single equipment API selected after comparing Accessories with Trinkets. Their compatible releases and transitive dependencies are recorded in the matrix, but they are not installed in this milestone.

**Optional after specific acceptance tests:** Sodium/Iris for rendering, Distant Horizons for distant terrain, ImmediatelyFast for HUD/render optimization, GeckoLib or Player Animator for a future animation backend. Shader profiles must demonstrate readable telegraphs, correct emissive masks and auroras, and faithful field terrain before shipping. Iris 1.8.8 cannot be paired blindly with the newest Sodium merely because both advertise 1.21.1.

**Deferred or excluded:** Better Combat needs a native damage/animation adapter; Combat Roll and Shoulder Surfing duplicate current authorities; Music Triggers would compete with AtlasMusic; Bosses of Mass Destruction and Spectrum need an explicit role in Atlas progression rather than being added as unrelated rewards. Create Fabric is a design reference until a compatible target release exists.

The initial pack uses upstream downloads and cryptographic hashes. Project metadata is not permission to redistribute arbitrary modified JARs. CurseForge exports should reference CurseForge-hosted files in `manifest.json`; Atlas itself belongs in overrides until it has a hosted project/file identity. No pack is being uploaded or published as part of this local delivery.

## Intended experience and next production gates

The region should teach polarity through traversal and practical construction before testing it in combat. The field journal, resource-bearing terraces, caches, axis towers, directional wards and powered relay are initial parts of that loop. The current ecology remains sparse; named sub-biomes and the bible's additional regional creatures are not implemented.

Next, build one compact field workshop with physical item sorting and polarity traversal, one original regional creature that teaches a safe force interaction, and one route-finding landmark. Validate those before expanding the footprint. A second original vault puzzle should teach the same magnetic rules instead of adding another unrelated code-lock minigame. Record blind playtests for tell recognition, melee/ranged participation, first-person readability, recovery after death and the usefulness of the reward. Only then call the region a completed polished release.

The larger campaign follows that proven template: a region definition, materials/ecology, teaching encounters, landmark/site graph, a mechanically distinct boss, a lateral ability and a bounded world change. Do not prebuild 31 empty boss classes or promise a five-region campaign on the strength of this port.
