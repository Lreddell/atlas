import { MOTION_BLUR_MIN_PIXELS, MOTION_BLUR_SAMPLES } from '../../render/motionBlur';

// The post-processing passes (RenderPipeline.tsx). Every pass is one fullscreen
// triangle; everything before the composite works in scene-linear HDR, and the
// composite does the tone map, grade and sRGB encode itself (three only applies
// its own tone mapping when a material draws straight to the canvas, and the
// composite may draw to an 8-bit target first for FXAA).

export const FULLSCREEN_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

/**
 * Camera motion blur by reprojection: rebuild each pixel's world position from
 * depth, project it with last frame's view-projection, gather along the
 * difference. A still camera gives a zero vector and an identical image. Far
 * plane pixels (sky) have no surface that moved and are passed through.
 */
export const MOTION_BLUR_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInverseViewProjection;
uniform mat4 uPreviousViewProjection;
uniform vec2 uResolution;
uniform float uScale;
uniform float uMaxPixels;

const int SAMPLES = ${MOTION_BLUR_SAMPLES};

vec4 gatherAlongMotion( float depth ) {
    vec4 color = texture2D( tColor, vUv );
    vec4 clip = vec4( vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
    vec4 world = uInverseViewProjection * clip;
    world /= world.w;
    vec4 previousClip = uPreviousViewProjection * world;
    if ( previousClip.w <= 0.0 ) return color;
    vec2 previousUv = ( previousClip.xy / previousClip.w ) * 0.5 + 0.5;
    vec2 velocity = ( vUv - previousUv ) * uScale;
    vec2 pixels = velocity * uResolution;
    float pixelLength = length( pixels );
    if ( pixelLength < ${MOTION_BLUR_MIN_PIXELS.toFixed(3)} ) return color;
    if ( pixelLength > uMaxPixels ) velocity *= uMaxPixels / pixelLength;
    // Centred on the pixel: a one-sided trail reads as lag, not blur.
    vec4 sum = color;
    float weight = 1.0;
    for ( int i = 1; i < SAMPLES; i ++ ) {
        float t = float( i ) / float( SAMPLES - 1 ) - 0.5;
        vec2 uv = vUv + velocity * t;
        if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) continue;
        sum += texture2D( tColor, uv );
        weight += 1.0;
    }
    return sum / weight;
}

void main() {
    float depth = texture2D( tDepth, vUv ).x;
    gl_FragColor = depth >= 1.0 ? texture2D( tColor, vUv ) : gatherAlongMotion( depth );
}
`;

/**
 * Bloom input, at half the source resolution: only what is brighter than the
 * threshold after exposure (lava, torches, crystals, the sun, water glints),
 * with a soft knee. Measured on the brightest channel, not luminance, so a
 * saturated red glow counts as bright. A Karis average keeps single hot pixels
 * from flickering.
 */
export const BLOOM_PREFILTER_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uTexel;
uniform float uExposure;
uniform vec2 uThreshold;

float karis( vec3 c ) { return 1.0 / ( 1.0 + max( c.r, max( c.g, c.b ) ) ); }

// A stray NaN or Inf in the scene would otherwise spread through every mip.
vec3 sanitize( vec3 c ) {
#if __VERSION__ >= 300
    if ( any( isnan( c ) ) || any( isinf( c ) ) ) return vec3( 0.0 );
#endif
    return clamp( c, 0.0, 6.0e4 );
}

void main() {
    vec3 a = sanitize( texture2D( tColor, vUv + uTexel * vec2( -0.5, -0.5 ) ).rgb ) * uExposure;
    vec3 b = sanitize( texture2D( tColor, vUv + uTexel * vec2( 0.5, -0.5 ) ).rgb ) * uExposure;
    vec3 c = sanitize( texture2D( tColor, vUv + uTexel * vec2( -0.5, 0.5 ) ).rgb ) * uExposure;
    vec3 d = sanitize( texture2D( tColor, vUv + uTexel * vec2( 0.5, 0.5 ) ).rgb ) * uExposure;
    float wa = karis( a ), wb = karis( b ), wc = karis( c ), wd = karis( d );
    vec3 color = ( a * wa + b * wb + c * wc + d * wd ) / ( wa + wb + wc + wd );
    float brightness = max( color.r, max( color.g, color.b ) );
    float soft = clamp( brightness - uThreshold.x + uThreshold.y, 0.0, 2.0 * uThreshold.y );
    soft = soft * soft / ( 4.0 * uThreshold.y + 1e-4 );
    float contribution = max( soft, brightness - uThreshold.x ) / max( brightness, 1e-4 );
    gl_FragColor = vec4( color * contribution, 1.0 );
}
`;

