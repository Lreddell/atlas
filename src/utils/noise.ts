// A simple implementation of various noise functions
// For a real production app, use 'simplex-noise' library.

export class SimpleNoise {
  private p: number[] = [];
  private perm: number[] = [];

  constructor(seed: number = Math.random()) {
    this.init(seed);
  }

  public init(seed: number) {
    this.p = new Array(512);
    this.perm = new Array(256);
    const permutation = new Array(256);
    for (let i = 0; i < 256; i++) {
      permutation[i] = i;
    }

    // Shuffle
    let currentSeed = seed;
    const random = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    }

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }

    for (let i = 0; i < 256; i++) {
        this.perm[i] = permutation[i];
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i % 256];
    }
  }

  fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(t: number, a: number, b: number) {
    return a + t * (b - a);
  }

  grad(hash: number, x: number, y: number, z: number) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // --- Classic Perlin 2D ---
  noise2D(x: number, y: number) {
     return this.noise3D(x, y, 0);
  }

  // --- Classic Perlin 3D ---
  noise3D(x: number, y: number, z: number) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;

    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))
      ),
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))
      )
    );
  }

  // --- Value Noise (Blocky/Linear) ---
  value2D(x: number, y: number) {
      const X = Math.floor(x);
      const Y = Math.floor(y);
      const xf = x - X;
      const yf = y - Y;
      
      const rx0 = X & 255;
      const ry0 = Y & 255;
      const rx1 = (X+1) & 255;
      const ry1 = (Y+1) & 255;

      const v00 = this.p[this.p[rx0] + ry0] / 255.0;
      const v10 = this.p[this.p[rx1] + ry0] / 255.0;
      const v01 = this.p[this.p[rx0] + ry1] / 255.0;
      const v11 = this.p[this.p[rx1] + ry1] / 255.0;

      const lx = xf; 
      const ly = yf;

      const i1 = this.lerp(lx, v00, v10);
      const i2 = this.lerp(lx, v01, v11);
      
      return (this.lerp(ly, i1, i2) * 2.0) - 1.0;
  }

  // --- Cellular / Worley Noise ---
  cellular2D(x: number, y: number) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      
      let minDist = 1.0;
      
      for (let yOff = -1; yOff <= 1; yOff++) {
          for (let xOff = -1; xOff <= 1; xOff++) {
              const cx = xi + xOff;
              const cy = yi + yOff;
              const hashX = (cx * 12.9898 + cy * 78.233);
              const hashY = (cx * 39.346 + cy * 11.135);
              const px = Math.abs(Math.sin(hashX) * 43758.5453) % 1;
              const py = Math.abs(Math.sin(hashY) * 43758.5453) % 1;
              const dx = (cx + px) - x;
              const dy = (cy + py) - y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist < minDist) minDist = dist;
          }
      }
      return (1.0 - minDist) * 2.0 - 1.0;
  }

  // --- Simplex 2D (Approximation) ---
  simplex2D(xin: number, yin: number) {
      const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
      const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
      let s = (xin + yin) * F2;
      let i = Math.floor(xin + s);
      let j = Math.floor(yin + s);
      let t = (i + j) * G2;
      let X0 = i - t;
      let Y0 = j - t;
      let x0 = xin - X0;
      let y0 = yin - Y0;
      let i1, j1;
      if (x0 > y0) { i1=1; j1=0; } else { i1=0; j1=1; }
      let x1 = x0 - i1 + G2;
      let y1 = y0 - j1 + G2;
      let x2 = x0 - 1.0 + 2.0 * G2;
      let y2 = y0 - 1.0 + 2.0 * G2;
      let ii = i & 255;
      let jj = j & 255;
      let gi0 = this.p[ii + this.p[jj]] % 12;
      let gi1 = this.p[ii + i1 + this.p[jj + j1]] % 12;
      let gi2 = this.p[ii + 1 + this.p[jj + 1]] % 12;
      let n0, n1, n2;
      let t0 = 0.5 - x0*x0 - y0*y0;
      if (t0 < 0) n0 = 0.0;
      else {
          t0 *= t0;
          n0 = t0 * t0 * this.dot2(this.grad3[gi0], x0, y0);
      }
      let t1 = 0.5 - x1*x1 - y1*y1;
      if (t1 < 0) n1 = 0.0;
      else {
          t1 *= t1;
          n1 = t1 * t1 * this.dot2(this.grad3[gi1], x1, y1);
      }
      let t2 = 0.5 - x2*x2 - y2*y2;
      if (t2 < 0) n2 = 0.0;
      else {
          t2 *= t2;
          n2 = t2 * t2 * this.dot2(this.grad3[gi2], x2, y2);
      }
      return 70.0 * (n0 + n1 + n2);
  }

  private grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  private dot2(g: number[], x: number, y: number) { return g[0]*x + g[1]*y; }
}

