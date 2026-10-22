// Full-screen fragment shader that paints the whole weather background:
// sky, sun/moon/stars, clouds, rain streaks, snow, fog, lightning and
// water drops sliding down the glass (which refract the scene behind them).

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2  uRes;
uniform vec2  uSun;      // sun position in uv space
uniform float uDay;      // 0 night .. 1 day
uniform float uGolden;   // sunrise / sunset tint
uniform float uCloud;
uniform float uRain;
uniform float uSnow;
uniform float uFog;
uniform float uFlash;    // lightning, driven from JS
uniform float uWind;     // -1 .. 1, horizontal component

varying vec2 vUv;

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

// detail < 1 drops the fine octaves, which reads as the view being blurred
// by a wet window.
float fbm(vec2 p, float detail) {
  float v = 0., a = .5;
  for (int i = 0; i < OCTAVES; i++) {
    float w = i < 2 ? 1. : detail;
    v += a * (vnoise(p) - .5) * w;
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= .5;
  }
  return v + .5;
}

float rainStreaks(vec2 p) {
  float acc = 0.;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 22. + fi * 14.;
    vec2 q = vec2(p.x + p.y * uWind * .45, p.y);
    q *= vec2(scale, scale * .12);
    q.y += uTime * (3.2 + fi * 1.1);
    q.x += fi * 3.7;
    vec2 id = floor(q), f = fract(q);
    float x = .5 + (hash12(id + 7.) - .5) * .7;
    float line = smoothstep(.07, 0., abs(f.x - x)) * smoothstep(0., .4, f.y) * smoothstep(1., .55, f.y);
    acc += line * step(hash12(id + fi * 13.), uRain * .55 + .04) * (.3 - fi * .07);
  }
  return acc * smoothstep(0., .1, uRain);
}

float snowFlakes(vec2 p) {
  float acc = 0.;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float scale = 5. + fi * 4.;
    vec2 q = p * scale;
    q.y += uTime * (.35 + fi * .18) * scale * .12;
    q.x += sin(uTime * .6 + fi * 2. + q.y * .4) * .25 + uTime * uWind * .5;
    vec2 id = floor(q), f = fract(q) - .5;
    vec2 o = (hash22(id + fi * 5.) - .5) * .6;
    float r = (.05 + .07 * hash12(id + 3.)) * (1. - fi * .12);
    float flake = smoothstep(r, r * .2, length(f - o));
    acc += flake * step(hash12(id + 9. + fi), uSnow * .8 + .05) * (1. - fi * .18);
  }
  return clamp(acc, 0., 1.) * smoothstep(0., .1, uSnow);
}

vec3 scene(vec2 uv, float detail) {
  float asp = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * asp, uv.y);
  float wdir = uWind >= 0. ? 1. : -1.;

  // sky gradient
  vec3 top = mix(vec3(.01, .02, .06), vec3(.16, .40, .78), uDay);
  vec3 bot = mix(vec3(.05, .08, .18), vec3(.60, .79, .95), uDay);
  top = mix(top, vec3(.24, .24, .48), uGolden * .6);
  bot = mix(bot, vec3(1., .56, .30), uGolden);
  vec3 col = mix(bot, top, smoothstep(0., 1., uv.y));
  vec3 overcast = mix(vec3(.06, .07, .09), vec3(.55, .58, .63), uDay);
  overcast = mix(overcast, overcast * .7, uRain);
  col = mix(col, overcast, uCloud * .85);

  // stars and moon
  float night = (1. - uDay) * (1. - uCloud * .9);
  vec2 sg = p * 55.;
  vec2 sid = floor(sg);
  float sr = hash12(sid);
  float star = step(.982, sr) * smoothstep(.09, 0., length(fract(sg) - .5 - (hash22(sid) - .5) * .6));
  col += star * (.6 + .4 * sin(uTime * 2. + sr * 60.)) * night * smoothstep(.15, .6, uv.y);
  vec2 mp = vec2(.8 * asp, .8);
  float md = length(p - mp);
  col += vec3(.9, .92, 1.) * (smoothstep(.055, .05, md) * .85 + exp(-md * 9.) * .25) * night;

  // sun
  vec2 sp = vec2(uSun.x * asp, uSun.y);
  float sd = length(p - sp);
  vec3 sunCol = mix(vec3(1., .88, .65), vec3(1., .6, .35), uGolden);
  col += sunCol * (exp(-sd * 5.) * .6 + smoothstep(.05, .042, sd) * .9) * uDay * (1. - uCloud) * (1. - uCloud);
  col += sunCol * exp(-sd * 2.5) * .18 * uDay * uCloud * (1. - uRain);

  // clouds, two layers
  vec2 cq = p * vec2(1.1, 2.1) + vec2(uTime * (.012 + .035 * abs(uWind)) * wdir, 0.);
  float n = fbm(cq + .7 * fbm(cq * .6 + uTime * .008, detail), detail);
  float cover = smoothstep(.62 - uCloud * .42, .92 - uCloud * .34, n);
  cover *= mix(smoothstep(.05, .75, uv.y), 1., uCloud);
  float n2 = fbm(cq * 2.4 + vec2(uTime * .02 * wdir, 0.) + 5., detail);
  vec3 cLight = mix(vec3(.20, .22, .27), vec3(.97, .97, 1.), uDay);
  vec3 cDark = mix(vec3(.04, .05, .07), vec3(.40, .43, .49), uDay);
  cDark = mix(cDark, cDark * .55, uRain);
  cLight = mix(cLight, mix(cLight, cDark, .55), uRain);
  cLight = mix(cLight, vec3(1., .72, .52), uGolden * .45);
  vec3 cc = mix(cDark, cLight, clamp(smoothstep(.3, .8, n2) * .8 + uv.y * .25, 0., 1.));
  col = mix(col, cc, cover * .95);

  // lightning lights the clouds from inside
  col += uFlash * vec3(.75, .8, 1.) * (.25 + .75 * cover) * (.6 + .4 * n2);

  // precipitation
  col += vec3(.75, .8, .88) * rainStreaks(p) * (.35 + .65 * uDay);
  col = mix(col, vec3(.96, .97, 1.), snowFlakes(p) * .9);

  // fog banks
  float fn = fbm(p * vec2(1.4, 3.2) + vec2(uTime * .03, 0.), 1.);
  vec3 fogCol = mix(vec3(.14, .15, .17), vec3(.78, .80, .83), uDay);
  col = mix(col, fogCol, uFog * clamp(.55 + .9 * (fn - .5) + (.5 - uv.y) * .5, 0., 1.));

  return col;
}

