Player sound slots
==================

Place sound files in this folder using these exact names. Slots here are
authored cues: they are mapped in src/systems/sound/soundDefaults.ts with
fallback disabled, so a missing file stays SILENT rather than being replaced by
a synthesised stand-in. Any supported extension works (.ogg preferred).

Low health
  heartbeat.ogg      one beat of the low-health heartbeat

  Fired once per beat by src/systems/player/lowHealthState.ts while the player
  is at or below 8 HP (of 20), speeding up from ~72 BPM at 8 HP to ~114 BPM at
  1 HP. The same event drives the red screen pulse, so the file's timing is
  what the player sees as well as hears.

  Authoring notes:
    - ONE complete heartbeat event (a lub-dub), not a loop and not minutes of
      ambience. The game schedules the repeats; a looping file would fight it.
    - Start ON the transient. Leading silence reads as latency and pulls the
      thump out of sync with the flash.
    - Keep it under roughly 600 ms so it finishes inside the fastest interval
      (~525 ms at 1 HP) instead of overlapping the next beat.
    - Mixed to sit under combat, not over it: this plays for minutes at a time
      when the player is starving or cornered.

The game runs normally with this file absent: no crash, no repeated requests,
and the low-health vignette and music pitch still work. Missing authored cues
are reported once in development, like the other authored slots.
