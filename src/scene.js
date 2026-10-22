import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2, WebGLRenderer } from 'three';
import { fragmentShader, vertexShader } from './shader.js';

const QUALITY = {
  low: { scale: 0.5, fps: 24, octaves: 3, drops: 0 },
  medium: { scale: 0.75, fps: 40, octaves: 4, drops: 1 },
  high: { scale: 1, fps: 60, octaves: 5, drops: 1 },
};

const KEYS = ['day', 'golden', 'cloud', 'rain', 'snow', 'fog', 'wind', 'storm', 'sunX', 'sunY'];

// Owns one WebGL context and the render loop for a single card.
export class WeatherScene {
  constructor(container, quality = 'high', reducedMotion = false) {
    this.container = container;
    this.q = QUALITY[quality] ?? QUALITY.high;
    if (reducedMotion) this.q = { ...this.q, fps: 6 };
    this.current = null;
    this.target = { day: 1, golden: 0, cloud: 0.5, rain: 0, snow: 0, fog: 0, wind: 0, storm: 0, sunX: 0.3, sunY: 0.8 };
    this.flash = 0;
    this.running = false;
    this.visible = true;

    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    const canvas = this.renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.appendChild(canvas);

    this.uniforms = {
      uTime: { value: 0 },
      uRes: { value: new Vector2(1, 1) },
      uSun: { value: new Vector2(0.3, 0.8) },
      uDay: { value: 1 },
      uGolden: { value: 0 },
      uCloud: { value: 0 },
      uRain: { value: 0 },
      uSnow: { value: 0 },
      uFog: { value: 0 },
      uFlash: { value: 0 },
      uWind: { value: 0 },
    };
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      defines: { OCTAVES: this.q.octaves, DROPS: this.q.drops },
      depthTest: false,
      depthWrite: false,
    });
    this.scene = new Scene();
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
    });
    this.intersectionObserver.observe(container);
    this.resize();

    this.startTime = performance.now();
    this.lastFrame = 0;
    this.tick = this.tick.bind(this);
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const s = Math.min(window.devicePixelRatio || 1, 2) * this.q.scale;
    this.renderer.setSize(Math.round(w * s), Math.round(h * s), false);
    this.uniforms.uRes.value.set(w, h);
  }

  setTargets(t) {
    Object.assign(this.target, t);
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
  }

  tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this.tick);
    const dt = (now - this.lastFrame) / 1000;
    if (dt < 1 / this.q.fps || !this.visible || document.hidden) return;
    this.lastFrame = now;
    this.step(Math.min(dt, 0.1));
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    // ease every parameter towards its target so weather changes blend in
    if (!this.current) this.current = { ...this.target };
    const k = Math.min(1, dt * 0.6);
    for (const key of KEYS) this.current[key] += (this.target[key] - this.current[key]) * k;
    const c = this.current;

    if (c.storm > 0.05 && Math.random() < c.storm * dt * 0.12) {
      this.flash = 1;
      // the second, weaker strike that real lightning usually has
      setTimeout(() => { this.flash = Math.max(this.flash, 0.7); }, 120 + Math.random() * 120);
    }
    this.flash *= Math.exp(-dt * 7);

    const u = this.uniforms;
    u.uTime.value = (performance.now() - this.startTime) / 1000;
    u.uDay.value = c.day;
    u.uGolden.value = c.golden;
    u.uCloud.value = c.cloud;
    u.uRain.value = c.rain;
    u.uSnow.value = c.snow;
    u.uFog.value = c.fog;
    u.uWind.value = c.wind;
    u.uFlash.value = this.flash;
    u.uSun.value.set(c.sunX, c.sunY);
  }

  dispose() {
    this.stop();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
