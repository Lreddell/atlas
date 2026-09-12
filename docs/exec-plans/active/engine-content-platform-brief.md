# ATLAS ENGINE / CONTENT PLATFORM / AGENT-NATIVE ARCHITECTURE OVERHAUL

You are GPT-6 Astra operating at the highest available reasoning level in Codex.

You are the principal game-engine architect and implementation agent for the
Lreddell/atlas repository.

This is not a planning-only task.

Your responsibility is to investigate the existing Atlas repository, research
relevant current techniques where necessary, design the target architecture,
implement the migration, validate the complete game, repair regressions, document
the resulting architecture, and leave the repository in a state where future
coding agents can implement extremely large Atlas features with dramatically less
repository-wide coordination.

Continue working until the definition of done in this prompt is satisfied or you
are genuinely blocked by something that cannot be solved from the repository,
available tools, local environment, web research, or reasonable engineering
judgment.

Do not stop merely because the task is large.

Do not stop after producing an architecture document or plan.

Do not ask me to manually perform intermediate coding work.

For routine implementation and architecture choices, investigate and make the
best decision yourself. Ask me only when a decision would materially and
irreversibly change player-facing game design, contradict an explicit Atlas
design requirement, or risk unrecoverable loss of existing player data and no
safe default exists. If you can continue independent work while waiting for an
answer, continue.

If at any point work can be parallelized by subagents and doing so will save time
or improve quality, delegate it. Prefer parallel subagents for repository
exploration, architectural audits, research, test analysis, performance analysis,
save-format analysis, and independent code review. For write-heavy work, divide
ownership by non-overlapping subsystem or worktree and integrate deliberately;
do not create uncontrolled overlapping edits.

You own the final integrated result.


======================================================================
1. THE PRODUCT
======================================================================

Atlas is a voxel sandbox/action-adventure game built with TypeScript, React,
Three.js / React Three Fiber, Vite, Web Workers, and an Electron desktop wrapper.

It is not intended to remain a Minecraft-like technical demo.

The planned 1.0 game is a substantially larger authored/procedural action-
adventure sandbox built around multiple distinct regions, regional progression,
large structures, enemies, traversal mechanics, equipment, environmental
systems, required and optional boss fights, persistent world changes, story
progression, and a final boss.

The Atlas Bible is the authority for intended game design wherever it exists.
Existing implemented behavior is the authority for current behavior unless the
Bible or an explicit newer design document supersedes it.

Do NOT invent major story, lore, regions, or player-facing mechanics merely to
prove the new architecture.

This task is about making the engine and repository capable of supporting the
full game, and making that capability legible and usable by future AI agents.


======================================================================
2. PRIMARY OUTCOME
======================================================================

Redesign Atlas so that a future frontier coding agent can receive a goal roughly
like:

    "Implement the entire Scorched region according to
     docs/product-specs/atlas-bible/regions/scorched/"

and autonomously:

- Understand the applicable game design.
- Discover the correct engine extension points.
- Create its blocks, items, recipes, biomes, terrain rules, structures,
  enemies, encounters, loot, regional progression, bosses, audiovisual
  configuration, tests and validation.
- Implement unique mechanics when existing primitives are insufficient.
- Test and inspect the result.
- Run deterministic world-generation tests.
- Drive representative gameplay journeys.
- Capture screenshots and useful state/performance evidence.
- Detect and repair integration failures.
- Produce a reviewable PR.

For ordinary content, adding something should NOT require editing arbitrary
global switch statements, manually allocating magic numeric IDs, or knowing
about unrelated game systems.

A future region should primarily be a new content package composed from stable
engine APIs and reusable gameplay primitives.

A region may still contain custom TypeScript for genuinely unique mechanics.
Do not create an inflexible DSL that reduces every future region or boss to the
same formula.

The desired model is:

    mostly shared primitives + declarative definitions
    plus typed custom extension points for the unique remainder.


======================================================================
3. CURRENT REPOSITORY MUST BE AUDITED, NOT ASSUMED
======================================================================

Before choosing the final implementation:

- Inspect the entire repository structure.
- Inspect the current branch and its relationship to main.
- Read existing design/spec/plan documents.
- Read current tests.
- Read current save and persistence code.
- Trace block/item identity through:
  generation,
  runtime chunks,
  workers,
  geometry,
  interaction,
  inventory,
  recipes,
  containers,
  drops,
  persistence,
  import/export,
  World Editor,
  Electron,
  browser storage.
