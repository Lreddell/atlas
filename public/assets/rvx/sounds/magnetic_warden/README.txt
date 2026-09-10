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
  shielded.ogg   a strike bounces off the Warden (same polarity, a standing shield, a form change)
  repelled       a bolt bounces off your matching polarity (reuses shielded, pitched up)
  hurt.ogg       the Warden takes damage
  enrage.ogg     the Warden changes form (silent)
  defeat.ogg     the Warden is defeated (a short sting / song)

The tower crystals (every form's shield)
  crystal_ignite  a form's crystals appear and their towers light up in the Warden's polarity (reuses crystal_spawn)
  crystal_break.ogg  a tower crystal shatters (silent)
  flinch          a crystal fell but the shield still holds (reuses hurt, pitched up)
  shield_break    the last crystal of the form fell: the shield drops, the Warden reels (reuses deflect, pitched down)
  tower_flux      the ignited towers begin to flip: the window to flip (R) and hold on (reuses hum, pitched up)
  tower_flip      the towers settled in the new polarity (reuses polarity)

Form I, the Warden (duel)
  volley.ogg     windup before a five-bolt volley (silent)
  lash.ogg       windup before the close-range Lash (silent)
  draw           windup before the Draw (reuses slam_rise)
  repel          the Repel burst that ends a Draw (reuses slam)
  charge_windup  the Warden coils for a Charge down its lane (reuses slam_rise, pitched up)
  charge_lunge   the Charge itself (reuses deflect, pitched down)
  stagger        a Magnet Slam staggers the Warden (reuses hurt, pitched down)

Form II, the Aegis (the contested climb)
  shatter        the Warden shatters into its core; two crystals ignite on the towers (reuses crystal_spawn)
  crash          the core, its shield broken, is yanked down onto the platform (reuses slam)
  slam_rise.ogg  the plunge telegraph (the core marks the ground and rises)
  slam.ogg       the plunge impact + its polarity ring

Form III, the Storm (metronome)
  storm          the core lands and its shard barrier unfolds (reuses hum, pitched down)
  beat_tick      the two countdown ticks before a beat (reuses shielded, pitched up)
  beat           the beat: polarity flips (the last tower with it) and a ring fires (reuses slam)

The player's kit (mapped under entity.player.* in soundDefaults.ts)
  roll           the dodge roll (reuses step/sand)
  dash           the magnetic dash onto a magnet face or into the Warden (reuses deflect, pitched up)
  leap           the repel leap away from a same-polarity Warden (reuses shielded)
  launch         the magnetic launch off a wall (reuses shielded, pitched down)
  dodged         a hit passed through a roll's invulnerability (reuses random/pop)
  surge          a dash reached the Warden: the Magnet Slam is armed (reuses crystal_spawn, pitched up)
  slam           a Magnet Slam lands (reuses slam, pitched up)
  shocked        a tower settled against your polarity and threw you off (reuses deflect, pitched down)

Accepted formats: .ogg (preferred), .mp3, .wav. Use the exact base name above;
the extension is resolved automatically (.ogg first).

After replacing a file during development, run:

  /sound reload

Packaged builds must be rebuilt so the new files are copied into dist.
