# weather-scene-card

Custom Home Assistant Lovelace card: a clock and forecast over a live WebGL
weather scene (rain on glass, snow, fog, lightning, sun/moon/stars). Built with
Lit + three.js; Meteocons animated SVG icons. Plain JavaScript (ES modules), no
TypeScript.

## Commands

```bash
npm run dev     # preview at http://127.0.0.1:5179 with a mocked hass (index.html)
npm run build   # → dist/weather-scene-card.js (single self-contained ES module)
```

There are no tests. Verify visual changes in the preview, e.g.
`http://127.0.0.1:5179/?c=rainy&e=-15&q=high` (`c` condition, `e` sun
elevation in degrees, `q` quality).

## Layout

- `src/weather-scene-card.js`: the Lit element: config, forecast subscriptions, layout, styles, visual editor schema (`getConfigForm`)
- `src/scene.js`: `WeatherScene`, owning one WebGL context, the render loop, easing of parameters and the lightning timing
- `src/shader.js`: the full-screen fragment shader that draws the entire background
- `src/weather.js`: maps HA weather data to scene parameters and icons
- `index.html`: dev-only preview with a fake `hass`; never part of the build
- `scripts/ha-ws.mjs`: HA WebSocket API helper (Lovelace resources, dashboard config)

## Conventions and gotchas

- Forecasts come from the `weather/subscribe_forecast` WebSocket subscription.
  The weather entity has no `forecast` attribute (removed in HA 2024).
- Text and numbers are formatted from `hass.locale` and `hass.formatEntityState`,
  never hard-coded. The language follows the HA user profile, not the card.
- Icons are inlined as `<img>` data URIs on purpose: Meteocons SVGs reuse
  gradient ids, which collide if inlined into the same shadow DOM. When you
  map a new icon, add its name to the `import.meta.glob` list in `weather.js`;
  only listed icons are bundled.
- Scene parameters are eased towards their targets in `scene.js`; set targets,
  don't write uniforms directly.
- Performance matters (wall tablets): keep the pause-off-screen logic, the
  30 s WebGL dispose delay and the `quality` levels working. Shader cost scales
  with `OCTAVES` and `DROPS` defines.
- Lib-mode builds keep whitespace unless `rolldownOptions.output.minify` is set;
  leave it in `vite.config.js`.
- Version: keep `VERSION` in `src/weather-scene-card.js`, `package.json` and the
  resource URL's `?v=` in sync.

## Home Assistant access

- `.env` holds `HA_URL` and `HA_TOKEN` (git-ignored; template in `.env_example`).
- REST reads: the `ha-api-poll` skill (`.claude/skills/ha-api-poll`).
- WebSocket: `node scripts/ha-ws.mjs '{"type":"lovelace/resources"}'`.
- A project hook blocks HTTP DELETE requests. Don't work around it.
- HA runs in Docker (`ha` container, HA Core, no Supervisor) on host
  192.168.1.5. SSH user `jarekmor`; `/config` = `/opt/HA/homeassistant`.
  `www/` is root-owned and sudo needs a password, but the user is in the
  `docker` group.

## Deploying — only when the user explicitly asks

Changing anything on the HA server (files, resources, dashboards) needs the
user's explicit go-ahead for that step. "Check" means read-only. Report what you
would change and wait.

1. Build (`npm run build`).
2. Run `scp dist/weather-scene-card.js 192.168.1.5:/tmp/`, then on the host
   `docker cp /tmp/weather-scene-card.js ha:/config/www/` and remove the temp
   file. Compare checksums afterwards.
3. Bump the resource version with `lovelace/resources/update` (new `?v=`) so
   browsers drop the cached file.
4. Before any `lovelace/config/save`, read and back up the current config. Then
   change only the card in question; never rewrite other cards.

The card currently sits at the top of the Overview dashboard's Home view
(`default_view`) with entity `weather.forecast_home`.

## Preview in the Playwright MCP browser

The Playwright browser runs in a Docker container that can't reach host ports
(firewall), and `file://` URLs are blocked. To screenshot the card, build, inline
`dist/weather-scene-card.js` into `index.html`, `docker cp` the page into the
container and serve it from inside the container on 127.0.0.1. When inlining,
use a function replacer, because the bundle contains `$'` sequences. Stop that
server afterwards.
