# Resonant Vault Trial Music Production Design

Date: 2026-07-16
Status: Approved for implementation

## Outcome

Replace the four provisional Resonant Vault music masters with a cohesive FL Studio score derived from Logan's existing `Trial` composition. `Trial` becomes the Bell Titan theme without musical alteration. Exploration, encounter combat, and escape become new arrangements of the same leitmotif and use the same instrument, sample, and effects palette.

The result must equal or exceed the production quality of the existing `Trial` master, remain readable beneath gameplay SFX, and loop without an audible boundary.

## Immutable source

The source project is:

`D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.flp`

Its recorded pre-production SHA-256 is:

`245759BD7F1051FF4AD665FCA0E98232323A71E2906299D12CD7C5DDA6D28423`

The original project, its `Audio` and `Samples` folders, and its existing WAV/MP3 exports must not be modified. Before opening FL Studio, copy the complete Trial project folder into separate Bell Titan, exploration, combat, and escape working directories. Open and save only those copies. Recompute the original project's SHA-256 after production and require an exact match.

## Trial analysis

Direct project parsing established the following source properties:

- FL Studio 25.2 project at 150 BPM, 96 PPQ, global 4/4, centered on D minor with harmonic-minor color.
- The core identity is a repeating marimba figure, a broad D-minor chord language, and a lead melody that outlines the same progression at larger rhythmic values.
- Principal generators: DirectWave chords and bass; Sytrus Marimba, Chorus EP 2, Lead, and Inferno; FPC drums; FLEX All Strings Slow; and Splice Bridge.
- Principal audio sources: ominous machine ambience, cinematic ambience hit, KSHMR clock, tick-tock loop, taiko loop, 150 BPM KJ Sawka rock loops and fills, and the project's consolidated lead/bassoon material.
- Principal effects: Super VHS, Soundgoodizer, PanOMatic, Reeverb 2, Compressor, Filter, Vocodex, Parametric EQ 2, Delay 3, Limiter, and Soft Clipper.

No new generator or replacement instrument may be introduced. Arrangements may omit or reduce a source for musical clarity, but any sounding instrument must come from this palette. Existing plugin states and routing are inherited from the duplicated Trial project; changes are limited to arrangement, tempo, automation, balance, and mastering needed for each gameplay context.

If a Trial dependency fails to load, production stops for diagnosis. It must not be silently replaced with another preset, plugin, or synthesized stand-in.

## Musical family

All four cues remain in 4/4 and retain Trial's D-minor tonal center, recognizable melodic intervals, chord vocabulary, marimba identity, and mixture of mechanical ambience with orchestral and rock weight.

### Bell Titan

- Source: duplicated `Trial` project.
- Tempo: Trial's original 150 BPM and existing tempo automation.
- Form: Trial's complete original arrangement, approximately 3:18.
- Leitmotif: full original statement.
- Changes: no composition, instrumentation, or mix redesign. Only project-copy naming, export preparation, and non-destructive output-level correction are permitted.
- Looping: not required in this pass. The complete song plays as the authored boss cue and may be interrupted by the existing game music transition system.

### Vault exploration

- Tempo: 96 BPM.
- Form: 64 bars, exactly 160 seconds or 7,680,000 samples at 48 kHz.
- Leitmotif: fragmented and rhythmically augmented. Short marimba and lead intervals appear as environmental recognition rather than a continuous melody.
- Arrangement: filtered DirectWave chords, FLEX strings, restrained bass, clock/tick and machine ambience, sparse ambience hits, and selective low taiko punctuation. Rock drums and full lead statements remain absent or heavily reduced.
- Shape: four 16-bar sections that add and remove detail without turning the cue into combat music. The final harmony and texture reconnect naturally to bar one.

### Vault combat

- Tempo: 120 BPM.
- Form: 64 bars, exactly 128 seconds or 6,144,000 samples at 48 kHz.
- Leitmotif: clearly recognizable in marimba and Sytrus Lead/Inferno call-and-response.
- Arrangement: immediate rhythmic presence from bar one using FPC, KJ Sawka material, taiko, bass, and Trial's chord palette. Development occurs through density, register, fills, filtering, and countermelody rather than unrelated new material.
- Shape: four 16-bar escalating variations. It must begin with action, avoid a long cinematic introduction, and return to a loop-compatible active downbeat.

### Vault escape

- Tempo: 144 BPM.
- Form: 64 bars, exactly 106.666667 seconds or 5,120,000 samples at 48 kHz.
- Leitmotif: compressed into urgent repeated figures and a more explicit final-half statement without copying the boss arrangement.
- Arrangement: full Trial rhythmic palette, clock/tick tension, FPC and rock drums, fills, taiko, bass, marimba, strings, chords, and controlled Inferno/Lead peaks.
- Shape: continuous forward motion with four 16-bar pressure stages. It has no terminal cadence or trailer-style ending because gameplay may remain in the escape state for another loop.

