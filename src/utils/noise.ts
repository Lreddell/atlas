// Noise implementations used by terrain and biome generation.

const OPEN_SIMPLEX_2D_SKEW = 0.366025403784439;
const OPEN_SIMPLEX_2D_UNSKEW = -0.21132486540518713;
const OPEN_SIMPLEX_2D_RADIUS = 0.5;
const OPEN_SIMPLEX_2D_NORMALIZER = 0.01001634121365712;
const OPEN_SIMPLEX_2D_GRADIENTS = [
  [0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER, 0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER, 0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER, -0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER, -0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER, -0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER, -0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER, 0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.38268343236509 / OPEN_SIMPLEX_2D_NORMALIZER, 0.923879532511287 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.130526192220052 / OPEN_SIMPLEX_2D_NORMALIZER, 0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER, 0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER, 0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER, 0.130526192220051 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER, -0.130526192220051 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER, -0.60876142900872 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER, -0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER],
  [0.130526192220052 / OPEN_SIMPLEX_2D_NORMALIZER, -0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.130526192220052 / OPEN_SIMPLEX_2D_NORMALIZER, -0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER, -0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER, -0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER, -0.130526192220052 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER, 0.130526192220051 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER, 0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.608761429008721 / OPEN_SIMPLEX_2D_NORMALIZER, 0.793353340291235 / OPEN_SIMPLEX_2D_NORMALIZER],
  [-0.130526192220052 / OPEN_SIMPLEX_2D_NORMALIZER, 0.99144486137381 / OPEN_SIMPLEX_2D_NORMALIZER],
] as const;

// Perlin's gradient for a corner is +/-u +/-v, with u and v two of x, y, z picked
// by the hash's low four bits (the improved-noise table):
//   u = h < 8 ? x : y;  v = h < 4 ? y : (h === 12 || h === 14 ? x : z)
//   grad = ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
// Those choices follow a random hash, so as branches the CPU mispredicts them
// constantly. Read from tables instead: which coordinate each term takes and
// its sign. Multiplying by +/-1 is exact and the sum keeps its order, so the
// value is bit for bit the branching version's.
const GRAD_U = new Uint8Array(16);
const GRAD_V = new Uint8Array(16);
const GRAD_SU = new Float64Array(16);
const GRAD_SV = new Float64Array(16);
for (let h = 0; h < 16; h++) {
  GRAD_U[h] = h < 8 ? 0 : 1;
  GRAD_V[h] = h < 4 ? 1 : h === 12 || h === 14 ? 0 : 2;
  GRAD_SU[h] = (h & 1) === 0 ? 1 : -1;
  GRAD_SV[h] = (h & 2) === 0 ? 1 : -1;
}
// The corner offset a gradient reads (x, y, z), reused for every corner.
const corner = new Float64Array(3);
const perlinGrad = (hash: number, x: number, y: number, z: number): number => {
  const h = hash & 15;
  corner[0] = x;
  corner[1] = y;
  corner[2] = z;
  return GRAD_SU[h] * corner[GRAD_U[h]] + GRAD_SV[h] * corner[GRAD_V[h]];
};

export class SimpleNoise {
  // The doubled permutation table. Typed: noise3D reads it eight times a call.
  private p: Uint8Array = new Uint8Array(512);
  private perm: number[] = [];

  constructor(seed: number = Math.random()) {
    this.init(seed);
  }

