# Magnetic Warden — boss music

Drop one or more `.ogg` tracks for the Magnetic Warden fight here.
This track is triggered automatically when the Magnetic Warden is summoned
(via the `boss:spawned` event for bossId `magnetic_warden`) and stops/transitions
back to biome music on `boss:defeated` / `boss:cleared`.
Music manifest key: `music.boss_magnetic_warden` (src/systems/sound/soundDefaults.ts).
