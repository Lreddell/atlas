
// Dimensions
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_HEIGHT_SNEAK = 1.5;
export const EYE_HEIGHT_STANDING = 1.62;
export const EYE_HEIGHT_SNEAKING = 1.27;

// Physics constants (Units: Blocks/sec)
export const GRAVITY = 32; 
export const JUMP_VELOCITY = 8.4; 
export const TERMINAL_VELOCITY = 78.4;

// Speeds
export const WALK_SPEED = 4.5;
export const SPRINT_MULTIPLIER = 1.3;
export const SNEAK_MULTIPLIER = 0.3;

// Boost added to horizontal velocity when sprint jumping
export const SPRINT_JUMP_BOOST = 1.65091498726;

// Fluid speeds
export const SWIM_SPEED = 2.55;           
export const SWIM_SUBMERGED_SPEED = 2.096; 
export const LAVA_HORIZONTAL_REDUCTION = 0.4; 

// Fluid Physics (Vertical)
export const FLUID_GRAVITY = 4;       
export const FLUID_TERMINAL_VEL = 5.0;   
export const FLUID_JUMP_ACCEL = 16.0;    
export const FLUID_JUMP_MAX = 3;       

// Acceleration & Friction
export const ACCEL_GROUND = 90.0;  
export const ACCEL_AIR = 55.0;     
export const FRICTION_GROUND = 85.0; 
export const FRICTION_AIR = 12.0;   

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
