# Atlas: Light & Polarity for Fabric 1.21.1

Atlas main reference: `d7444cb6a56b984a1d9a71e6362419d5d6653fed`.

The 0.3 checkpoint includes Magnetic Fields terrain and the original arena, the three-form Magnetic Warden, Resonant Vaults and Bell Titan, equipment, polarity traversal, free/shoulder/detached cameras, timed combat, and all 23 original music tracks. It adds three surrounding sub-biomes, lodestone mites and an original Meridian Foundry with physical sorting, carriage and ascent puzzles. Further survival balance and multiplayer playtesting remain open.

## Install

Import `dist/atlas-curseforge-0.3.0.zip` through CurseForge's custom-profile import. The pack pins Lithium, FerriteCore and EMI. These companions are optional for the standalone `atlas-1.21.1-0.3.0.jar`.

The standalone JAR requires Minecraft Java 1.21.1, Fabric Loader 0.16.14 or newer and Java 21. Fabric API and Rhino are nested inside it. Both clients and servers need Atlas. Generated content requires new chunks or a new world. Use an isolated profile; never replace existing saves.

## Play

- F5: independent third person; F6: shoulder camera; F7: fly, park, then release the detached camera.
- C: dodge or magnetic dash. R: flip equipped polarity boots. V: toggle boots. G: upgraded-boots field. J: journal. O: settings.
- `/atlas guide`, `/atlas locate fields` and `/atlas locate vault` are available without operator permission.
- With cheats/operator permission, `/atlas kit`, `/atlas travel fields`, `/atlas travel vault` and `/atlas summon warden` provide quick access.
- Use the summoner at the arena centre. Flank or break directional crystal wards; every weapon can damage the Warden. Sneak-use the altar for a rematch after victory.
- `/atlas locate foundry` finds the new regional workshop. `/atlas travel foundry` is the operator shortcut. Its supplies, signs and journal explain the three machinery tests.
- Descend a Listening Spire to enter the Resonant Vault. Complete both exploration circuits to release the inner seal and reach Bell Titan.

## Build and validation

Use Java 21, Node.js, FFmpeg and the complete Atlas source checkout. Run `npm ci`, then `gradlew.bat build` in this directory. Resource generation imports the actual Atlas definitions, geometry, recipes, music and boss reducers. Production files are under `build/libs`.

`gradlew.bat runServer -Psmoke` and `gradlew.bat runClient -Pclientqa` are isolated opt-in test harnesses. Normal play must not use the QA switch. The 0.3 build passed 18 JVM tests, source/music audits, extended dedicated-server smoke with disk reload and extended client QA with all three companion mods. The remapped production JAR loaded in an authenticated CurseForge client. Full blind survival playthrough and public multiplayer latency testing remain open.

See [feature inventory](docs/FEATURE_INVENTORY.md), [architecture](docs/ARCHITECTURE.md), [research](docs/RESEARCH_AND_DIRECTION.md), [mod matrix](docs/MOD_MATRIX.md) and [pack instructions](pack/README.md). The illustrated design bible's complete campaign is a future goal.
