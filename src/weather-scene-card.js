import { LitElement, css, html, nothing } from 'lit';
import { WeatherScene } from './scene.js';
import { conditionIcon, isDaytime, sceneTargets } from './weather.js';

const VERSION = '0.1.1';
const CONDITIONS = [
  'sunny', 'clear-night', 'partlycloudy', 'cloudy', 'fog', 'rainy', 'pouring', 'lightning',
  'lightning-rainy', 'snowy', 'snowy-rainy', 'hail', 'windy', 'windy-variant', 'exceptional',
];
// keep the WebGL context this long after the card leaves the page, so a quick
// view switch does not rebuild it
const DISPOSE_DELAY = 30000;

class WeatherSceneCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _hourly: { state: true },
    _daily: { state: true },
    _now: { state: true },
  };

  static getConfigForm() {
    return {
      schema: [
        { name: 'entity', required: true, selector: { entity: { domain: 'weather' } } },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'title', selector: { text: {} } },
            { name: 'name', selector: { text: {} } },
            { name: 'hourly_count', selector: { number: { min: 0, max: 12, mode: 'box' } } },
            { name: 'height', selector: { text: {} } },
            { name: 'quality', selector: { select: { mode: 'dropdown', options: ['high', 'medium', 'low'] } } },
            { name: 'condition_override', selector: { select: { mode: 'dropdown', options: CONDITIONS } } },
          ],
        },
        { name: 'show_clock', selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: 'Weather entity',
          title: 'Card title',
          name: 'Name under the condition',
          hourly_count: 'Hours in forecast',
          height: 'Height (CSS, e.g. 420px)',
          quality: 'Animation quality',
          condition_override: 'Preview condition (testing)',
          show_clock: 'Show clock',
        })[s.name],
    };
  }

  static getStubConfig(hass) {
    return { entity: Object.keys(hass.states).find((e) => e.startsWith('weather.')) ?? '' };
  }

  setConfig(config) {
    if (!config.entity) throw new Error('Set a weather entity');
    if (this._config && this._config.quality !== config.quality) this._disposeScene();
    this._config = { hourly_count: 6, quality: 'high', show_clock: true, height: '420px', ...config };
  }

  getCardSize() {
    return 8;
  }

  connectedCallback() {
    super.connectedCallback();
    clearTimeout(this._disposeTimer);
    this._scene?.start();
    this._tickClock();
    this._clock = setInterval(() => this._tickClock(), 1000);
    this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._clock);
    this._unsubscribe();
    this._scene?.stop();
    this._disposeTimer = setTimeout(() => this._disposeScene(), DISPOSE_DELAY);
  }

  _tickClock() {
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== this._minute) {
      this._minute = minute;
      this._now = new Date();
    }
  }

  _disposeScene() {
    this._scene?.dispose();
    this._scene = null;
  }

  // hass changes on every state change in HA; only re-render for ours
  shouldUpdate(changed) {
    if (!changed.has('hass') || changed.size > 1) return true;
    const old = changed.get('hass');
    if (!old || !this._config) return true;
    return (
      old.states[this._config.entity] !== this.hass.states[this._config.entity] ||
      old.states['sun.sun'] !== this.hass.states['sun.sun'] ||
      old.locale !== this.hass.locale
    );
  }

  updated() {
    if (!this.hass || !this._config) return;
    if (!this._subs || this._subEntity !== this._config.entity) this._subscribe();

    const el = this.renderRoot.querySelector('.scene');
    if (el && !this._scene && !this._noWebGL) {
      try {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this._scene = new WeatherScene(el, this._config.quality, reduced);
        this._scene.start();
      } catch (err) {
        this._noWebGL = true;
        console.warn('weather-scene-card: WebGL unavailable, using a static background', err);
      }
    }
    const stateObj = this.hass.states[this._config.entity];
    if (this._scene && stateObj) {
      this._scene.setTargets(
        sceneTargets({
          condition: this._config.condition_override || stateObj.state,
          attributes: stateObj.attributes,
          hourNow: this._upcomingHours()[0],
          sun: this.hass.states['sun.sun'],
        }),
      );
    }
  }

  _subscribe() {
    this._unsubscribe();
    if (!this.isConnected) return;
    const entity = this._config.entity;
    const sub = (type, prop) =>
      this.hass.connection
        .subscribeMessage((ev) => (this[prop] = ev.forecast ?? []), {
          type: 'weather/subscribe_forecast',
          forecast_type: type,
          entity_id: entity,
        })
        .catch((err) => console.warn(`weather-scene-card: no ${type} forecast`, err));
    this._subs = [sub('hourly', '_hourly'), sub('daily', '_daily')];
    this._subEntity = entity;
  }

  _unsubscribe() {
    for (const p of this._subs ?? []) p.then((unsub) => unsub?.());
    this._subs = null;
  }

  _upcomingHours() {
    const from = Date.now() - 3600000;
    return (this._hourly ?? []).filter((f) => new Date(f.datetime).getTime() > from);
  }

  get _locale() {
    return this.hass?.locale?.language ?? this.hass?.language ?? navigator.language;
  }

  _dateFormat(options) {
    const loc = this.hass?.locale ?? {};
    return new Intl.DateTimeFormat(this._locale, {
      ...options,
      hour12: loc.time_format === '12' ? true : loc.time_format === '24' ? false : undefined,
      timeZone: loc.time_zone === 'server' ? this.hass.config.time_zone : undefined,
    });
  }

  _temp(value) {
    if (value == null) return '–';
    return new Intl.NumberFormat(this._locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  }

  render() {
    if (!this._config || !this.hass) return nothing;
    const stateObj = this.hass.states[this._config.entity];
    if (!stateObj) {
      return html`<ha-card><div class="warning">Entity not found: ${this._config.entity}</div></ha-card>`;
    }
    const sun = this.hass.states['sun.sun'];
    const condition = this._config.condition_override || stateObj.state;
    const unit = stateObj.attributes.temperature_unit ?? '°C';
    const label = this._config.condition_override
      ? condition
      : (this.hass.formatEntityState?.(stateObj) ?? stateObj.state);
    const today = this._daily?.[0];
    const hours = this._upcomingHours().slice(0, this._config.hourly_count);
    const now = this._now ?? new Date();
    const hourFmt = this._dateFormat({ hour: '2-digit', minute: '2-digit' });

    return html`
      <ha-card>
        ${this._config.title
          ? html`<div class="header"><ha-icon icon="mdi:weather-partly-snowy-rainy"></ha-icon>${this._config.title}</div>`
          : nothing}
        <div class="stage" style="height:${this._config.height}">
          <div class="scene ${this._noWebGL ? 'fallback' : ''}"></div>
          <div class="content">
            ${this._config.show_clock
              ? html`<div class="clock">
                  <div class="time">${hourFmt.format(now)}</div>
                  <div class="date">${this._dateFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</div>
                </div>`
              : html`<div></div>`}
            <div class="panel">
              <div class="now">
                <img class="icon" alt="" src=${conditionIcon(condition, sun ? sun.state === 'above_horizon' : true)} />
                <div class="cond">
                  <div class="label">${label}</div>
                  <div class="name">${this._config.name ?? stateObj.attributes.friendly_name}</div>
                </div>
                <div class="temp">
                  <div class="big">${this._temp(stateObj.attributes.temperature)} ${unit}</div>
                  ${today
                    ? html`<div class="hl">${this._temp(today.temperature)} ${unit} / ${this._temp(today.templow)} ${unit}</div>`
                    : nothing}
                </div>
              </div>
              ${hours.length
                ? html`<div class="hourly" style="--n:${hours.length}">
                    ${hours.map(
                      (f, i) => html`<div class="hour" style="--i:${i}">
                        <div class="h">${hourFmt.format(new Date(f.datetime))}</div>
                        <img alt="" src=${conditionIcon(f.condition, isDaytime(f.datetime, sun))} />
                        <div class="t">${this._temp(f.temperature)}°</div>
                      </div>`,
                    )}
                  </div>`
                : nothing}
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      font-size: 20px;
      color: var(--primary-text-color);
    }
    .warning {
      padding: 16px;
      color: var(--error-color);
    }
    .stage {
      position: relative;
      container-type: size;
      color: #fff;
      isolation: isolate;
    }
    .scene {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: linear-gradient(#2b3442, #59626f);
    }
    .content {
      position: relative;
      z-index: 1;
      height: 100%;
      box-sizing: border-box;
      padding: 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
    }
    .clock {
      text-align: center;
      padding-top: 3cqh;
      text-shadow: 0 2px 14px rgba(0, 0, 0, 0.35);
    }
    .time {
      font-size: clamp(44px, min(17cqi, 24cqh), 104px);
      font-weight: 200;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .date {
      margin-top: 8px;
      font-size: clamp(13px, 3.6cqi, 18px);
      opacity: 0.92;
    }
    .panel {
      padding: 14px 16px 12px;
      border-radius: 22px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05)), rgba(12, 18, 28, 0.18);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.25);
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.3);
    }
    .now {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 10px;
    }
    .now .icon {
      width: clamp(56px, 17cqi, 92px);
      height: clamp(56px, 17cqi, 92px);
      margin: -8px -4px -8px -8px;
    }
    .label {
      font-size: clamp(20px, 6.2cqi, 32px);
      line-height: 1.15;
    }
    .name,
    .hl {
      font-size: clamp(12px, 3.2cqi, 15px);
      opacity: 0.85;
    }
    .temp {
      text-align: right;
    }
    .big {
      font-size: clamp(22px, 6.5cqi, 34px);
      font-weight: 300;
      line-height: 1.15;
    }
    .hourly {
      display: grid;
      grid-template-columns: repeat(var(--n), 1fr);
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }
    .hour {
      display: flex;
      flex-direction: column;
      align-items: center;
      animation: rise 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      animation-delay: calc(var(--i) * 60ms);
    }
    .hour img {
      width: clamp(34px, 10cqi, 52px);
      height: clamp(34px, 10cqi, 52px);
      margin: -4px 0;
    }
    .hour .h {
      font-size: clamp(11px, 3cqi, 14px);
      opacity: 0.85;
    }
    .hour .t {
      font-size: clamp(14px, 4.2cqi, 20px);
      font-variant-numeric: tabular-nums;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .hour {
        animation: none;
      }
    }
  `;
}

if (!customElements.get('weather-scene-card')) {
  customElements.define('weather-scene-card', WeatherSceneCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'weather-scene-card',
    name: 'Weather Scene Card',
    description: 'Clock and forecast over a live WebGL weather scene',
    preview: true,
  });
  console.info(`%c WEATHER-SCENE-CARD %c ${VERSION} `, 'background:#3b6fd4;color:#fff', '');
}