- Trace entity definitions and behavior.
- Trace biome and world-generation definitions.
- Trace structures.
- Trace progression and region state.
- Trace bosses and encounters.
- Trace audio/music registration.
- Trace texture/material registration.
- Trace worker boundaries and transferable data.
- Trace rendering/chunk lifecycle.
- Trace current developer/debug/test tooling.
- Identify architectural coupling quantitatively where possible.

Do not assume a redesign proposed in this prompt maps perfectly onto the real
code. The required OUTCOMES and INVARIANTS are stronger than any suggested file
name.

Use repository evidence to choose the cleanest final architecture.


======================================================================
4. BASELINE BEFORE MIGRATION
======================================================================

Before changing fundamental architecture, establish a reproducible baseline.

Create or preserve fixtures and automation sufficient to answer:

"What did Atlas do immediately before this overhaul?"

Capture at minimum:

- Current clean typecheck/lint/build state.
- Current complete automated-test result, distinguishing existing failures
  from new failures.
- Browser build.
- Electron build if the environment supports it.
- Representative deterministic world seeds.
- Representative chunk-generation hashes or semantic snapshots.
- Old world/save fixtures from currently supported formats.
- Save -> load -> save behavior.
- Import/export behavior.
- Basic survival world journey.
- Inventory/crafting/smelting/container interactions.
- Block placement/breaking.
- Fluids.
- Equipment.
- Current major structures/progression.
- Magnetic Fields.
- Resonant Vaults.
- Magnetic Warden.
- Bell Titan.
- Current player movement/camera/combat behavior.
- Relevant screenshots for deterministic test scenes.
- Baseline performance metrics on controlled scenes.

Do not encode accidental visual nondeterminism as a strict pixel-perfect
contract.

Do encode semantic behavior that must survive the migration.

If existing failures exist, record them explicitly. The redesign may fix them,
but it may never disguise a new failure as "pre-existing."


======================================================================
5. MIGRATION STRATEGY: ONE TASK, NOT ONE BIG-BANG PATCH
======================================================================

This is one top-level autonomous task, but internally perform an incremental
migration.

Use branch-by-abstraction / parallel-change principles where appropriate:

- Introduce seams around legacy systems.
- Put new architecture behind those seams.
- Migrate callers/domain packages incrementally.
- Keep the application buildable at meaningful checkpoints.
- Compare old/new behavior where practical.
- Remove compatibility layers only after all clients have migrated and parity
  is demonstrated.

Maintain a checked-in execution plan under docs/exec-plans/active/.

The execution plan must contain:

- Current architecture findings.
- Target architecture.
- Invariants.
- Migration phases.
- Progress checklist.
- Decisions and rationale.
- Benchmark results.
- Known problems.
- Deferred work.

Update it while working rather than generating it once and letting it rot.

Commit logical green milestones as you progress.

Do not use a giant destructive rewrite that leaves the repository broken for
hours with no way to identify which migration caused a regression.


======================================================================
6. CONTENT IDENTITY AND THE 256-ID LIMIT
======================================================================

Remove Atlas's architectural dependence on an 8-bit global content-ID space.

The current BlockType-style manual numeric identity must NOT remain the
long-term source-level identity system.

Introduce stable namespaced content identities conceptually equivalent to:

    atlas:stone
    atlas:iron_sword
    atlas:magnetite_bricks
    atlas:vaultsteel_spear

Requirements:

- Stable source-level identity must be independent of enum ordinal and array
  position.
- Blocks and inventory-only items must not be forced into one ID namespace
  merely because the legacy representation did so.
- Runtime numeric representations may and should remain compact where useful.
- World voxel representation must support far more than 256 block types.
- Save representation must remain stable when runtime IDs change.
- Removed/unknown content must fail safely or produce an intentional placeholder
  policy rather than reinterpret itself as another item.
- Existing numeric IDs retain their historical meaning for old saves during
  migration.
- No future content author should manually search for an unused byte value.

Investigate and benchmark reasonable voxel representations, including at least:

A. Uint16Array-based world block storage.
B. Chunk/local palette or packed representations.
C. A hybrid representation if evidence justifies it.

Choose based on:

- CPU cost.
- memory per loaded chunk.
- worker transfer size.
- meshing complexity.
- lookup cost.
- save size.
- migration complexity.
- implementation clarity.
- expected future content scale.
- expected future render distance.

Do not widen unrelated arrays automatically.

Lighting, metadata, biome fields, flags, etc. should retain or receive types
appropriate to THEIR domains.

Create explicit semantic aliases/types for hot representations where that
improves safety without adding runtime cost.


