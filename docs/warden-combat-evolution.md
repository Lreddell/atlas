# Magnetic Warden: combat evolution

This branch builds on `magnetic-boss-reworks`. Health stays at 300. The existing
polarity rules, weapons, roll stamina, 150 ms roll invulnerability window,
magnetic movement, boss bar and arena recovery remain intact.

## Encounter

- **Warden:** one mandatory crystal, then a grounded duel. Each Lash and Charge
  first appears as a single attack. Subsequent uses add a 650 ms backswing warning
  and a second cone strike, followed by 1.4 seconds of recovery. Both strikes lock
  their facing during the warning. This rewards moving around the boss and waiting
  for the complete combination before committing to a heavy weapon.
- **Aegis:** two mandatory crystals. Crystal 1 powers aimed tower volleys;
  crystal 2 powers volleys covering one side of the wall. While both stand, these
  alternate. Destroying either removes its pattern until the damage phase.
  Projectiles target a marked position fixed at the beginning of the warning;
  tower shots do not home. Tower volleys schedule every 1.8 seconds, subject to
  action recovery and polarity swaps. The last crystal still clears hazards and
  brings the boss down for its 4.5-second shield-break opening.
- **Storm:** immediately damageable with the correct polarity. The last crystal
  is optional: breaking it removes the orbiting shard barrier and overload shard
  volleys, and grants the familiar shield-break recovery. Leaving it alive gives
  a faster route to victory with more pressure. Single and double polarity beats
  remain, with charged shots and aerial slams woven between complete beats.

## Counterplay

**White charged bolt:** the core charges white for one second, then launches a
large, non-homing neutral bolt at 10 blocks/second. A new melee attack can return
it when the weapon's actual strike connects along the crosshair within normal
weapon reach. Holding attack cannot automatically return successive bolts.
Returns travel straight along the player's aim at 30 blocks/second, respect
terrain, and can hit only the boss that fired them. Dodge or sidestep is always
valid; polarity boots do not automatically repel neutral charged bolts.

A return interrupts a shielded boss without bypassing the crystal objective.
Against an unshielded boss it deals 12 damage and exposes the core for 2.2 seconds,
including the usual punish multiplier on subsequent player strikes. Ordinary
melee remains valid throughout each damage phase. Charged shots are scheduled
nine seconds apart, with action and distance constraints.

**Tracking aerial slam:** a 1.6-second rise gains 16 blocks of height, following
the player's ground position early. The landing disc locks and turns white with
550 ms left before the 300 ms drop. An audible lock cue confirms commitment.
Impact retains the 3.2-block damage radius and polarity ring. No surprise polarity
flip is added at impact. Storm pauses its beat countdown during the complete
slam/counter sequence and during objective recovery, avoiding conflicting tells.

**Magnet Slam:** damage stays unchanged, but ordinary stagger no longer clears
projectiles or rings already in flight. A six-second stagger resistance prevents
repeated slams from holding the boss helpless. Crystal breaks retain hazard clears.

**Heavy weapons:** two heavy strikes into a punish window fracture the exposed
plating, earning a longer stagger (1.5 seconds) or extending the shield-break
recovery by 600 ms. The six-second resistance prevents repeated extensions.
The first heavy hit makes the core glow white to show the damaged armor. Swords
keep their short recovery advantage; spears retain their reach and spacing bonus.

## Validation / playtest focus

Focused Node tests cover the reducer, actual projectile adapter, controller
strike timing, and shared collision geometry. TypeScript, lint and production
build checks cover integration. Automated browser playtesting is intentionally
omitted at the player's request.

Check tower route readability, sword versus heavy punish windows, charged-bolt
aiming from both camera modes, and the optional-crystal Storm route in gameplay.
Damage and pacing are first-pass tuning, not a claim of playtested difficulty.
