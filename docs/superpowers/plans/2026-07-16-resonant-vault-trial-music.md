# Resonant Vault Trial Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four provisional Resonant Vault music masters with production-quality FL Studio arrangements derived from Logan's immutable `Trial` project and deliver them to PR #4.

**Architecture:** Duplicate the complete Trial project into four isolated working folders so every cue inherits the original instruments, samples, plugin states, routing, and leitmotif. Produce the Bell Titan as the unchanged full Trial arrangement and create three 64-bar derivative arrangements, render the looped cues for three cycles, extract their settled second cycles at exact sample boundaries, encode final Ogg/Vorbis masters, and update Atlas metadata and tests to make the FL Studio sources authoritative.

**Tech Stack:** FL Studio 2025, DirectWave, Sytrus, FPC, FLEX, Splice Bridge, Trial's existing mixer effects, FFmpeg/FFprobe, Node.js tests, TypeScript, Vite, Git.

## Global Constraints

- Never modify `D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.flp`, its `Audio` or `Samples` folders, or its existing exports.
- The immutable Trial SHA-256 must remain `245759BD7F1051FF4AD665FCA0E98232323A71E2906299D12CD7C5DDA6D28423`.
- All cues remain in 4/4 and use only Trial's existing generators, samples, plugin states, and effects palette.
- Bell Titan remains Trial's complete original 150 BPM composition; only non-destructive output-level correction is allowed.
- Exploration is 96 BPM and 64 bars: exactly 7,680,000 stereo frames at 48 kHz.
- Combat is 120 BPM and 64 bars: exactly 6,144,000 stereo frames at 48 kHz.
- Escape is 144 BPM and 64 bars: exactly 5,120,000 stereo frames at 48 kHz.
- Exploration, combat, and escape render three identical cycles, extract cycle two, and must loop without a click, timing skip, tail loss, or cadence break.
- Final masters are 48 kHz stereo Ogg Vorbis with true peaks no higher than -1 dBTP.
- No adaptive boss phases, new runtime music system, new instruments, synthesized stand-ins, or replacement SFX are in scope.
- Work inline in this session; do not dispatch subagents.

---

### Task 1: Freeze the source and create isolated FL Studio projects

**Files:**
- Read: `D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Bell_Titan\Trial_Bell_Titan.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\Trial_Vault_Exploration.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\Trial_Vault_Combat.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\Trial_Vault_Escape.flp`

**Interfaces:**
- Consumes: the immutable Trial project folder and recorded source hash.
- Produces: four independent, editable FL Studio workspaces with local `Audio`, `Samples`, and backup folders.

- [ ] **Step 1: Reconfirm the source hash and FL Studio installation**

Run:

```powershell
Get-FileHash -LiteralPath 'D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.flp' -Algorithm SHA256
Get-Item -LiteralPath 'C:\Program Files\Image-Line\FL Studio 2025\FL64.exe'
```

Expected: the hash is exactly `245759BD7F1051FF4AD665FCA0E98232323A71E2906299D12CD7C5DDA6D28423`, and `FL64.exe` exists.

- [ ] **Step 2: Copy the complete Trial folder into four isolated workspaces**

Create the target root, copy the source folder four times, and rename only the copied FLP files. Do not delete or overwrite an existing target; stop and inspect it if any target already exists.

```powershell
$source = 'D:\Documents\Image-Line\FL Studio\Projects\Trial'
$root = 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault'
$projects = [ordered]@{
  Bell_Titan = 'Trial_Bell_Titan.flp'
  Vault_Exploration = 'Trial_Vault_Exploration.flp'
  Vault_Combat = 'Trial_Vault_Combat.flp'
  Vault_Escape = 'Trial_Vault_Escape.flp'
}
New-Item -ItemType Directory -Path $root | Out-Null
foreach ($entry in $projects.GetEnumerator()) {
  $target = Join-Path $root $entry.Key
  Copy-Item -LiteralPath $source -Destination $target -Recurse
  Rename-Item -LiteralPath (Join-Path $target 'Trial.flp') -NewName $entry.Value
}
```

