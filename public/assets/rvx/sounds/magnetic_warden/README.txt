Magnetic Warden boss sound slots
================================

Place replacement sound effects in this folder using these exact names.
The fight has three forms; every cue below is fired by the encounter and
mapped in src/systems/sound/soundDefaults.ts. A slot marked (silent) has no
file yet and stays quiet until you add one; a slot marked (reuses X) plays an
existing file from this folder until you provide its own.

Summon cutscene
  crystal_spawn.ogg  each tower crystal materializes during the orbit
  hum.ogg            the crystal beams converge on the altar
  charge.ogg         the energy ball forms + swells at the altar (silent)
  summon.ogg         the ball explodes, consuming the crystals; the Warden spawns (silent)

Shared
  polarity.ogg   the Warden's polarity flips (after its swap telegraph) (silent)
  swap_charge.ogg the 1 s flicker before a polarity flip (silent)
  shielded.ogg   a strike bounces off the Warden (same polarity, a live tether, a form change)
  absorb         a bolt is repelled off your matching polarity and absorbed (reuses shielded, pitched up)
  hurt.ogg       the Warden takes damage
  enrage.ogg     the Warden changes form (silent)
  defeat.ogg     the Warden is defeated (a short sting / song)
  flux_full      your Flux meter fills (reuses crystal_spawn, pitched up)
  burst          a Flux Burst discharges (reuses deflect.ogg)

Form I, the Warden (duel)
  volley.ogg     windup before a five-bolt volley (silent)
  lash.ogg       windup before the close-range Lash (silent)
  draw           windup before the Draw (reuses slam_rise)
  repel          the Repel burst that ends a Draw (reuses slam)
  stagger        a Flux Burst staggers the Warden (reuses hurt, pitched down)

Form II, the Aegis (tether)
  shatter        the Warden shatters into its core; crystals re-form on the towers (reuses crystal_spawn)
  tether         the core tethers to a tower crystal (reuses hum)
  crystal_break.ogg  a tower crystal shatters (silent)
  snap           a tether snaps: broken, burst, or burnt out (reuses deflect)
  crash          the grounded core hits the platform (reuses slam)
  stunned.ogg    the core lies stunned, its punish window (silent)
  slam_rise.ogg  the plunge telegraph (the core marks the ground and rises)
  slam.ogg       the plunge impact + its polarity ring

Form III, the Storm (metronome)
  storm          the core lands and its shard barrier unfolds (reuses hum, pitched down)
  beat_tick      the two countdown ticks before a beat (reuses shielded, pitched up)
  beat           the beat: polarity flips and a ring fires (reuses slam)

Accepted formats: .ogg (preferred), .mp3, .wav. Use the exact base name above;
the extension is resolved automatically (.ogg first).

After replacing a file during development, run:

  /sound reload

Packaged builds must be rebuilt so the new files are copied into dist.
