
// Dimensions (Minecraft-like)
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_HEIGHT_SNEAK = 1.5;
export const EYE_HEIGHT_STANDING = 1.62;
export const EYE_HEIGHT_SNEAKING = 1.27;

// Physics constants (Units: Blocks/sec)
export const GRAVITY = 32; 
export const JUMP_VELOCITY = 8.4; 
export const TERMINAL_VELOCITY = 78.4;

// Speeds (Minecraft-accurate terminal velocities in blocks/sec)
export const WALK_SPEED = 4.317;
export const SPRINT_MULTIPLIER = 1.3;   // -> 5.612 b/s
export const SNEAK_MULTIPLIER = 0.3;    // -> 1.295 b/s

// One-time forward impulse (blocks/sec) added on the tick you jump while sprinting.
// In Minecraft this impulse, preserved by the high air friction, is what makes
// sprint-jumping the fastest way to travel (~27% faster than flat sprinting).
// Tuned so the sprint-jump cycle averages ~7.1 b/s vs 5.612 sprinting — matching
// that 27% gap — rather than copying MC's raw internal value.
export const SPRINT_JUMP_BOOST = 2.0;

// Fluid speeds
export const SWIM_SPEED = 2.55;           
export const SWIM_SUBMERGED_SPEED = 2.096; 
export const LAVA_HORIZONTAL_REDUCTION = 0.4; 

// Fluid Physics (Vertical)
export const FLUID_GRAVITY = 4;       
export const FLUID_TERMINAL_VEL = 5.0;   
export const FLUID_JUMP_ACCEL = 16.0;    
export const FLUID_JUMP_MAX = 3;       

// --- Movement model: Minecraft per-tick friction + input acceleration ---
// Minecraft has no "target velocity" that you lerp toward. Instead, every tick:
//   1. horizontal velocity is multiplied by a friction factor (exponential decay)
//   2. movement input adds a small fixed acceleration
// The equilibrium of those two IS the top speed, which is what gives the genuine
// momentum feel: gradual ramp-up, a short glide to a stop, and direction changes
// that carry your old momentum for a few ticks. The simulation runs a fixed 20 Hz
// substep (FIXED_DT) == one Minecraft tick, so these per-tick values apply directly.
//
// Friction factors are per-tick velocity RETENTION (Minecraft: slipperiness * 0.91).
export const GROUND_FRICTION = 0.546;   // 0.6 (normal block) * 0.91
export const AIR_FRICTION = 0.91;       // little decay -> momentum carries in air
export const FLUID_FRICTION = 0.80;     // water/lava drag

// Air acceleration as a fraction of the GROUND acceleration amplitude (Minecraft
// uses ~20%). Crucially this is measured against the ground amplitude, NOT against
// (1 - AIR_FRICTION): pairing 20% of ground accel with the high 0.91 air retention
// makes the air terminal speed land right at your ground speed, so sprint speed
// carries cleanly through a jump and you can still steer onto a block. (The prior
// 0.15-of-air-amplitude reading made air accel ~7x too weak — speed bled to a crawl,
// which both killed sprint-jumps and made blocks hard to mount.)
export const AIR_CONTROL = 0.20;

// Sprint auto-cancel needs this many consecutive slow ticks — a momentum-based
// direction flip passes through low speed for 1-2 ticks and must not cancel
// sprint; a genuine wall bump stays slow and cancels after ~150ms.
export const SPRINT_STOP_GRACE_TICKS = 3;

// Simulation settings
export const TICK_RATE = 20; // 20 Ticks per second
export const FIXED_DT = 1 / TICK_RATE; // 0.05s
export const MAX_SUBSTEPS = 4;

// Gameplay
export const MAX_BREATH = 300; // 15 Seconds * 20 TPS

// Collision epsilons
export const CONTACT_EPS = 1e-4; 
export const GROUND_EPS = 0.05;  
export const SAFE_WALK_STEP = 0.05; 