Expected: all four named FLPs exist, and the original Trial hash remains unchanged.

- [ ] **Step 3: Open each copied FLP and verify dependencies**

Open each project in FL Studio 2025. Confirm DirectWave, Sytrus, FPC, FLEX, Splice Bridge, Super VHS, Soundgoodizer, PanOMatic, Reeverb 2, Compressor, Filter, Vocodex, Parametric EQ 2, Delay 3, Limiter, and Soft Clipper load without missing-plugin or missing-sample warnings. Save only the copies.

Expected: every copied project plays the same arrangement as Trial before editing, and no dependency is offline.

- [ ] **Step 4: Record the clean duplication checkpoint**

Run:

```powershell
Get-ChildItem -LiteralPath 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault' -Recurse -Filter '*.flp' |
  Select-Object FullName,Length,LastWriteTime
Get-FileHash -LiteralPath 'D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.flp' -Algorithm SHA256
```

Expected: four copied FLPs are listed and the immutable hash still matches.

### Task 2: Prepare the unchanged Bell Titan master

**Files:**
- Modify: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Bell_Titan\Trial_Bell_Titan.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Bell_Titan\renders\bell_titan.wav`
- Replace later: `public/assets/rvx/sounds/music/boss_bell_titan/bell_titan.ogg`

**Interfaces:**
- Consumes: the duplicated Trial project at its original 150 BPM.
- Produces: an unchanged full-song 48 kHz stereo float master and an editable Bell Titan FLP.

- [ ] **Step 1: Confirm the copied Bell Titan arrangement is still authored Trial**

In FL Studio, verify the project is 150 BPM, global 4/4, and the complete playlist arrangement is present. Do not change patterns, notes, instruments, samples, automation, or mixer routing.

Expected: playback matches `D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.wav` in form, melody, and balance.

- [ ] **Step 2: Apply output correction only if the source exceeds the delivery ceiling**

Measure the Trial master first. If the new render would exceed -1 dBTP, lower only the final master output by the minimum necessary amount. Do not add mastering plugins or redesign the mix.

Expected: the Bell Titan remains musically identical to Trial with codec-safe headroom.

- [ ] **Step 3: Render the complete Bell Titan cue**

Render in Song mode to `renders\bell_titan.wav` with WAV, 32-bit float, 48 kHz stereo, highest practical resampling, HQ for all plugins, no normalization, and no dithering.

Expected: one complete non-silent WAV containing the full Trial composition with no truncated release.

- [ ] **Step 4: Compare the render against the original Trial export**

Run FFmpeg loudness and duration analysis on both files:

```powershell
ffmpeg -hide_banner -i 'D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.wav' -af ebur128=peak=true -f null NUL
ffmpeg -hide_banner -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Bell_Titan\renders\bell_titan.wav' -af ebur128=peak=true -f null NUL
```

Expected: form and duration remain aligned; any loudness difference is solely the allowed output correction.

### Task 3: Produce the 96 BPM Vault exploration arrangement

**Files:**
- Modify: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\Trial_Vault_Exploration.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\renders\echoes_below_cycles.wav`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\renders\echoes_below_loop.wav`

**Interfaces:**
- Consumes: Trial's marimba figure, D-minor harmony, DirectWave, FLEX, clock/tick, machine ambience, taiko, and inherited mixer routing.
- Produces: a subdued 64-bar loop with a settled middle-cycle render of exactly 7,680,000 stereo frames.

- [ ] **Step 1: Set the exploration project to 96 BPM and preserve 4/4**

Set the copied project tempo to 96 BPM. Check audio clips for correct tempo-sync/stretch behavior; correct only clip time-stretch settings needed to keep the source in musical time.

Expected: all retained musical material remains synchronized and natural at 96 BPM.

- [ ] **Step 2: Build bars 1-16 as the quiet identity statement**

Use filtered DirectWave chords, FLEX strings, restrained bass roots, machine ambience, and clock/tick texture. State only the characteristic D-G-A marimba interval fragment in short responses; omit full rock drums and the full lead.

Expected: the Vault identity is recognizable but leaves substantial space for navigation and puzzle SFX.

- [ ] **Step 3: Build bars 17-32 as a restrained expansion**

Add a sparse marimba ostinato derived directly from Trial, selective low taiko punctuation, and a slightly more present bass line while keeping the same D-minor chord vocabulary.

Expected: the cue gains motion without reading as combat music.

- [ ] **Step 4: Build bars 33-48 as the exploration peak**

Broaden the FLEX strings and allow brief, filtered Sytrus Lead or Inferno answers using Trial's lead intervals. Keep rock loops absent and leave clock and environmental layers audible.

Expected: this is the richest exploration section but remains quieter and less dense than combat.

- [ ] **Step 5: Build bars 49-64 as a subtractive return**

Remove the lead peak, thin the taiko, and return to the opening harmonic color. Make the final bar lead directly into bar 1 without a terminal cadence or fill that announces an ending.

Expected: bars 64-to-1 form a continuous musical sentence.

- [ ] **Step 6: Duplicate the complete cycle twice and render settled state**

Duplicate the 64-bar arrangement until three consecutive identical cycles exist. Render the 192-bar song to `echoes_below_cycles.wav` using 48 kHz stereo 32-bit float, HQ plugins, no normalization, and no dithering.

Expected: effect and sustained-instrument state is already active at the start of the second cycle.

- [ ] **Step 7: Extract the exact second cycle**

Run:

```powershell
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\renders\echoes_below_cycles.wav' -af 'atrim=start_sample=7680000:end_sample=15360000,asetpts=PTS-STARTPTS' -ar 48000 -ac 2 -c:a pcm_f32le 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\renders\echoes_below_loop.wav'
```

Expected: the extracted WAV contains exactly 7,680,000 stereo frames.

### Task 4: Produce the 120 BPM Vault combat arrangement

**Files:**
- Modify: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\Trial_Vault_Combat.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\renders\three_wings_cycles.wav`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\renders\three_wings_loop.wav`

**Interfaces:**
- Consumes: Trial's marimba, Sytrus Lead/Inferno, FPC, KJ Sawka loops and fills, taiko, bass, chords, and inherited mixer chain.
- Produces: an immediate-action 64-bar loop with a settled middle-cycle render of exactly 6,144,000 stereo frames.

- [ ] **Step 1: Set the combat project to 120 BPM and preserve 4/4**

Set tempo to 120 BPM and verify tempo-synced sample behavior. Keep Trial's source material in time without replacing any sound.

- [ ] **Step 2: Build bars 1-16 with immediate combat energy**

Begin on an active downbeat using FPC, a compatible KJ Sawka groove, taiko, bass, chords, and the recognizable marimba motif. Do not use a cinematic fade-in.

- [ ] **Step 3: Build bars 17-32 as the first escalation**

Add Sytrus Lead/Inferno call-and-response around the marimba, increase drum detail, and use Trial's existing fills only at phrase boundaries.

- [ ] **Step 4: Build bars 33-48 as the combat peak**

Use the fullest rock and taiko density, broader chord voicings, and a clear lead statement while retaining enough midrange space for enemy telegraphs.

- [ ] **Step 5: Build bars 49-64 as an active loop return**

Reduce one layer at a time but keep rhythm active. Make bar 64 resolve into the same chord, groove, and transient context as bar 1 without an ending fill.

- [ ] **Step 6: Duplicate, render, and extract the settled second cycle**

Render three identical cycles to `three_wings_cycles.wav`, then run:

```powershell
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\renders\three_wings_cycles.wav' -af 'atrim=start_sample=6144000:end_sample=12288000,asetpts=PTS-STARTPTS' -ar 48000 -ac 2 -c:a pcm_f32le 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\renders\three_wings_loop.wav'
```

Expected: the extracted WAV contains exactly 6,144,000 stereo frames and begins with immediate combat energy.

### Task 5: Produce the 144 BPM Vault escape arrangement

**Files:**
- Modify: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\Trial_Vault_Escape.flp`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\renders\the_vault_unravels_cycles.wav`
- Create: `D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\renders\the_vault_unravels_loop.wav`

**Interfaces:**
- Consumes: Trial's complete rhythmic palette, clock/tick, FPC, rock loops, fills, taiko, bass, marimba, strings, chords, Lead, Inferno, and inherited mixer chain.
- Produces: an urgent 64-bar loop with a settled middle-cycle render of exactly 5,120,000 stereo frames.

- [ ] **Step 1: Set the escape project to 144 BPM and preserve 4/4**

Set tempo to 144 BPM and verify every retained audio clip is synchronized without unnatural stretching artifacts.

- [ ] **Step 2: Build bars 1-16 as immediate forward motion**

Start with the compressed marimba motif, clock/tick tension, bass pulse, FPC groove, and restrained taiko. Establish urgency on bar 1.

- [ ] **Step 3: Build bars 17-32 as pressure escalation**

Introduce the compatible rock loop, stronger taiko, denser chord rhythm, and short lead responses derived from Trial.

- [ ] **Step 4: Build bars 33-48 as the explicit escape statement**

Use a clear but rhythmically compressed Lead/Inferno version of the leitmotif with full drums and strings. Preserve transient clarity and avoid masking warning SFX.

- [ ] **Step 5: Build bars 49-64 as sustained peak and loop return**

Maintain momentum, use only Trial's existing fills, and shape bar 64 into bar 1 without a terminal cadence, impact, or silence.

- [ ] **Step 6: Duplicate, render, and extract the settled second cycle**

Render three identical cycles to `the_vault_unravels_cycles.wav`, then run:

```powershell
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\renders\the_vault_unravels_cycles.wav' -af 'atrim=start_sample=5120000:end_sample=10240000,asetpts=PTS-STARTPTS' -ar 48000 -ac 2 -c:a pcm_f32le 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\renders\the_vault_unravels_loop.wav'
```

Expected: the extracted WAV contains exactly 5,120,000 stereo frames and never presents a musical ending.

### Task 6: Mix, master, encode, and audition the four cues

**Files:**
- Read: all four working FLPs and float WAV renders.
- Create: four delivery Ogg/Vorbis files in the working-project render folders.

**Interfaces:**
- Consumes: one full-song Bell Titan WAV and three exact-length loop WAVs.
- Produces: four codec-safe, loudness-matched Ogg/Vorbis masters ready for Atlas.

- [ ] **Step 1: Check each mix in FL Studio against Trial**

Compare tonal balance, width, transient impact, motif clarity, low-end control, upper-mid harshness, reverb masking, and mono translation. Exploration must leave the most SFX headroom; combat and escape may be denser but cannot obscure gameplay cues.

- [ ] **Step 2: Measure loudness and true peak**

Run `ffmpeg -af ebur128=peak=true -f null NUL` on every float master. If a cue exceeds -1 dBTP, correct the copied FLP's master output or limiter conservatively and rerender; do not repair clipping after export.

Expected: every master is unclipped, at or below -1 dBTP, and belongs to a coherent game-music loudness family without audible brick-wall limiting.

- [ ] **Step 3: Encode high-quality Ogg/Vorbis masters**

Run:

```powershell
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Bell_Titan\renders\bell_titan.wav' -ar 48000 -ac 2 -c:a libvorbis -q:a 8 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Bell_Titan\renders\bell_titan.ogg'
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\renders\echoes_below_loop.wav' -ar 48000 -ac 2 -c:a libvorbis -q:a 8 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Exploration\renders\echoes_below.ogg'
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\renders\three_wings_loop.wav' -ar 48000 -ac 2 -c:a libvorbis -q:a 8 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Combat\renders\three_wings.ogg'
ffmpeg -y -i 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\renders\the_vault_unravels_loop.wav' -ar 48000 -ac 2 -c:a libvorbis -q:a 8 'D:\Documents\Image-Line\FL Studio\Projects\Atlas_Resonant_Vault\Vault_Escape\renders\the_vault_unravels.ogg'
```

Expected: four 48 kHz stereo Vorbis files decode without errors.

- [ ] **Step 4: Verify loop seams objectively and by ear**

Concatenate each loop master three times using FFmpeg's concat filter, inspect a short window around both boundaries for clicks or level discontinuities, and listen through both seams on headphones and speakers.

Expected: no audible click, rhythmic skip, missing tail, silence pad, or cadence reset.

- [ ] **Step 5: Reopen all four FLPs and replay representative sections**

Close and reopen every FLP. Confirm its tempo, 4/4 signature, plugin availability, saved arrangement, and intended master output.

Expected: all projects are independently editable and reproduce the delivered cue.

### Task 7: Make the FL Studio sources authoritative in Atlas

**Files:**
- Create: `assets/source/audio/resonant_vault/fl_studio/Trial_Bell_Titan.flp`
- Create: `assets/source/audio/resonant_vault/fl_studio/Trial_Vault_Exploration.flp`
- Create: `assets/source/audio/resonant_vault/fl_studio/Trial_Vault_Combat.flp`
- Create: `assets/source/audio/resonant_vault/fl_studio/Trial_Vault_Escape.flp`
- Modify: `assets/source/audio/resonant_vault/README.md`
- Delete: `assets/source/audio/resonant_vault/bell_titan.mid`
- Delete: `assets/source/audio/resonant_vault/echoes_below.mid`
- Delete: `assets/source/audio/resonant_vault/three_wings.mid`
- Delete: `assets/source/audio/resonant_vault/the_vault_unravels.mid`
- Delete: `assets/source/audio/resonant_vault/render_report.json`
- Delete: `scripts/render_resonant_audio.py`
- Replace: `public/assets/rvx/sounds/music/boss_bell_titan/bell_titan.ogg`
- Replace: `public/assets/rvx/sounds/music/resonant_vault/echoes_below.ogg`
- Replace: `public/assets/rvx/sounds/music/resonant_combat/three_wings.ogg`
- Replace: `public/assets/rvx/sounds/music/resonant_escape/the_vault_unravels.ogg`

**Interfaces:**
- Consumes: reopened FLPs and approved Ogg masters from Task 6.
- Produces: authoritative editable sources and runtime masters without the obsolete MIDI renderer.

- [ ] **Step 1: Copy the final FLPs and Ogg masters to their repository destinations**

Copy only the four FLPs and four final Ogg files. Do not copy Trial's raw Splice material, large consolidated WAVs, or working renders into Git.

- [ ] **Step 2: Remove the superseded MIDI renderer and MIDI source files**

Delete only the five listed obsolete source artifacts and `scripts/render_resonant_audio.py`. Confirm the recorded Vault foley library remains untouched.

- [ ] **Step 3: Rewrite the source README**

Document the immutable Trial path and hash, four FLP names, tempos, bar counts, exact loop frame counts, plugin/sample dependency policy, render settings, and the fact that final runtime music is rendered from FL Studio rather than the removed deterministic MIDI renderer.

- [ ] **Step 4: Confirm repository scope**

Run:

```powershell
git status --short
git diff --stat
```

Expected: changes are limited to the four music masters, four FLPs, music metadata/tests/docs, removal of obsolete music-only MIDI artifacts, and the already approved design/plan documents.

### Task 8: Update sample-accurate metadata, provenance, and focused tests

**Files:**
- Modify: `public/assets/rvx/sounds/music-loops.json`
- Modify: `src/systems/sound/musicLoops.ts`
- Modify: `src/systems/sound/musicLoops.test.mjs`
- Modify: `src/systems/sound/resonantVaultAudio.test.mjs`
- Modify: `public/assets/rvx/sounds/resonant_vault/audio-provenance.json`

**Interfaces:**
- Consumes: installed Ogg masters and FLP source files.
- Produces: exact runtime loop definitions, hash-backed provenance, and tests that prevent regression to provisional MIDI masters.

- [ ] **Step 1: Write the failing source-authority and exact-length assertions**

Update `resonantVaultAudio.test.mjs` to require the four FLPs, verify their `FLhd` file signature and substantial size, remove the obsolete MIDI-source assertion and fixed old Bell Titan hash, and assert decoded stereo-frame counts of 7,680,000 for exploration, 6,144,000 for combat, and 5,120,000 for escape.

Update `musicLoops.test.mjs` to assert the same three exact derivative `endSample` values.

- [ ] **Step 2: Run the focused tests and verify they fail against old metadata**

Run:

```powershell
node --test src/systems/sound/musicLoops.test.mjs src/systems/sound/resonantVaultAudio.test.mjs
```

Expected: failure identifies old sample counts, old MIDI authority, old Bell Titan hash, or missing FLPs before the repository assets and metadata are finalized.

- [ ] **Step 3: Measure installed files and update metadata exactly**

Decode each Ogg with FFmpeg to 48 kHz stereo `f32le` and derive stereo frames as `decoded byte count / 8`. Set `startSample` to 0 and `endSample` to the measured frame count in both loop files; use the three fixed derivative counts verbatim. Set Bell Titan's end sample to its measured full-song frame count. Preserve a musically safe runtime crossfade no longer than the existing 96,000 samples unless listening demonstrates a shorter overlap is cleaner.

- [ ] **Step 4: Update provenance from measured files**

For each master, record `sourceKind: "licensed_music"`, the Trial-derived FL Studio source note, FLP path, arrangement role, edit/render chain, duration, 48 kHz sample rate, two channels, and SHA-256 of the shipped Ogg. Remove every claim that the old MIDI master remains unchanged.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```powershell
node --test src/systems/sound/musicLoops.test.mjs src/systems/sound/resonantVaultAudio.test.mjs src/systems/sound/resonantMusicTransitions.test.mjs
```

Expected: all tests pass with the new masters, exact loop lengths, provenance, FLPs, and unchanged transition behavior.

- [ ] **Step 6: Commit the source and metadata delivery**

```powershell
git add assets/source/audio/resonant_vault scripts/render_resonant_audio.py public/assets/rvx/sounds/music public/assets/rvx/sounds/music-loops.json public/assets/rvx/sounds/resonant_vault/audio-provenance.json src/systems/sound/musicLoops.ts src/systems/sound/musicLoops.test.mjs src/systems/sound/resonantVaultAudio.test.mjs
git commit -m "feat: replace Vault score with Trial arrangements"
```

Expected: one focused music-production commit.

### Task 9: Validate Atlas, audition transitions, and publish PR #4

**Files:**
- Verify: all files changed by Tasks 1-8.

**Interfaces:**
- Consumes: complete Trial-derived music delivery.
- Produces: a clean, pushed PR #4 head with objective and in-game verification evidence.

- [ ] **Step 1: Run the Atlas audio tests, typecheck, lint, and build**

Run the smallest relevant validation required by the Atlas build skill:

```powershell
node --test src/systems/sound/musicLoops.test.mjs src/systems/sound/resonantVaultAudio.test.mjs src/systems/sound/resonantMusicTransitions.test.mjs
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit successfully.