/** Dual-filter downsample (5 taps, half a destination texel out). */
export const BLOOM_DOWN_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uTexel;
void main() {
    vec3 sum = texture2D( tColor, vUv ).rgb * 4.0;
    sum += texture2D( tColor, vUv - uTexel ).rgb;
    sum += texture2D( tColor, vUv + uTexel ).rgb;
    sum += texture2D( tColor, vUv + vec2( uTexel.x, -uTexel.y ) ).rgb;
    sum += texture2D( tColor, vUv - vec2( uTexel.x, -uTexel.y ) ).rgb;
    gl_FragColor = vec4( sum / 8.0, 1.0 );
}
`;

/** Dual-filter upsample (8 taps) of the smaller level, added to this level. */
export const BLOOM_UP_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSmall;
uniform sampler2D tCurrent;
uniform vec2 uTexel;
void main() {
    vec3 sum = texture2D( tSmall, vUv + vec2( -uTexel.x * 2.0, 0.0 ) ).rgb;
    sum += texture2D( tSmall, vUv + vec2( -uTexel.x, uTexel.y ) ).rgb * 2.0;
    sum += texture2D( tSmall, vUv + vec2( 0.0, uTexel.y * 2.0 ) ).rgb;
    sum += texture2D( tSmall, vUv + vec2( uTexel.x, uTexel.y ) ).rgb * 2.0;
    sum += texture2D( tSmall, vUv + vec2( uTexel.x * 2.0, 0.0 ) ).rgb;
    sum += texture2D( tSmall, vUv + vec2( uTexel.x, -uTexel.y ) ).rgb * 2.0;
    sum += texture2D( tSmall, vUv + vec2( 0.0, -uTexel.y * 2.0 ) ).rgb;
    sum += texture2D( tSmall, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb * 2.0;
    gl_FragColor = vec4( sum / 12.0 + texture2D( tCurrent, vUv ).rgb, 1.0 );
}
`;

/**
 * God rays, step 1 (quarter resolution): the bright open sky around the sun
 * (or moon), nothing else. Solid geometry in front of it becomes the shafts.
 */
export const RAYS_MASK_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uLightUv;
uniform float uAspect;
uniform float uExposure;
void main() {
    float depth = texture2D( tDepth, vUv ).x;
    vec3 sky = depth >= 0.9999 ? texture2D( tColor, vUv ).rgb * uExposure : vec3( 0.0 );
    vec2 toLight = ( vUv - uLightUv ) * vec2( uAspect, 1.0 );
    float falloff = 1.0 - smoothstep( 0.0, 0.45, length( toLight ) );
    gl_FragColor = vec4( max( sky - 0.6, 0.0 ) * falloff * falloff, 1.0 );
}
`;

/** God rays, step 2: a radial blur of the mask toward the light. */
export const RAYS_BLUR_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tMask;
uniform vec2 uLightUv;
const int RAY_SAMPLES = 40;
void main() {
    vec2 step = ( uLightUv - vUv ) / float( RAY_SAMPLES ) * 0.9;
    vec2 uv = vUv;
    float decay = 1.0;
    vec3 sum = vec3( 0.0 );
    for ( int i = 0; i < RAY_SAMPLES; i ++ ) {
        sum += texture2D( tMask, uv ).rgb * decay;
        decay *= 0.955;
        uv += step;
    }
    gl_FragColor = vec4( sum / float( RAY_SAMPLES ), 1.0 );
}
`;

/**
 * The frame's last step in HDR: bloom and rays added, exposure, the tone map
 * (AgX, or ACES as a comparison), the grade (saturation, split tone, contrast,
 * vignette), the sRGB encode, and a dither so 8-bit gradients never band.
 */
export const COMPOSITE_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uExposure;
uniform float uBloomStrength;
uniform vec3 uRays;
uniform vec4 uGrade;          // x saturation, y contrast, z vignette, w split-tone strength
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uTime;

const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
    vec3( 1.6605, - 0.1246, - 0.0182 ),
    vec3( - 0.5876, 1.1329, - 0.1006 ),
    vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
    vec3( 0.6274, 0.0691, 0.0164 ),
    vec3( 0.3293, 0.9195, 0.0880 ),
    vec3( 0.0433, 0.0113, 0.8956 )
);

// AgX, as three.js r160 implements it (after Filament and Blender).
vec3 agxContrast( vec3 x ) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agxToneMap( vec3 color ) {
    const mat3 inset = mat3(
        vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
        vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
        vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
    );
    const mat3 outset = mat3(
        vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
        vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
        vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
    );
    color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
    color = inset * color;
    color = clamp( ( log2( max( color, 1e-10 ) ) + 12.47393 ) / 16.500000, 0.0, 1.0 );
    color = agxContrast( color );
    color = outset * color;
    color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
    return clamp( LINEAR_REC2020_TO_LINEAR_SRGB * color, 0.0, 1.0 );
}

// ACES (Stephen Hill's fit, as three.js uses it), for comparison.
vec3 acesFit( vec3 v ) {
    vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
    vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
    return a / b;
}
vec3 acesToneMap( vec3 color ) {
    const mat3 acesIn = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
    const mat3 acesOut = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
    return clamp( acesOut * acesFit( acesIn * ( color / 0.6 ) ), 0.0, 1.0 );
}