======================================================================
7. SAVE FORMAT AND MIGRATION
======================================================================

Create an explicit versioned persistence architecture.

A world must have a real save-schema version.

Design a migration pipeline where old formats can be upgraded through named,
tested migration steps.

Requirements:

- Current supported worlds remain loadable.
- Migration is deterministic.
- A backup/recovery path exists before destructive desktop migrations.
- Browser and Electron persistence remain supported.
- Export/import remain supported.
- Old content IDs map to the correct new stable content identities.
- Current progression/state survives.
- Containers/inventories/equipment survive.
- Modified chunks survive.
- World Editor compatibility survives or is intentionally migrated.
- Missing content has explicit behavior.
- Corrupt/incompatible saves produce actionable errors rather than silent
  reinterpretation.
- Golden legacy-save fixtures are committed where practical.
- Migration tests cover every supported historical format available in the repo.

Separate:
- persistent content identity,
- current runtime ID,
- and voxel memory representation.

They are not the same problem.


======================================================================
8. ENGINE / GAME CONTENT BOUNDARY
======================================================================

Establish a clear architectural boundary between reusable engine capabilities
and Atlas game content.

A reasonable conceptual target is:

    src/
      engine/
        content/
        world/
        rendering/
        persistence/
        entities/
        combat/
        audio/
        progression/
        devtools/
        ...

      game/
        core/
        regions/
        structures/
        bosses/
        ...

Exact directories may differ if repository evidence supports a better shape.

Critical rule:

Game content may use PUBLIC engine interfaces.

Game content should not import arbitrary private renderer/world internals.

Enforce important dependency directions mechanically with lint rules,
architecture tests, package boundaries, or equivalent tooling.

Do not rely on documentation alone.

Avoid circular feature dependencies.

Prefer narrow, stable public engine capabilities over broad manager objects that
expose everything.


======================================================================
9. CONTENT REGISTRY / CONTENT COMPILER
======================================================================

Build a coherent content-registration system.

Support typed definitions for at least:

- Blocks.
- Items.
- Block families.
- Tools/weapons.
- Armor/equipment.
- Food/consumables.
- Recipes.
- Fuels/smelting.
- Drops.
- Loot tables.
- Biomes.
- Biome decorators/features.
- Structures.
- Entities/enemies.
- Spawn rules.
- Bosses/encounters.
- Region definitions.
- Progression/rewards.
- Audio events/music states.
- Textures/material references.
- Player-facing names/tooltips where applicable.

Do not duplicate the same fact across several registries unless the duplication
is generated.

There should be one authoritative definition for a piece of content and
generated/derived indices where different runtime systems need optimized lookup
tables.

Use build-time code generation where it meaningfully improves:

- runtime lookup speed,
- correctness,
- exhaustive validation,
- stable imports,
- or agent legibility.

Do NOT create code generation simply for novelty.

Provide validation for:

- duplicate IDs,
- malformed IDs,
- missing references,
- missing texture/material references,
- missing audio references,
- illegal recipes,
- invalid loot,
- impossible shape families,
- invalid biome feature references,
- invalid spawn references,
- invalid progression dependencies,
- unreachable required progression,
- duplicate/reused legacy IDs,
- incompatible save identities,
- illegal dependency-layer imports.

A future agent adding a conventional block/item/recipe should normally touch
only the content package that owns it and its assets/tests.


======================================================================
10. DATA-DRIVEN, NOT DATA-IMPRISONED
======================================================================

Move repeated content behavior out of bespoke code when doing so creates a clear
reusable primitive.

Do NOT force arbitrary complex behavior into JSON/YAML.

Use typed TypeScript composition for behavior where it provides better
correctness, discoverability or tooling.

A good rule:

- Static facts -> declarative data/typed definitions.
- Repeated behavior -> reusable capability/behavior primitive.
- Complex stateful mechanic -> deterministic state machine or dedicated typed
  module behind a stable interface.
- Truly unique mechanic -> scoped plugin/extension module.

Future agents must be able to discover which level to use.


======================================================================
11. ENTITIES AND GAMEPLAY COMPOSITION
======================================================================

Audit the current entity architecture.

Improve it so enemies and interactable entities can reuse capabilities without
creating giant inheritance trees or copying whole controllers.

Potential reusable capabilities include concepts such as:

- Health/damage.
- Movement.
- Ground/air/swim movement.
- Navigation.
- Target acquisition.
- Aggro.
- Melee attacks.
- Projectiles.
- Guarding/blocking.
- Stagger.
- Knockback.
- Status effects.
- Loot.
- Spawn/despawn.
- Animation state.
- Sound reactions.
- Faction/allegiance.
- Boss health/objective integration.

Do not convert performance-sensitive voxel systems to object-heavy ECS merely
because ECS is fashionable.

If an ECS/data-oriented entity representation measurably improves entity scale
or architectural clarity, implement it carefully and benchmark it.

Otherwise use simpler component/capability composition.

Favor deterministic/pure decision logic where practical so behavior can be
simulated without rendering the whole game.


======================================================================
12. GENERIC ENCOUNTER AND BOSS FOUNDATIONS
======================================================================

Study the current Magnetic Warden and Bell Titan implementations.

Extract reusable concepts demonstrated by actual code, without flattening the
bosses into one generic template.

The engine should understand generic concepts where they truly recur:

- Encounter lifecycle.
- Spawn/start.
- Arena ownership.
- Objective/boss HUD.
- Health.
- Phase transitions.
- Attack timing.
- Telegraph -> active -> recovery.
- Damage windows.
- Weak points.
- Stagger/punish windows.
- Projectiles.
- Area attacks.
- Environmental hazards.
- Arena mutations.
- Defeat.
- Rewards.
- Cleanup/reset.
- Save/progression state.
- Cinematic handoff.
- Music state.

A boss definition should be able to compose those.

Unique boss mechanics must retain a clean escape hatch.

Magnetic Warden should become one canonical example of a mechanics-heavy,
deterministic multi-phase encounter, not a pile of special cases copied by every
future boss.


======================================================================
13. STRUCTURE / DUNGEON AUTHORING
======================================================================

Study Resonant Vault generation and all simpler structures.

Create or improve reusable structure-generation primitives where justified.

Support concepts such as:

- Templates/pieces.
- Connection ports.
- Placement constraints.
- Palettes/material substitutions.
- Room roles.
- Required path constraints.
- Optional branches.
- Loot anchors.
- Enemy anchors.
- Encounter anchors.
- Puzzle anchors.
- Terrain adaptation.
- Protected volumes.
- Entrance/exit constraints.
- Validation.
- Deterministic generation.

Do not replace specialized procedural algorithms with a generic grammar where
the generic system makes them worse.

The goal is that a future agent can implement a new dungeon primarily by
describing its pieces, rules and unique mechanics instead of rebuilding
placement/connectivity infrastructure.


======================================================================
14. REGION SDK
======================================================================

Create a first-class region concept if one does not already exist cleanly.

A region should have one discoverable composition root describing or linking:

- Identity and display metadata.
- Terrain/world-generation policy.
- Biomes.
- Regional biome distribution.
- Structures/landmarks.
- Enemies/spawning.
- Resources.
- Loot.
- Environmental systems/hazards.
- Music/ambience.
- Required encounters/bosses.
- Optional encounters.
- Entry conditions.
- Completion conditions.
- Persistent regional state.
- Rewards/unlocks.
- Story/progression hooks.
- Region-specific extension modules.
- Validation requirements.

Do not bake current region count or campaign order into the engine.

A future region package should be self-contained enough that an agent can inspect
one directory and understand most of that region.

Create a development-only synthetic/demo region through ONLY the public Region
SDK and public content APIs.

The demo is not player-facing canon.

Its purpose is to prove that the architecture can create a region without
editing engine internals.


======================================================================
15. ENGINE-GAP POLICY
======================================================================

Future content agents must not solve missing engine capability with scattered:

    if (region === "foo")
    if (boss === "bar")

inside unrelated generic systems.

Create and document an ENGINE GAP workflow.

When a content requirement cannot be expressed cleanly through existing public
capabilities, the expected workflow is:

1. State the unmet requirement.
2. Explain why existing primitives cannot represent it.
3. Propose the smallest reusable engine capability that solves the general
   problem.
4. Add/test that capability through the public engine layer.
5. Use it from the content package.

Encode this in the build-region skill and relevant AGENTS guidance.

Where possible, architecture checks should make accidental private-engine
coupling fail visibly.


======================================================================
16. AI-LEGIBLE REPOSITORY KNOWLEDGE
======================================================================

Replace the giant-prompt mentality with progressive disclosure.

Create a concise root AGENTS.md that acts as a map, not an encyclopedia.

It should tell an agent:

- What Atlas is.
- Where canonical design lives.
- Where architecture lives.
- Where active execution plans live.
- Where content lives.
- Where engine APIs live.
- How to run the game.
- How to validate changes.
- How to use developer scenes.
- Where skills live.
- Which invariants are non-negotiable.