// --- drops on the glass ---------------------------------------------------
// Each function returns (normal.xy, mask). The normal is the offset from the
// drop's centre divided by its radius, used both to refract and to shade.

vec3 slidingDrops(vec2 p, float scale, float seed) {
  vec2 st = vec2(p.x * scale, p.y * scale / 3.);
  st.y += hash11(floor(st.x) * 1.7 + seed) * 7.;
  vec2 id = floor(st);
  vec2 f = fract(st) - .5;
  float r1 = hash12(id + seed), r2 = hash12(id + seed + 41.3);
  if (r2 > uRain * .85 + .1) return vec3(0.);

  float ph = fract(uTime * (.04 + .06 * r1) + r1 * 13.);
  float yd = .42 - ph * .84 + .025 * sin(ph * 31.4 * (1. + r1));
  float xd = (r1 - .5) * .3 + .035 * sin(ph * 17. + r1 * 9.);
  float rad = .18 + .1 * r2;
  vec2 d = vec2(f.x - xd, (f.y - yd) * 3.);
  float m = smoothstep(rad, rad * .75, length(d));
  vec2 nrm = d / rad * m;

  // trail of small droplets left above the drop
  float above = f.y - yd;
  float trail = smoothstep(0., .03, above) * smoothstep(.45, 0., above);
  float ts = f.y * 16.;
  float tr = hash12(vec2(id.x, floor(ts)) + seed);
  vec2 td = vec2(f.x - xd - (tr - .5) * .05, (fract(ts) - .5) / 16. * 3.);
  float trad = .035 + .035 * tr;
  float tm = smoothstep(trad, trad * .6, length(td)) * trail * step(.35, tr);
  nrm += td / trad * tm;
  return vec3(nrm, max(m, tm));
}

vec3 staticDrops(vec2 p, float scale, float seed) {
  vec2 st = p * scale;
  vec2 id = floor(st), f = fract(st) - .5;
  vec2 r = hash22(id + seed);
  float life = fract(uTime * .08 * (.5 + r.x) + r.y);
  float rad = (.1 + .2 * r.x) * smoothstep(0., .04, life) * smoothstep(1., .5, life);
  vec2 d = f - (r - .5) * .6;
  float m = smoothstep(rad, rad * .7, length(d)) * step(hash12(id + seed + 3.), .25 + uRain * .6);
  return vec3(d / max(rad, 1e-3) * m, m);
}

void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec3 drop = vec3(0.);

#if DROPS
  if (uRain > .01) {
    vec2 p = vec2(uv.x * asp, uv.y);
    vec3 a = staticDrops(p, 32., 0.);
    vec3 b = staticDrops(p, 15., 7.);
    vec3 c = slidingDrops(p, 6., 0.);
    vec3 e = slidingDrops(p, 9., 3.);
    drop.xy = a.xy + b.xy + c.xy + e.xy;
    drop.z = max(max(a.z, b.z), max(c.z, e.z));
    drop *= smoothstep(.01, .2, uRain);
  }
#endif

  // outside the drops the wet glass blurs the view; inside them it is sharp
  float detail = 1. - uRain * .8 * (1. - drop.z);
  vec2 buv = uv - vec2(drop.x / asp, drop.y) * .035;
  vec3 col = scene(buv, detail);

  float edge = smoothstep(.55, 1., length(drop.xy));
  float dark = 1. - uDay;
  col *= 1. - .3 * drop.z * edge * uDay;
  // at night the refracted sky is too dark to show the drops, so let them
  // catch some ambient light: a faint body, a lit rim and a stronger glint
  col += vec3(.55, .6, .7) * drop.z * dark * (.07 + .18 * edge);
  col += drop.z * pow(clamp(dot(drop.xy, vec2(-.55, .8)), 0., 1.), 5.) * (.35 + .4 * dark);

  col *= 1. - .22 * pow(length(uv - .5) * 1.3, 2.);
  gl_FragColor = vec4(col, 1.);
}
`;
