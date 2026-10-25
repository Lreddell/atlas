# 0.2 checkpoint evidence

Source: Atlas main d7444cb6a56b984a1d9a71e6362419d5d6653fed.

- Gradle production build: passed, 15 JUnit tests, zero failures/errors.
- Source audit: 249 mapped definitions, 67 source custom entries, one native induction relay, all 23 original music hashes verified.
- Dedicated smoke: generation/accessibility, native redstone relay, encounter reset and persisted progress reload passed.
- Extended client QA with Lithium, FerriteCore and EMI: passed, ten rendered screenshots, camera restoration, input, puzzles, both bosses, journal, aurora and blood moon.
- Remapped JAR: every configured mixin present in its referenced refmap, nested Fabric API and Rhino, Java 21 bytecode and music hashes checked.
- Normal authenticated CurseForge client reached its title screen on 2026-10-20, then the user entered singleplayer. No QA or development launch flags.
- Production JAR SHA256: e9984b60c8fd836d5990a0790fc88bb4d9395dfe095fd7fe33f9fd16cad4fa61.

Generated reports live under run/server/logs and run/client/logs and are excluded from Git. These checks do not establish a full blind survival playthrough, shader compatibility or multiplayer latency behavior. The regional expansion remains unfinished.


# 0.3 regional release evidence

- Production build passed 18 JUnit tests with zero failures/errors.
- Dedicated server passed 288 live checks, including persisted foundry completion loaded from disk, real item/hopper sorting, real cart traversal and settling, shared archive gate, ferric reed cultivation and abandoned-Warden cleanup.
- Source audit passed: 249 source mappings, 67 source custom items, native relay/reed additions, 23 original music SHA256 checksums.
- Remapped production JAR passed client/common mixin-refmap, nested dependency, Java 21 and music-integrity checks.
- REA static artifact inspection: ev_fbf52c462dab43b36aefaa89aa70d9bccc898017c6f0237f570fd3f25f95b424. No integrity contradictions. This is ZIP inventory evidence, not runtime execution proof.
- JAR: atlas-1.21.1-0.3.0.jar, 98,285,895 bytes, SHA256 6be19fe2b7276fc1a18cc5c7a3dee3fb4b19ee7fa356c6ab5934127e42ab056b.

The final complete client tour passed: 15 captures, camera restoration/orbit, eight-way sprint, dodge packet, harmonic puzzle, timed melee, authored music loop, aurora, blood moon, journal, actual foundry pressure-plate activation and mite feeding/sign reversal/recovery plus NBT restoration. The focused regional tour also passed. Outdoor capture now waits for confirmed teleport arrival and stable client biome data; the previous failed capture was not accepted as proof. Visual inspection improved workshop lighting, architecture, sign placement and outdoor framing before delivery.


## Normal production launch verified 2026-10-25

The authenticated CurseForge profile `Atlas - Light and Polarity` (GUID 5a46d1f5-5706-4bd8-a058-c5ee17e8f457) launched the final 0.3 JAR and reached a usable Minecraft 1.21.1/Fabric title screen. The process uses the dedicated CurseForge game directory, no QA/smoke/development flags, and no normal .minecraft game directory. Its installed Atlas JAR hash matches the production artifact above. Minecraft was left running.

The profile's existing Jade, Xaero maps and supporting libraries were preserved. Startup with those additions succeeded; this does not certify every gameplay interaction with them. The portable curated pack continues to contain only the three reviewed companion mods. No existing world was opened or altered during this final launch check.