Keep detailed knowledge in versioned docs.

Create/normalize a structure approximately like:

    AGENTS.md
    ARCHITECTURE.md

    docs/
      design/
      product-specs/
        atlas-bible/
      architecture/
      exec-plans/
        active/
        completed/
      decisions/
      generated/
      testing/
      performance/
      migration/
      references/

Use the repository's existing useful design/spec/plan history rather than
throwing it away.

Index it.

Mark obsolete documents as historical where appropriate.

Do not let stale plans masquerade as current architecture.

Create mechanically generated content/architecture indexes where useful.

IMPORTANT:
Audit .gitignore immediately.

Repository-local agent instructions, durable documentation and skills must NOT
be globally ignored merely as "AI artifacts."

Replace thousands of generated individual browser/profile ignore entries with
appropriate directory/pattern ignores.


======================================================================
17. ATLAS AGENT SKILLS
======================================================================

Create repository-local reusable skills/playbooks for recurring work.

At minimum, provide equivalent workflows for:

- add-block
- add-item
- add-recipe
- add-biome
- add-enemy
- add-structure
- add-boss
- build-region
- change-worldgen
- migrate-save
- performance-investigation
- visual-regression
- release-validation

Each skill should be concise and procedural.

It should explain:

- Relevant architecture.
- Required inputs.
- Public APIs to use.
- Files/directories normally owned by the task.
- Forbidden shortcuts.
- Validation commands.
- Useful development scenes.
- Common failure modes.
- Definition of done.

The build-region skill should orchestrate the lower-level skills and make clear
when an engine-gap proposal is justified.


======================================================================
18. MACHINE-OBSERVABLE GAME
======================================================================

Make Atlas inspectable by coding agents while running.

For development builds, expose a stable read-only or safely controlled interface
conceptually similar to:

    window.__ATLAS_DEV__

It should provide structured information useful for tests/debugging, such as:

- Current world/seed.
- Player position/state/mode.
- Current biome/region.
- Loaded chunk counts/states.
- Visible chunk/LOD counts.
- Worker job counts.
- Generation/mesh queues.
- Draw calls.
- Triangle counts.
- Geometry/texture counts where available.
- Frame-time samples.
- Active entities.
- Active encounter/boss state.
- Current progression.
- Active music state.
- Save state/readiness.
- Relevant renderer state.

Add safe test-only actions where useful, such as:

- Load named test scene.
- Teleport.
- Equip controlled loadout.
- Spawn test entity.
- Start encounter.
- Advance deterministic setup.
- Request state snapshot.
- Trigger save/reload.
- Capture benchmark.

Do not expose dangerous development controls in production unintentionally.


======================================================================
19. NAMED DETERMINISTIC TEST SCENES
======================================================================

Create repeatable developer scenarios so an agent never has to manually travel
20 minutes to reproduce a feature.

Include useful equivalents of:

- Basic survival smoke world.
- Block/item gallery.
- Biome gallery.
- Structure gallery.
- Combat lab.
- Enemy behavior lab.
- Boss lab.
- Magnetic Warden encounter.
- Bell Titan encounter.
- Lighting/weather scene if applicable.
- Save/load fixture scene.
- Chunk streaming stress scene.
- Render-distance/LOD benchmark scene.
- Region SDK demo.

A scene is allowed to prepare state directly.

But tests of REAL player journeys must still exist separately where setup could
hide a transition bug.


======================================================================
20. COMMAND-LINE / PROGRAMMATIC DEVELOPER TOOLS
======================================================================

Create a coherent developer CLI or npm scripts around machine-readable outputs.

Exact syntax is flexible, but future agents should be able to perform operations
equivalent to:

    atlas validate
    atlas inspect-content <id>
    atlas inspect-region <id>
    atlas generate-chunk --seed ... --cx ... --cz ...
    atlas validate-region <id>
    atlas validate-progression
    atlas test-save-migrations
    atlas benchmark <scene>
    atlas capture <scene>
    atlas list-content
    atlas content-graph

Useful commands should support JSON output.

Provide npm aliases for the most important CI operations.

A reasonable top-level validation command should exist, e.g.:

    npm run atlas:validate

It should run the required static/content/architecture checks without requiring
agents to remember twenty commands.


======================================================================
21. TESTING / EVALUATION
======================================================================

Build a pyramid appropriate to Atlas.