## FL Studio project layout

Working projects live outside the repository under:

`D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\`

Use isolated subfolders and project names:

- `Bell_Titan\Trial_Bell_Titan.flp`
- `Vault_Exploration\Trial_Vault_Exploration.flp`
- `Vault_Combat\Trial_Vault_Combat.flp`
- `Vault_Escape\Trial_Vault_Escape.flp`

Copy the final FLP files into:

`assets/source/audio/resonant_vault/fl_studio/`

Raw licensed Splice samples and large consolidated source WAVs remain external and are not duplicated into Git. Add a source README that records dependency paths, tempos, bar counts, render settings, and the immutable Trial hash. The FLPs preserve plugin state and editable arrangements for Logan's existing workstation.

## Rendering and seamless loops

Render 48 kHz stereo 32-bit float WAV intermediates from FL Studio using the highest practical resampling quality, HQ processing for all plugins, disabled dithering at the float stage, and no normalization that changes internal dynamics.

For exploration, combat, and escape:

1. Arrange and render at least three consecutive identical cycles.
2. Let delay, reverb, and sustained-instrument state settle during the first cycle.
3. Extract the complete second cycle at its exact bar-derived sample boundaries.
4. Confirm the extracted length exactly matches the cue's specified sample count.
5. Encode the extracted master to stereo Ogg Vorbis at high quality from the float intermediate.

This middle-cycle method preserves effect tails at both sides of the file and avoids a fade, silence pad, or arbitrary runtime crossfade hiding a defective musical boundary.

The Bell Titan master is rendered once as a complete song from the duplicated project. Compare it against `Trial.wav` to ensure the arrangement and musical balance have not drifted.

## Runtime destinations

Replace these existing masters without changing their runtime event names:

- Bell Titan: `public/assets/rvx/sounds/music/boss_bell_titan/bell_titan.ogg`
- Vault exploration: `public/assets/rvx/sounds/music/resonant_vault/echoes_below.ogg`
- Vault combat: `public/assets/rvx/sounds/music/resonant_combat/three_wings.ogg`
- Vault escape: `public/assets/rvx/sounds/music/resonant_escape/the_vault_unravels.ogg`

Update `public/assets/rvx/sounds/music-loops.json` to the exact final sample lengths for the three looped derivatives. Update the audio provenance record to identify the FL Studio Trial-derived masters, render chain, durations, sample rates, channel counts, hashes, and editable FLP sources. Remove claims that these four masters remain the older MIDI-rendered versions.

## Mix and quality standard

- Preserve Trial's width, impact, transient character, and melodic clarity; do not flatten every cue into the same density.
- Keep the Bell Titan as the fastest and most complete statement. Exploration must remain substantially slower and leave space for environmental SFX.
- Keep true peaks at or below -1 dBTP after final output-level adjustment.
- Keep the three derivatives within a practical game-music loudness family and compare each directly with Trial. Do not achieve consistency through audible brick-wall limiting.
- Check low-end translation, mono compatibility, harsh upper-mid buildup, excessive reverb masking, and whether the motif stays identifiable at normal in-game music volume.
- Avoid clipped samples, DC offsets, missing plugins, offline sources, unintentional tempo stretching, abrupt cutoffs, and empty or placeholder audio.

## Acceptance checks

Production is complete only when all of the following are true:

- The original `Trial.flp` SHA-256 still equals the recorded immutable hash.
- Four distinct derivative FLPs exist, reopen successfully in FL Studio, and report 4/4 with their specified tempos.
- Bell Titan is recognizably the original Trial song, not a reconstruction or unrelated replacement.
- The other three cues use only Trial's palette and implement the approved leitmotif hierarchy: subtle in exploration, clear in combat, urgent in escape.
- All runtime masters decode as 48 kHz stereo Ogg Vorbis and contain non-silent audio.
- Exploration, combat, and escape match their exact sample counts and survive repeated concatenation without an audible click, timing skip, tail loss, or cadence break.
- Objective audio tests, Vault music transition tests, TypeScript checking, lint, and the production build pass.
- A final in-game listening pass confirms appropriate relative loudness, prompt combat entry, clean context crossfades, and no masking of critical Vault SFX.
- The final commit is pushed to the existing PR #4 head branch.

## Scope boundary

This pass does not create adaptive boss phases, stems selected at runtime, new music-system code, or new SFX. The Bell Titan uses Trial as one complete cue. Future phase editing can build on the preserved `Trial_Bell_Titan.flp` without changing this delivery.
