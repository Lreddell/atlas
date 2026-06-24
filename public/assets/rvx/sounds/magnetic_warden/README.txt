Magnetic Warden boss sound slots
================================

Place replacement sound effects in this folder using these exact names:

  polarity.ogg   plays each time the Warden swaps its magnetic polarity
  shielded.ogg   plays when a hit is absorbed by the Warden's shield
  parry.ogg      plays when the Warden launches a deflectable purple bolt
  deflect.ogg    plays when you successfully hit a bolt back at the Warden
  slam_rise.ogg  plays as the Warden rises into the air to slam (telegraph)
  slam.ogg       plays on the slam impact + polarity shockwave
  crystal_spawn.ogg  plays as each shield crystal materializes (summon cutscene)
  hum.ogg        plays while the crystal beams converge on the altar (cutscene)
  charge.ogg     plays while the energy ball forms + swells at the altar (cutscene)
  summon.ogg     plays when the energy ball explodes and the boss spawns
  defeat.ogg     plays once when the Warden is defeated (a short sting / song)

Accepted formats: .ogg (preferred), .mp3, .wav. Use the exact base name above;
the extension is resolved automatically (.ogg first).

The files are optional — the slot is simply silent while a file is missing,
empty, or undecodable. (The boss music itself lives in ../music/.)

After replacing a file during development, run:

  /sound reload

Packaged builds must be rebuilt so the new files are copied into dist.