Pure deterministic tests:
- Content resolution.
- Registry behavior.
- Save migrations.
- Generation primitives.
- Geometry/math.
- Progression graphs.
- Loot/recipe relationships.
- Boss state machines.
- Reusable behaviors.

Integration tests:
- Chunk generation through worker/runtime boundaries.
- Save/load.
- Structure generation.
- Region registration.
- Encounter runtime.
- Content asset resolution.

Browser gameplay journeys:
- New world.
- Move/mine/place.
- Craft/use/equip.
- Save/reload.
- Representative region/structure/boss journeys.
- Camera modes.
- Important existing PR behavior.

Visual checks:
- Missing/broken materials.
- NaN/exploded geometry.
- missing chunks.
- obvious LOD holes.
- UI overlap.
- known deterministic views.
- representative lighting scenes.

Architecture checks:
- Illegal imports.
- content -> private engine coupling.
- duplicate registries.
- direct legacy-ID use after migration.
- forbidden manual content-ID allocation.
- unregistered content assets.

Do not create thousands of low-value tests that merely mirror implementation.

Prioritize tests that let a future agent KNOW whether a large generated feature
is actually integrated correctly.


======================================================================
22. PERFORMANCE / STREAMING / LOD FOUNDATION
======================================================================

Atlas is expected to support substantially higher effective view distances and
larger/more complex regions than it does today.

Treat scalable rendering/streaming as part of this foundation, but make
optimization measurement-driven.

First profile the current system.

Expose and record at minimum where available:

- frame-time average/p50/p95/p99;
- draw calls;
- triangle count;
- loaded chunks;
- rendered chunks;
- chunks by lifecycle state;
- generation jobs pending/running/completed/discarded;
- mesh jobs pending/running/completed/discarded;
- worker latency;
- bytes transferred between workers/main thread;
- geometry cache size/hit/miss/eviction;
- generation time;
- meshing time;
- GPU upload time if measurable;
- approximate memory by major world data structure.

Research current voxel-rendering approaches appropriate to Atlas before choosing
a new LOD design.

Architect explicit separation among:

- simulation distance;
- interactive/full voxel distance;
- full-detail render distance;
- intermediate simplified representation(s);
- far terrain representation.

Requirements:

- Distant world should derive from the same deterministic world-generation
  source as nearby world.
- LOD transitions must avoid holes and severe popping.
- Coarse coverage should generally remain until replacement detail is ready.
- Use hysteresis/stable refinement decisions to avoid worker thrash.
- Do not regenerate expensive work every frame.
- Prioritize visible/near/future-needed work intelligently.
- Preserve caves/destructibility assumptions where they matter; do not blindly
  adopt a heightfield-only solution inappropriate for Atlas.
- Prefer indexed/reused geometry where it materially reduces transfer/memory.
- Separate essential terrain readiness from optional decoration where useful.
- Avoid long synchronous main-thread jobs; schedule/yield work where necessary.
- Benchmark representative movement, not only a stationary camera.

Do not promise or hardcode an arbitrary "X chunk render distance" before the
architecture is measured.

Demonstrate a measurable improvement or, at minimum, a demonstrably scalable
new architecture with no unacceptable regression at today's settings.


======================================================================
23. VISUAL / ASSET PIPELINE READINESS
======================================================================

Atlas expects a later substantial texture/material/visual overhaul.

Do NOT invent the final art direction in this engineering task if canonical art
direction is absent.

Do make the engine ready for it.

Audit:

- texture atlas assumptions;
- texture resolution assumptions;
- material creation;
- block material families;
- animation frames;
- model assets;
- lighting hooks;
- biome/environment color policies;
- postprocessing;
- asset lookup;
- asset loading/lifetime.

Make asset registration content-driven and validated.

A future texture overhaul should not require hand-editing render logic for every
block.

Support enough metadata for future region-specific visual identity without
hardcoding every region in the renderer.

Preserve current visuals unless a change is necessary for the architecture or
clearly fixes an existing bug.


======================================================================
24. AUDIO / MUSIC PIPELINE READINESS
======================================================================

Atlas will add substantially more music and sound.

Audit the audio system and make content registration and state transitions
scalable.

Support discoverable definitions for:

- ambient/biome music;
- regional music;
- combat music;
- boss music;
- transition priority;
- positional sound events;
- entity sound sets;
- material/block sound families;
- player cues.

Do not author a huge new soundtrack for this architecture task.

Make future soundtrack/content expansion easy and validated.


======================================================================
25. THE ATLAS BIBLE
======================================================================

