// Maps Home Assistant weather data to scene parameters and icons.

// only the icons ICON below can return, so the rest stay out of the bundle
const icons = import.meta.glob(
  '../node_modules/@bybas/weather-icons/production/fill/all/{clear-day,clear-night,cloudy,fog-day,fog-night,hail,not-available,partly-cloudy-day,partly-cloudy-night,rain,sleet,snow,thunderstorms,thunderstorms-rain,wind}.svg',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

const iconUrl = {};
for (const [path, svg] of Object.entries(icons)) {
  const name = path.split('/').pop().replace('.svg', '');
  iconUrl[name] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const ICON = {
  'clear-night': () => 'clear-night',
  cloudy: () => 'cloudy',
  exceptional: () => 'not-available',
  fog: (day) => (day ? 'fog-day' : 'fog-night'),
  hail: () => 'hail',
  lightning: () => 'thunderstorms',
  'lightning-rainy': () => 'thunderstorms-rain',
  partlycloudy: (day) => (day ? 'partly-cloudy-day' : 'partly-cloudy-night'),
  pouring: () => 'rain',
  rainy: () => 'rain',
  snowy: () => 'snow',
  'snowy-rainy': () => 'sleet',
  sunny: (day) => (day ? 'clear-day' : 'clear-night'),
  windy: () => 'wind',
  'windy-variant': () => 'wind',
};

export function conditionIcon(condition, day = true) {
  const name = ICON[condition]?.(day) ?? 'not-available';
  return iconUrl[name] ?? iconUrl['not-available'];
}

// Base look per condition; cloud_coverage, precipitation and wind refine it.
const BASE = {
  'clear-night': { cloud: 0.05 },
  sunny: { cloud: 0.05 },
  partlycloudy: { cloud: 0.45 },
  cloudy: { cloud: 0.85 },
  fog: { cloud: 0.7, fog: 0.9 },
  rainy: { cloud: 0.9, rain: 0.55 },
  pouring: { cloud: 1, rain: 1 },
  lightning: { cloud: 0.95, storm: 1 },
  'lightning-rainy': { cloud: 1, rain: 0.8, storm: 1 },
  snowy: { cloud: 0.85, snow: 0.7 },
  'snowy-rainy': { cloud: 0.9, rain: 0.35, snow: 0.45 },
  hail: { cloud: 0.95, rain: 0.6, snow: 0.3 },
  windy: { cloud: 0.4 },
  'windy-variant': { cloud: 0.7 },
  exceptional: { cloud: 0.8 },
};

const toKmh = { 'km/h': 1, 'm/s': 3.6, mph: 1.609, kn: 1.852, 'ft/s': 1.097 };

export function sceneTargets({ condition, attributes = {}, hourNow, sun }) {
  const base = { cloud: 0.5, rain: 0, snow: 0, fog: 0, storm: 0, ...BASE[condition] };

  const coverage = attributes.cloud_coverage ?? hourNow?.cloud_coverage;
  if (coverage != null && !['sunny', 'clear-night'].includes(condition)) {
    base.cloud = (base.cloud + coverage / 100) / 2;
  }
  const precip = hourNow?.precipitation;
  if (precip != null && base.rain > 0) base.rain = Math.min(1, Math.max(0.25, 0.25 + precip / 4));
  if (precip != null && base.snow > 0) base.snow = Math.min(1, Math.max(0.3, 0.3 + precip / 3));

  const kmh = (attributes.wind_speed ?? 0) * (toKmh[attributes.wind_speed_unit] ?? 1);
  const strength = Math.min(1, kmh / 50) + (condition.startsWith('windy') ? 0.3 : 0);
  // bearing is where the wind comes from; westerly wind pushes rain to the right
  const bearing = ((attributes.wind_bearing ?? 270) * Math.PI) / 180;
  const wind = Math.max(-1, Math.min(1, -Math.sin(bearing) * strength));

  return { ...base, wind, ...sunTargets(sun) };
}

export function sunTargets(sun) {
  if (!sun) return { day: 1, golden: 0, sunX: 0.3, sunY: 0.8 };
  const elev = sun.attributes.elevation ?? 30;
  const azimuth = sun.attributes.azimuth ?? 180;
  return {
    day: smooth(-6, 6, elev),
    golden: smooth(-8, 0, elev) * (1 - smooth(2, 14, elev)),
    sunX: 0.12 + Math.min(1, Math.max(0, (azimuth - 90) / 180)) * 0.76,
    // high sun sits partly above the top edge so it does not cover the clock
    sunY: 0.8 + Math.min(1, Math.max(0, elev / 40)) * 0.28,
  };
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Day or night for a forecast hour, using today's sunrise and sunset times of day.
export function isDaytime(date, sun) {
  if (!sun?.attributes.next_rising) return true;
  const day = 86400000;
  const tod = (d) => ((new Date(d).getTime() % day) + day) % day;
  const rise = tod(sun.attributes.next_rising);
  const set = tod(sun.attributes.next_setting);
  const t = tod(date);
  return rise < set ? t >= rise && t < set : t >= rise || t < set;
}