vec3 toSrgb( vec3 c ) {
    return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}

float hash12( vec2 p ) {
    vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
    p3 += dot( p3, p3.yzx + 33.33 );
    return fract( ( p3.x + p3.y ) * p3.z );
}

vec3 sanitize( vec3 c ) {
#if __VERSION__ >= 300
    if ( any( isnan( c ) ) || any( isinf( c ) ) ) return vec3( 0.0 );
#endif
    return clamp( c, 0.0, 6.0e4 );
}

void main() {
    vec3 hdr = sanitize( texture2D( tColor, vUv ).rgb );
#ifdef USE_BLOOM
    hdr += texture2D( tBloom, vUv ).rgb * ( uBloomStrength / uExposure );
#endif
#ifdef USE_RAYS
    hdr += texture2D( tRays, vUv ).rgb * ( uRays / uExposure );
#endif
#ifdef TONEMAP_ACES
    vec3 color = acesToneMap( hdr * uExposure );
#else
    vec3 color = agxToneMap( hdr * uExposure );
#endif
    // Grade, in linear: saturation, then a split tone (cool shadows, warm highlights).
    float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = max( mix( vec3( luma ), color, uGrade.x ), 0.0 );
    vec3 tone = mix( uShadowTint, uHighlightTint, smoothstep( 0.05, 0.55, luma ) );
    color *= mix( vec3( 1.0 ), tone, uGrade.w );
    // Contrast in display space, around mid-grey; then a soft vignette.
    vec3 display = toSrgb( clamp( color, 0.0, 1.0 ) );
    display = ( display - 0.5 ) * uGrade.y + 0.5;
    vec2 fromCentre = vUv - 0.5;
    display *= 1.0 - uGrade.z * dot( fromCentre, fromCentre ) * 2.0;
    // Half-LSB triangular dither against banding in skies and fog.
    float noise = hash12( gl_FragCoord.xy + fract( uTime ) * 61.0 ) + hash12( gl_FragCoord.yx + 17.0 ) - 1.0;
    display += noise / 255.0;
    gl_FragColor = vec4( clamp( display, 0.0, 1.0 ), 1.0 );
}
`;

/**
 * FXAA 3.11 (quality preset 12-ish), on the graded sRGB image. Used when the
 * scene target has no MSAA (the FXAA setting, or MSAA unavailable).
 */
export const FXAA_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uTexel;

float fxaaLuma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }

void main() {
    vec3 rgbM = texture2D( tColor, vUv ).rgb;
    vec3 rgbNW = texture2D( tColor, vUv + vec2( -1.0, -1.0 ) * uTexel ).rgb;
    vec3 rgbNE = texture2D( tColor, vUv + vec2( 1.0, -1.0 ) * uTexel ).rgb;
    vec3 rgbSW = texture2D( tColor, vUv + vec2( -1.0, 1.0 ) * uTexel ).rgb;
    vec3 rgbSE = texture2D( tColor, vUv + vec2( 1.0, 1.0 ) * uTexel ).rgb;
    float lumaM = fxaaLuma( rgbM );
    float lumaNW = fxaaLuma( rgbNW ), lumaNE = fxaaLuma( rgbNE ), lumaSW = fxaaLuma( rgbSW ), lumaSE = fxaaLuma( rgbSE );
    float lumaMin = min( lumaM, min( min( lumaNW, lumaNE ), min( lumaSW, lumaSE ) ) );
    float lumaMax = max( lumaM, max( max( lumaNW, lumaNE ), max( lumaSW, lumaSE ) ) );
    if ( lumaMax - lumaMin < max( 0.0312, lumaMax * 0.125 ) ) {
        gl_FragColor = vec4( rgbM, 1.0 );
        return;
    }
    vec2 dir = vec2( -( ( lumaNW + lumaNE ) - ( lumaSW + lumaSE ) ), ( lumaNW + lumaSW ) - ( lumaNE + lumaSE ) );
    float dirReduce = max( ( lumaNW + lumaNE + lumaSW + lumaSE ) * 0.03125, 1.0 / 128.0 );
    float rcpDirMin = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + dirReduce );
    dir = clamp( dir * rcpDirMin, vec2( -8.0 ), vec2( 8.0 ) ) * uTexel;
    vec3 rgbA = 0.5 * ( texture2D( tColor, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tColor, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
    vec3 rgbB = rgbA * 0.5 + 0.25 * ( texture2D( tColor, vUv - dir * 0.5 ).rgb + texture2D( tColor, vUv + dir * 0.5 ).rgb );
    float lumaB = fxaaLuma( rgbB );
    gl_FragColor = vec4( ( lumaB < lumaMin || lumaB > lumaMax ) ? rgbA : rgbB, 1.0 );
}
`;

/** Plain copy (no AA) of the graded image to the canvas. */
export const COPY_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tColor;
void main() {
    gl_FragColor = vec4( texture2D( tColor, vUv ).rgb, 1.0 );
}
`;
