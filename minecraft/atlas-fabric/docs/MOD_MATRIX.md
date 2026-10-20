# Fabric 1.21.1 candidate matrix

Verified against official Modrinth project/version metadata on 2026-10-20. Availability is not integration proof. Project-level licenses are reported as metadata, not a substitute for reading the chosen artifact license. The downloadable pack uses upstream URLs and hashes, not repackaged third-party JARs.

| Candidate | Exact compatible version reviewed | License | Required dependencies | Decision |
|---|---|---|---|---|
| [Accessories](https://modrinth.com/mod/accessories) | 1.1.0-beta.54+1.21.1 | MIT | owo-lib, fabric-api | Deferred; choose one equipment API |
| [Better Combat](https://modrinth.com/mod/better-combat) | 2.4.0+1.21.1-fabric | LicenseRef-All-Rights-Reserved | playeranimator, fabric-api, cloth-config | Deferred; needs an Atlas damage/animation adapter |
| [Bosses of Mass Destruction](https://modrinth.com/mod/bosses-of-mass-destruction) | 1.10.2-1.21.1 | LGPL-3.0-only | fabric-api, geckolib, cloth-config, fabric-language-kotlin, cardinal-components-api | Reference; do not add a competing boss progression |
| [Cloth Config API](https://modrinth.com/mod/cloth-config) | 15.0.140+fabric | LGPL-3.0-only | None declared | Optional dependency; native settings already exist |
| [Combat Roll](https://modrinth.com/mod/combat-roll) | 2.0.6+1.21.1-fabric | GPL-3.0-only | playeranimator, cloth-config, fabric-api | Excluded from initial pack; duplicate dodge authority |
| [Create Fabric](https://modrinth.com/mod/create-fabric) | — | MIT | None declared | Unavailable for target; design reference |
| [Distant Horizons](https://modrinth.com/mod/distanthorizons) | 3.3.3-1.21.1 | LGPL-3.0-only | None declared | Optional; field terrain and shader validation pending |
| [EMI](https://modrinth.com/mod/emi) | 1.1.24+1.21.1+fabric | MIT | None declared | Core |
| [Fabric API](https://modrinth.com/mod/fabric-api) | 0.116.17+1.21.1 | Apache-2.0 | None declared | Core - nested inside Atlas |
| [Fabric Language Kotlin](https://modrinth.com/mod/fabric-language-kotlin) | 1.14.2+kotlin.2.4.21 | Apache-2.0 | None declared | Dependency only when a selected mod needs it |
| [Farmer's Delight Refabricated](https://modrinth.com/mod/farmers-delight-refabricated) | 1.21.1-3.3.6 | MIT | fabric-api | Recommended future survival prototype |
| [FerriteCore](https://modrinth.com/mod/ferrite-core) | 7.0.3-fabric | MIT | None declared | Core |
| [Geckolib](https://modrinth.com/mod/geckolib) | 4.9.3 | MIT | fabric-api | Optional animation backend after model migration |
| [ImmediatelyFast](https://modrinth.com/mod/immediatelyfast) | 1.6.15+1.21.1-fabric | LGPL-3.0-or-later | None declared | Optional - HUD/render acceptance pending |
| [Iris Shaders](https://modrinth.com/mod/iris) | 1.8.8+1.21.1-fabric | LGPL-3.0-only | sodium | Optional - paired Sodium version required |
| [Jade 🔍](https://modrinth.com/mod/jade) | 15.10.6+fabric | CC-BY-NC-SA-4.0 | None declared | Optional - encounter information filtering required |
| [Lithium](https://modrinth.com/mod/lithium) | mc1.21.1-0.15.4-fabric | LGPL-3.0-only | None declared | Core |
| [Lithostitched](https://modrinth.com/mod/lithostitched) | 1.8.1-fabric-21.1 | MIT | fabric-api | Recommended worldgen foundation prototype |
| [Mod Menu](https://modrinth.com/mod/modmenu) | 11.0.5 | MIT | fabric-api, placeholder-api | Recommended after settings integration |
| [Music Triggers](https://modrinth.com/mod/music-triggers) | 7.0.4 | LGPL-3.0-or-later | the-impossible-library | Excluded; duplicate music manager |
| [playerAnimator](https://modrinth.com/mod/playeranimator) | 2.0.4+1.21.1-fabric | MIT | None declared | Optional animation backend after pose migration |
| [Shoulder Surfing Reloaded](https://modrinth.com/mod/shoulder-surfing-reloaded) | 1.21.1-5.2.0+fabric | MIT | forge-config-api-port, fabric-api | Deferred; duplicate camera authority |
| [Sodium](https://modrinth.com/mod/sodium) | mc1.21.1-0.8.13-fabric | LicenseRef-Polyform-Shield-1.0.0 | None declared | Optional - renderer acceptance pending |
| [Spectrum](https://modrinth.com/mod/spectrum) | 1.10.6-1.21.1-fabric | LGPL-3.0-only | trinkets, cloth-config, revelationary, fabric-api, modonomicon | Optional later arcane prototype |
| [Trinkets](https://modrinth.com/mod/trinkets) | 3.10.0 | MIT | None declared | Deferred; choose one equipment API |

The full machine-readable review, environment declarations, file hashes and upstream source URLs are in `mod-candidates.json`. Pack pins are in `../pack/mods.lock.json`.

Iris 1.8.8 must not be paired blindly with the newest Sodium. Its embedded metadata must determine a compatible renderer pair before that optional profile ships. Atlas does not currently depend on an external animation, camera, dodge, combat or music mod.