- [ ] **Step 2: Reconfirm the immutable Trial source**

Run:

```powershell
Get-FileHash -LiteralPath 'D:\Documents\Image-Line\FL Studio\Projects\Trial\Trial.flp' -Algorithm SHA256
```

Expected: `245759BD7F1051FF4AD665FCA0E98232323A71E2906299D12CD7C5DDA6D28423`.

- [ ] **Step 3: Perform one focused in-game listening pass**

Verify Vault exploration, enemy combat, Bell Titan awakening, escape, pause/resume, and return to overworld music. Confirm prompt context crossfades, no volume multiplication or crunch after pause, readable gameplay SFX, and no abrupt cutoff.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```powershell
git diff --check HEAD~1..HEAD
git status --short --branch
git log -2 --oneline
```

Expected: no whitespace errors, no unintended files, and the branch contains the spec plus the focused music commit.

- [ ] **Step 5: Push the existing PR #4 branch**

Run:

```powershell
git push origin codex/daily-2026-07-13-resonant-vaults
```

Expected: the remote PR #4 head advances to the validated local commit.

- [ ] **Step 6: Verify the PR head and report deliverables**

Confirm PR #4 is still open and points at the pushed commit. Report all four FLPs, runtime masters, exact loop frame counts, measured loudness/peak results, Trial hash, and test/build results.