  public init(seed: number) {
    this.p = new Uint8Array(512);
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
  // Terrain, caves and ores call this about 250,000 times a chunk, most of the
  // cost of generating one, so it is written out flat: one floor per axis, the
  // typed table in a local, no method calls. Every expression keeps the
  // textbook order (fade: t*t*t*(t*(t*6-15)+10); lerp: a + t*(b - a)), so the
  // results are bit for bit what they were and every seed builds the same world.
  noise3D(x: number, y: number, z: number) {
    const p = this.p;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const X = fx & 255;
    const Y = fy & 255;
    const Z = fz & 255;

    x -= fx;
    y -= fy;
    z -= fz;

    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    const x1 = x - 1;
    const y1 = y - 1;
    const z1 = z - 1;
    const g000 = perlinGrad(p[AA], x, y, z);
    const g100 = perlinGrad(p[BA], x1, y, z);
    const g010 = perlinGrad(p[AB], x, y1, z);
    const g110 = perlinGrad(p[BB], x1, y1, z);
    const g001 = perlinGrad(p[AA + 1], x, y, z1);
    const g101 = perlinGrad(p[BA + 1], x1, y, z1);
    const g011 = perlinGrad(p[AB + 1], x, y1, z1);
    const g111 = perlinGrad(p[BB + 1], x1, y1, z1);

    const x00 = g000 + u * (g100 - g000);
    const x10 = g010 + u * (g110 - g010);
    const x01 = g001 + u * (g101 - g001);
    const x11 = g011 + u * (g111 - g011);
    const y0 = x00 + v * (x10 - x00);
    const y1v = x01 + v * (x11 - x01);
    return y0 + w * (y1v - y0);
  }

  /** A sampler for this noise down one column at a time (see NoiseColumn). */
  column(): NoiseColumn {
    return new NoiseColumn(this, this.p);
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

  // --- OpenSimplex2(F) 2D ---
  openSimplex2D(x: number, y: number): number {
      const s = OPEN_SIMPLEX_2D_SKEW * (x + y);
      return this.openSimplex2UnskewedBase(x + s, y + s);
  }

  // Backward-compatible alias kept for older call sites.
  simplex2D(x: number, y: number): number {
      return this.openSimplex2D(x, y);
  }

  private openSimplex2UnskewedBase(xs: number, ys: number): number {
      const xsb = Math.floor(xs);
      const ysb = Math.floor(ys);
      const xi = xs - xsb;
      const yi = ys - ysb;

      const t = (xi + yi) * OPEN_SIMPLEX_2D_UNSKEW;
      const dx0 = xi + t;
      const dy0 = yi + t;

      let value = 0;

      const a0 = OPEN_SIMPLEX_2D_RADIUS - dx0 * dx0 - dy0 * dy0;
      if (a0 > 0) {
          const a0Squared = a0 * a0;
          value += a0Squared * a0Squared * this.openSimplex2Gradient(xsb, ysb, dx0, dy0);
      }

      const a1 =
          (2 * (1 + 2 * OPEN_SIMPLEX_2D_UNSKEW) * (1 / OPEN_SIMPLEX_2D_UNSKEW + 2)) * t
          + (-2 * (1 + 2 * OPEN_SIMPLEX_2D_UNSKEW) * (1 + 2 * OPEN_SIMPLEX_2D_UNSKEW) + a0);
      if (a1 > 0) {
          const dx1 = dx0 - (1 + 2 * OPEN_SIMPLEX_2D_UNSKEW);
          const dy1 = dy0 - (1 + 2 * OPEN_SIMPLEX_2D_UNSKEW);
          const a1Squared = a1 * a1;
          value += a1Squared * a1Squared * this.openSimplex2Gradient(xsb + 1, ysb + 1, dx1, dy1);
      }

      if (dy0 > dx0) {
          const dx2 = dx0 - OPEN_SIMPLEX_2D_UNSKEW;
          const dy2 = dy0 - (OPEN_SIMPLEX_2D_UNSKEW + 1);
          const a2 = OPEN_SIMPLEX_2D_RADIUS - dx2 * dx2 - dy2 * dy2;
          if (a2 > 0) {
              const a2Squared = a2 * a2;
              value += a2Squared * a2Squared * this.openSimplex2Gradient(xsb, ysb + 1, dx2, dy2);
          }
      } else {
          const dx2 = dx0 - (OPEN_SIMPLEX_2D_UNSKEW + 1);
          const dy2 = dy0 - OPEN_SIMPLEX_2D_UNSKEW;
          const a2 = OPEN_SIMPLEX_2D_RADIUS - dx2 * dx2 - dy2 * dy2;
          if (a2 > 0) {
              const a2Squared = a2 * a2;
              value += a2Squared * a2Squared * this.openSimplex2Gradient(xsb + 1, ysb, dx2, dy2);
          }
      }

      return value;
  }

  private openSimplex2Gradient(xsb: number, ysb: number, dx: number, dy: number): number {
      const hash = this.perm[(this.perm[xsb & 255] + ysb) & 255];
      const gradient = OPEN_SIMPLEX_2D_GRADIENTS[hash % OPEN_SIMPLEX_2D_GRADIENTS.length];
      return gradient[0] * dx + gradient[1] * dy;
  }
}

/**
 * One Perlin field sampled down a column: x and z fixed and only y changing,
 * the way world generation samples caves and ores, block by block. noise3D
 * works out the unit cell's eight corner hashes and the x and z parts of each
 * corner's gradient on every call; here they are worked out once per cell, and
 * a sample only adds the y parts and interpolates. That arithmetic is noise3D's
 * own, so the values are bit for bit the same (noise.test.mjs checks it).
 */
export class NoiseColumn {
  private readonly noise: SimpleNoise;
  private readonly p: Uint8Array;
  private x = 0;
  private z = 0;
  private X = 0;
  private Z = 0;
  // The x and z offsets of the cell's corners, and their fades.
  private x0 = 0;
  private x1 = 0;
  private z0 = 0;
  private z1 = 0;
  private u = 0;
  private w = 0;
  private cellY = NaN;
  // Per corner, in noise3D's order (000, 100, 010, 110, 001, 101, 011, 111),
  // the gradient as k + s * (the corner's y offset).
  private readonly k = new Float64Array(8);
  private readonly s = new Float64Array(8);

  constructor(noise: SimpleNoise, p: Uint8Array) {
    this.noise = noise;
    this.p = p;
  }

  /** Moves to the column through (x, z). */
  begin(x: number, z: number): void {
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    this.x = x;
    this.z = z;
    this.X = fx & 255;
    this.Z = fz & 255;
    const xf = x - fx;
    const zf = z - fz;
    this.x0 = xf;
    this.x1 = xf - 1;
    this.z0 = zf;
    this.z1 = zf - 1;
    this.u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    this.w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
    this.cellY = NaN;
  }

  /** noise3D(x, y, z) for the column's x and z. */
  sample(y: number): number {
    const fy = Math.floor(y);
    if (fy !== this.cellY) this.enterCell(fy);
    const yf = y - fy;
    // Only a y a hair below an integer rounds to yf = 1, where the upper
    // corners' zero y offset could flip a -0 gradient to +0 (see setCorner).
    if (yf === 1) return this.noise.noise3D(this.x, y, this.z);
    const y1 = yf - 1;
    const k = this.k;
    const s = this.s;
    const g000 = k[0] + s[0] * yf;
    const g100 = k[1] + s[1] * yf;
    const g010 = k[2] + s[2] * y1;
    const g110 = k[3] + s[3] * y1;
    const g001 = k[4] + s[4] * yf;
    const g101 = k[5] + s[5] * yf;
    const g011 = k[6] + s[6] * y1;
    const g111 = k[7] + s[7] * y1;

    const u = this.u;
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const w = this.w;
    const x00 = g000 + u * (g100 - g000);
    const x10 = g010 + u * (g110 - g010);
    const x01 = g001 + u * (g101 - g001);
    const x11 = g011 + u * (g111 - g011);
    const y0 = x00 + v * (x10 - x00);
    const y1v = x01 + v * (x11 - x01);
    return y0 + w * (y1v - y0);
  }

  private enterCell(fy: number): void {
    this.cellY = fy;
    const p = this.p;
    const Y = fy & 255;
    const A = p[this.X] + Y;
    const AA = p[A] + this.Z;
    const AB = p[A + 1] + this.Z;
    const B = p[this.X + 1] + Y;
    const BA = p[B] + this.Z;
    const BB = p[B + 1] + this.Z;
    this.setCorner(0, p[AA], this.x0, this.z0, true);
    this.setCorner(1, p[BA], this.x1, this.z0, true);
    this.setCorner(2, p[AB], this.x0, this.z0, false);
    this.setCorner(3, p[BB], this.x1, this.z0, false);
    this.setCorner(4, p[AA + 1], this.x0, this.z1, true);
    this.setCorner(5, p[BA + 1], this.x1, this.z1, true);
    this.setCorner(6, p[AB + 1], this.x0, this.z1, false);
    this.setCorner(7, p[BB + 1], this.x1, this.z1, false);
  }

  /**
   * Splits a corner's gradient (perlinGrad) into its x/z term k and the sign s
   * of its y term. The two terms are the ones perlinGrad adds, and adding is
   * commutative, so k + s * y is its value exactly. A gradient with no y term
   * gets a zero s whose product with y is -0: adding -0 leaves every k as it
   * is, a k of -0 included. Lower corners' y offsets are >= 0, so s = -0;
   * upper corners' are < 0 (bar yf = 1, see sample), so s = +0.
   */
  private setCorner(i: number, hash: number, cx: number, cz: number, lowerCorner: boolean): void {
    const h = hash & 15;
    const su = GRAD_SU[h];
    const sv = GRAD_SV[h];
    if (h < 4) {
      // +/-x +/-y
      this.k[i] = su * cx;
      this.s[i] = sv;
    } else if (h < 8) {
      // +/-x +/-z
      this.k[i] = su * cx + sv * cz;
      this.s[i] = lowerCorner ? -0 : 0;
    } else if (h === 12 || h === 14) {
      // +/-y +/-x
      this.k[i] = sv * cx;
      this.s[i] = su;
    } else {
      // +/-y +/-z
      this.k[i] = sv * cz;
      this.s[i] = su;
    }
  }
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
    bossBiome: { x: number; z: number };
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
        bossBiome: deriveOffset(seed, 'bossBiome'),
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
    /** Low-frequency field gating rare, sealed boss biomes (e.g. Magnetic Fields). */
    bossBiome: SimpleNoise;
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
        bossBiome: new SimpleNoise(masterSeed + 800),
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