/**
 * Converts a string or number into a valid 32-bit integer seed.
 */
export function hashSeed(seed: string | number): number {
    if (typeof seed === 'number') return seed;
    if (!seed || seed.trim() === '') return Math.floor(Math.random() * 2147483647);
    
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Deterministic hash combining a numeric seed with a string salt.
 * Returns a 32-bit integer.
 */
export function hashSeedWithSalt(seed: number, salt: string): number {
    let h = seed | 0;
    for (let i = 0; i < salt.length; i++) {
        h = Math.imul(h ^ salt.charCodeAt(i), 2654435761);
        h ^= h >>> 16;
    }
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489917);
    h ^= h >>> 16;
    return h | 0;
}

/**
 * Maps a hash value into a numeric range [min, max).
 */
export function hashToRange(hash: number, min: number, max: number): number {
    const u = (hash >>> 0) / 4294967296;
    return min + u * (max - min);
}

export interface NoiseOffsets {
    temperature: { x: number; z: number };
    continentalness: { x: number; z: number };
    river: { x: number; z: number };
    weirdness: { x: number; z: number };
    terrain: { x: number; z: number };
    cave: { x: number; z: number };
    spawn: { x: number; z: number };
}

function deriveOffset(seed: number, salt: string): { x: number; z: number } {
    return {
        x: hashToRange(hashSeedWithSalt(seed, salt + '_x'), -50000, 50000),
        z: hashToRange(hashSeedWithSalt(seed, salt + '_z'), -50000, 50000)
    };
}

function createNoiseOffsets(seed: number): NoiseOffsets {
    return {
        temperature: deriveOffset(seed, 'temperature'),
        continentalness: deriveOffset(seed, 'continentalness'),
        river: deriveOffset(seed, 'river'),
        weirdness: deriveOffset(seed, 'weirdness'),
        terrain: deriveOffset(seed, 'terrain'),
        cave: deriveOffset(seed, 'cave'),
        spawn: deriveOffset(seed, 'spawn'),
    };
}

export interface NoiseSet {
    terrain: SimpleNoise;
    cave: SimpleNoise;
    biome: SimpleNoise;
    continental: SimpleNoise;
    river: SimpleNoise;
    weirdness: SimpleNoise;
    biomeWarpA: SimpleNoise;
    biomeWarpB: SimpleNoise;
    seed: number;
    offsets: NoiseOffsets;
}

export function createNoiseSet(masterSeed: number): NoiseSet {
    return {
        terrain: new SimpleNoise(masterSeed),
        cave: new SimpleNoise(masterSeed + 100),
        biome: new SimpleNoise(masterSeed + 200),
        continental: new SimpleNoise(masterSeed + 300),
        river: new SimpleNoise(masterSeed + 400),
        weirdness: new SimpleNoise(masterSeed + 500),
        biomeWarpA: new SimpleNoise(masterSeed + 600),
        biomeWarpB: new SimpleNoise(masterSeed + 700),
        seed: masterSeed,
        offsets: createNoiseOffsets(masterSeed)
    };
}

// Global Noise Set for the actual game
export let GlobalNoise = createNoiseSet(12345);

/**
 * Updates all global noise instances with sub-seeds derived from a master seed.
 */
export function reseedGlobalNoise(masterSeed: number) {
    GlobalNoise = createNoiseSet(masterSeed);
}

/**
 * Returns a deterministic spawn-search center derived from the world seed.
 * Different seeds yield spawn searches in different regions, eliminating origin bias.
 */
export function getSpawnSearchCenter(seed: number): { x: number, z: number } {
    return {
        x: Math.floor(hashToRange(hashSeedWithSalt(seed, 'spawn_center_x'), -1000, 1000)),
        z: Math.floor(hashToRange(hashSeedWithSalt(seed, 'spawn_center_z'), -1000, 1000))
    };
}