Search the repository for the canonical Atlas Bible and current region/story
design documents.

If present:
- index them;
- distinguish canonical/current design from historical experiments;
- create structured companion specifications only where they improve machine
  consumption;
- never alter canonical story/game design merely to fit the engine.

If the complete Bible is NOT present in this repository:
- do not invent it;
- establish docs/product-specs/atlas-bible/ as the canonical location;
- document the expected region/spec structure;
- use existing implemented Atlas content as architectural examples;
- keep the engine generic enough for the later Bible to be added.

For region specs, support the idea of:

    design.md    -> human intent, player experience, rationale
    spec.*       -> machine-checkable requirements/references

Do not duplicate prose mechanically into structured data.
The structured representation should capture requirements an agent or validator
can actually use.


======================================================================
26. CANONICAL IMPLEMENTATION EXAMPLES
======================================================================

After the new architecture is stable, migrate existing content so future agents
have excellent examples.

Use existing systems appropriately, for example:

- Existing ordinary biome/world content as baseline content examples.
- Magnetic Fields as an example of a mechanics-heavy region/biome package.
- Resonant Vaults as an example of a large procedural structure/dungeon.
- Magnetic Warden as an example of a deterministic mechanics-heavy boss.
- Bell Titan as a second boss pattern with different design requirements.

Do not rewrite functioning bespoke mechanics into weaker generic abstractions
merely to make examples look uniform.

The examples should teach agents both:
1. how to use common primitives;
2. when custom implementation is justified.


======================================================================
27. ARCHITECTURAL QUALITY RULES
======================================================================

Optimize for a codebase that both humans and coding agents can understand.

Prefer:

- explicit dependencies;
- deterministic logic;
- narrow interfaces;
- typed boundaries;
- pure functions where practical;
- local feature ownership;
- mechanically checked invariants;
- boring well-supported dependencies;
- generated indexes over manually synchronized lists;
- one source of truth per fact;
- clear ownership of state;
- testable simulation separate from rendering where practical.

Avoid:

- God objects/managers that own unrelated domains;
- giant switch statements over content IDs;
- duplicated registries;
- hidden global side effects;
- stringly typed event soup;
- enormous global event buses for everything;
- import cycles;
- magic numeric IDs;
- hand-synchronized content lists;
- per-region conditionals in generic engine code;
- forced inheritance trees;
- converting every feature into a custom DSL;
- excessive abstraction with no demonstrated second use case;
- object allocation in voxel hot loops without measurement;
- new dependencies where existing/simple code is sufficient.

When choosing abstraction level, extract from demonstrated recurring behavior,
not imagined theoretical reuse.


======================================================================
28. REPOSITORY SELF-MAINTENANCE
======================================================================

Add checks that keep the agent-native environment healthy.

Where appropriate, validate:

- docs links/indexes;
- stale generated docs;
- stale content indexes;
- illegal architecture edges;
- orphan assets;
- missing tests for required migrations;
- unrecorded schema changes;
- unrecorded public content API changes.

If a generated file can drift, provide a check that regenerates or detects it.

Do not require a future human to remember invisible maintenance rituals.


======================================================================
29. PROVE THE NEW "ONE-SHOT REGION" WORKFLOW
======================================================================

After implementing the engine/content architecture, prove it.

Create a DEVELOPMENT-ONLY synthetic region with enough breadth to exercise:

- new blocks;
- at least one item;
- crafting;
- one biome or terrain variant;
- one environmental feature;
- one simple structure;
- one enemy assembled from reusable capabilities;
- one small encounter or boss assembled from public encounter primitives;
- loot;
- progression/completion;
- music/audio registration using existing/test assets;
- persistence.

Do NOT make this canon or expose it as a normal production region.

The proof passes only if this synthetic region is created without editing
private engine implementation files to teach each engine subsystem its specific
content IDs.

Then run the build-region skill against this proof and document:

- what it could express directly;
- what required an engine gap;
- how many files it touched;
- how many were engine files;
- validation output.

The target for conventional region content is zero unrelated private-engine
changes.


======================================================================
30. AUTONOMOUS REVIEW LOOP
======================================================================

Before declaring the overhaul complete:

Use independent subagents/review passes for at least:

- Architecture/coupling.
- Save compatibility/migration risk.
- World-generation determinism.
- Performance/hot paths.
- Browser/Electron integration.
- Gameplay regressions.
- Agent legibility/documentation.
- Test quality/dead tests.
- Dead compatibility code.

Have reviewers identify concrete findings with files and evidence.

