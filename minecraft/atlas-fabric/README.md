# Atlas: Light & Polarity for Fabric 1.21.1

This is the working Atlas-to-Minecraft port. Its implemented-source reference is Atlas main `d7444cb6a56b984a1d9a71e6362419d5d6653fed`.

The 0.1 checkpoint contains Magnetic Fields terrain and the original arena, the three-form Magnetic Warden, Resonant Vaults and Bell Titan, custom equipment, polarity traversal, free/shoulder/detached cameras, timed combat, and all 23 original music tracks. It is a development checkpoint, not a claim that the total-conversion milestone is complete.

## Install

Use Minecraft Java Edition 1.21.1 with Fabric Loader 0.16.14 or newer and Java 21. Place the production `atlas-1.21.1-0.1.0.jar` in the selected instance's `mods` directory. Fabric API and Rhino are nested inside the JAR; separate copies are unnecessary. Both clients and servers need Atlas. A new world or new chunks are required for generated content.

## Play

- F5: independent third person; F6: shoulder camera; F7: place, lock, then release a detached camera.
- C: dodge or magnetic dash. R: flip equipped Polarity Boots. V: enable or disable the boots. O: settings.
- `/atlas guide` explains the adventure. `/atlas locate fields` and `/atlas locate vault` give bearings.
- With cheats/operator permission, `/atlas kit`, `/atlas travel fields`, and `/atlas travel vault` provide quick access.
- Right-click the Magnetic Boss Summoner at the center of the arena. Break each form's lit tower crystals and oppose the Warden's polarity. `/atlas summon warden` is an operator testing shortcut.
- Descend a Listening Spire to enter a Resonant Vault. Complete the chambers to release the inner seal and reach Bell Titan.

## Build and validation

The build requires Java 21, Node.js, FFmpeg, and the source tree at the revision above. Run `npm ci` in this directory, then `gradlew.bat build`. Resource generation imports the actual Atlas TypeScript definitions, geometry, recipes, music, and boss reducers. Production files are under `build/libs`.

`gradlew.bat runServer -Psmoke` and `gradlew.bat runClient -Pclientqa` are opt-in test harnesses with isolated saves under `run`. **Do not use the QA switch for normal play.** Reports are in each run directory's `logs` folder. The latest extended QA run exposed an unverified aurora rendering path; normal production-client launch and a full survival playthrough remain acceptance checks. Build, source-parity tests, server generation/accessibility checks, and earlier camera/input/puzzle checks passed.

## Next milestone

The current brief targets a polished Magnetic Warden regional experience and a curated modpack foundation. The illustrated design bible is an aspirational reference. Its complete campaign, additional bosses, and proposed regions are not implemented by this checkpoint. Detailed research, feature coverage, integration choices, and remaining work will accompany the milestone release.