Resolve significant findings.

Rerun affected validation.

Do not accept a reviewer conclusion merely because another agent wrote the code.


======================================================================
31. REQUIRED FINAL VALIDATION
======================================================================

At completion, the following must be true or explicitly documented as a genuine
environmental blocker:

- Typecheck passes.
- Lint passes.
- Production browser build passes.
- Electron build passes where available.
- Existing automated tests do not regress.
- New architecture/content tests pass.
- Current representative worlds generate correctly.
- Existing save fixtures migrate/load correctly.
- Export/import works.
- Browser save/load works.
- Desktop save/load works where testable.
- Current major gameplay systems remain functional.
- Magnetic Warden remains functional.
- Bell Titan remains functional.
- Resonant Vault progression remains functional.
- Existing world generation remains deterministic where compatibility requires.
- Content IDs are no longer globally limited to 0-255.
- Stable content identity is separate from runtime/storage ID.
- New ordinary content does not require manual magic-ID allocation.
- Region SDK proof passes.
- Architecture boundary checks pass.
- Agent-facing docs and skills are discoverable.
- Named developer scenes work.
- Runtime inspection interface works.
- Performance baseline and post-change measurements exist.
- No unexplained major performance regression exists.
- No giant stale generated artifacts are committed accidentally.


======================================================================
32. DEFINITION OF DONE
======================================================================

This project is NOT done merely because the legacy BlockType enum disappeared.

It is done when Atlas has become substantially easier for another frontier
coding agent to extend correctly.

Specific proof:

A new coding agent should be able to enter the repository with no previous chat
history, read AGENTS.md, follow repository references, and answer:

- How do I add a block?
- How do I add an item?
- How do I add a recipe?
- How do I add a biome?
- How do I add an enemy?
- How do I build a structure?
- How do I add a boss?
- How do I define a region?
- How do I add a unique region mechanic without contaminating the engine?
- How do I test it?
- How do I inspect the running game?
- How do I benchmark it?
- How do I ensure saves remain compatible?

Then that agent should be capable of implementing those tasks primarily through
the public content/engine interfaces.

The repository should contain enough automated feedback that the agent can
distinguish "code compiled" from "feature actually integrated."


======================================================================
33. FINAL REPORT
======================================================================

When all work is complete, provide a concise but technically substantive report
containing:

- What architecture existed before.
- What architecture now exists.
- Major design decisions and alternatives rejected.
- Exact 256-ID/storage solution selected and benchmark rationale.
- Save migration strategy.
- Engine/content boundaries.
- Region/content authoring workflow.
- Agent tooling/skills added.
- Runtime inspection/test scenes added.
- LOD/performance changes and before/after measurements.
- Compatibility evidence.
- Test results.
- Remaining technical debt.
- Any decisions deliberately deferred.
- Recommended next Atlas task.
- A worked example of the exact future prompt I should use to ask an agent to
  build an entire canonical region.

Do not claim something is verified if it was not actually exercised.

Do not optimize the final report for sounding impressive.
Optimize it for letting me determine whether the new foundation is trustworthy.


======================================================================
34. PRIORITY WHEN REQUIREMENTS CONFLICT
======================================================================

Use this precedence:

1. Preserve player data and prevent corruption.
2. Preserve currently validated player-visible gameplay unless explicitly
   superseded.
3. Preserve deterministic world behavior where compatibility requires it.
4. Establish long-term content identity and save architecture.
5. Establish enforceable engine/content boundaries.
6. Make the game independently inspectable/testable by agents.
7. Make ordinary content cheap to author.
8. Improve rendering/streaming scalability using measurements.
9. Improve internal elegance.
10. Delete legacy code.

Do not sacrifice a higher-priority invariant for a prettier architecture.


======================================================================
35. BEGIN
======================================================================

Begin by:

- Inspecting current HEAD, main, open/relevant PR context and repository state.
- Building a repository/domain map.
- Running baseline validation.
- Spawning parallel read-only audit agents for:
    1. content/registry/ID architecture,
    2. persistence/save formats,
    3. worldgen/chunks/workers/rendering/performance,
    4. entities/combat/bosses,
    5. structures/regions/progression,
    6. audio/assets/UI,
    7. tests/dev tooling/documentation/agent infrastructure.
- Researching external solutions only where they inform an actual Atlas design
  decision.
- Consolidating findings into the checked-in execution plan.
- Then IMPLEMENTING the plan.

Do not return to me merely with the plan.

Proceed through the implementation and autonomous validation loop.