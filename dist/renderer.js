import { STAR_TYPES } from './simulation.js';

const W = 700, H = 820, TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rgba(hex, a) {
  if (!hex || !hex.startsWith('#')) return `rgba(166,224,205,${a})`;
  let h = hex.slice(1); if (h.length === 3) h = h.split('').map(v => v + v).join('');
  const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function massText(mass) { return mass < 1 ? Number(mass).toFixed(2).replace(/0$/, '') : Number(mass).toFixed(mass < 100 ? 1 : 0).replace(/\.0$/, ''); }

export class Renderer {
  constructor(canvas, simulation) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sim = simulation;
    this.showLayers = true;
    this.pointerX = 350;
    this.selectedId = null;
    this.quality = 'high';
    this.reducedMotion = false;
    this.time = 0;
    this.particles = [];
    this.effects = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.cinematicTime = 0;
    this.isCinematicDone = false;
    this.lastState = simulation.state;
    const random = rng(413290);
    this.stars = Array.from({ length: 215 }, () => ({
      x: 18 + random() * (W - 36), y: random() * H,
      size: random() > .94 ? 2 : 1, a: .12 + random() * .48,
      phase: random() * TAU, hue: random(),
    }));
    this.galaxy = Array.from({ length: 1450 }, (_, i) => {
      const r = Math.pow(random(), .69), arm = i % 4;
      const angle = arm * Math.PI / 2 + r * 8.5 + (random() - .5) * (.13 + .7 * r);
      return { r, angle, z: (random() - .5) * (.03 + .10 * r), a: .2 + random() * .8, size: random() > .91 ? 2 : 1, hue: random(), phase: random() * TAU };
    });
    this.noise = Array.from({ length: 180 }, () => ({ x: random() * W, y: random() * H, a: random() * .035 }));
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1.25 : 2);
    const width = Math.max(1, Math.round((rect.width || W) * dpr));
    const height = Math.max(1, Math.round((rect.height || H) * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
    }
    this.scaleX = width / W; this.scaleY = height / H;
    this.ctx.imageSmoothingEnabled = true;
  }

  setQuality(value) { this.quality = value === 'low' ? 'low' : 'high'; this.resize(); }
  setReducedMotion(value) { this.reducedMotion = Boolean(value); this.shake = 0; this.flash = 0; }

  event(ev) {
    if (!ev) return;
    const x = Number.isFinite(ev.x) ? ev.x : 350, y = Number.isFinite(ev.y) ? ev.y : 410;
    const color = ev.color || (ev.kind === 'supernova' ? '#ffd391' : ev.kind === 'wave' ? '#b8b1ff' : '#9fe6cf');
    const power = clamp(ev.power || ev.mass / 15 || 1, .45, 3);
    const sparse = this.quality === 'low' || this.reducedMotion;
    const counts = { merge: 34, supernova: 150, wave: 70, burst: 28, evolve: 42, drop: 8, accretion: 16, win: 95, lose: 40 };
    const count = Math.round((counts[ev.kind] || 12) * (sparse ? .4 : 1));
    const explosive = ev.kind === 'supernova';
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = (25 + Math.random() * (explosive ? 300 : ev.kind === 'wave' ? 150 : 125)) * Math.sqrt(power);
      const life = explosive ? .6 + Math.random() * 2.3 : .35 + Math.random() * 1.1;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max:life, color: Math.random() < .22 ? '#fff5cf' : color, size: Math.random() > .8 ? 3 : Math.random() > .4 ? 2 : 1, drag: explosive ? .45 : 1.8, tail: explosive || ev.kind === 'wave' });
    }
    if (this.particles.length > (sparse ? 260 : 850)) this.particles.splice(0, this.particles.length - (sparse ? 260 : 850));
    const durations = { merge: .65, supernova: 2.8, wave: 3.7, burst: .85, evolve: 1.5, drop: .4, accretion:.6, win: 2.4, lose: 1.3 };
    this.effects.push({ kind: ev.kind, x, y, color, power, life: durations[ev.kind] || .6, max: durations[ev.kind] || .6 });
    if (this.effects.length > 40) this.effects.shift();
    if (!this.reducedMotion) {
      if (explosive) { this.shake = Math.min(11, 3.7 * power); this.flash = .13; }
      if (ev.kind === 'wave') this.shake = Math.min(5, 1.5 * power);
    }
    if (ev.text) this.texts.push({ x, y, text: String(ev.text), color, life: 1.65, max: 1.65 });
    if (ev.kind === 'win') { this.cinematicTime = 0; this.isCinematicDone = false; }
  }

  render(dt = 1 / 60) {
    // A zero delta is intentional during pause; all animation uses this clock.
    dt = Number.isFinite(dt) ? clamp(dt, 0, .06) : 1 / 60;
    this.time += dt;
    const c = this.ctx;
    c.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    this._background();
    if (this.sim.state !== 'won' && this.lastState === 'won') { this.cinematicTime = 0; this.isCinematicDone = false; }
    this.lastState = this.sim.state;
    if (this.sim.state === 'won') {
      this.cinematicTime += dt;
      this._cinematic();
      this._updateParticles(dt, this.cinematicTime < 2.5);
      this.isCinematicDone = this.cinematicTime > 9;
      return;
    }
    c.save();
    if (this.shake > .1 && !this.reducedMotion) c.translate(Math.sin(this.time * 97) * this.shake, Math.cos(this.time * 79) * this.shake * .6);
    this._arena();
    this._gravityFields();
    this._drawStreams();
    const bodies = this.sim.bodies || [];
    for (const body of bodies) if (body.kind === 'star' || body.kind === 'wd') this._body(body);
    for (const body of bodies) if (body.kind === 'bh' || body.kind === 'ns') this._body(body);
    if (!this.inspectMode && (this.sim.state === 'ready' || this.sim.state === 'playing')) this._dropGuide();
    this._drawEffects(dt);
    this._updateParticles(dt, true);
    this._drawTexts(dt);
    c.restore();
    if (this.flash > 0 && !this.reducedMotion) { c.fillStyle = `rgba(255,232,186,${this.flash})`; c.fillRect(0, 0, W, H); }
    this.shake *= Math.exp(-dt * 8); this.flash *= Math.exp(-dt * 12);
  }

  _background() {
    const c = this.ctx;
    c.fillStyle = '#080e0d'; c.fillRect(0, 0, W, H);
    const cloud = c.createRadialGradient(320, 490, 0, 320, 490, 520);
    cloud.addColorStop(0, '#10211e'); cloud.addColorStop(.6, '#0b1715'); cloud.addColorStop(1, '#070d0c');
    c.fillStyle = cloud; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(106,155,133,.027)'; c.lineWidth = 1;
    c.beginPath();
    for (let x = 30; x < W; x += 40) { c.moveTo(x, 112); c.lineTo(x, H - 18); }
    for (let y = 140; y < H; y += 40) { c.moveTo(20, y); c.lineTo(W - 20, y); }
    c.stroke();
    const holes = (this.sim.bodies || []).filter(b => b.kind === 'bh');
    for (const star of this.stars) {
      let x = star.x, y = star.y;
      if (!this.reducedMotion && this.sim.state !== 'won') for (const hole of holes) {
        const dx = x - hole.x, dy = y - hole.y, d = Math.hypot(dx, dy), reach = Math.max(110, hole.radius * 5);
        if (d > hole.radius && d < reach) { const lens = (1 - d / reach) * 15; x += dx / d * lens; y += dy / d * lens; }
      }
      const twinkle = this.reducedMotion ? 1 : .76 + .24 * Math.sin(this.time * .7 + star.phase);
      c.fillStyle = star.hue > .86 ? `rgba(211,177,113,${star.a * twinkle})` : `rgba(159,194,175,${star.a * twinkle})`;
      c.fillRect(Math.round(x), Math.round(y), star.size, star.size);
      if (star.size === 2 && star.a > .5) { c.globalAlpha = .15; c.fillRect(x - 2, y + .5, 6, 1); c.fillRect(x + .5, y - 2, 1, 6); c.globalAlpha = 1; }
    }
    if (this.quality === 'high') for (const grain of this.noise) { c.fillStyle = `rgba(138,198,165,${grain.a})`; c.fillRect(grain.x, grain.y, 1, 1); }
  }

  _arena() {
    const c = this.ctx;
    c.lineWidth = 1;
    const edge = c.createLinearGradient(0, 100, 0, 800); edge.addColorStop(0, 'rgba(128,157,128,.06)'); edge.addColorStop(1, 'rgba(128,157,128,.28)');
    c.strokeStyle = edge; c.beginPath(); c.moveTo(20.5, 108); c.lineTo(20.5, 798.5); c.lineTo(679.5, 798.5); c.lineTo(679.5, 108); c.stroke();
    c.strokeStyle = 'rgba(164,187,138,.22)'; c.setLineDash([3, 7]); c.beginPath(); c.moveTo(20, 100.5); c.lineTo(680, 100.5); c.stroke(); c.setLineDash([]);
    c.font = '9px "JetBrains Mono", monospace'; c.fillStyle = 'rgba(155,178,143,.50)'; c.textAlign = 'right'; c.fillText('临界高度', 675, 91);
    c.strokeStyle = 'rgba(157,187,141,.3)';
    for (const x of [20, 680]) { c.beginPath(); c.moveTo(x + (x === 20 ? 10 : -10), 110); c.lineTo(x, 110); c.lineTo(x, 120); c.stroke(); }
    for (let x = 40; x < 680; x += 20) { const major = x % 100 === 0; c.fillStyle = `rgba(145,178,149,${major ? .25 : .12})`; c.fillRect(x, 800, 1, major ? 7 : 3); }
  }

  _gravityFields() {
    const c = this.ctx;
    for (const b of this.sim.bodies || []) {
      if (b.kind !== 'bh' && b.kind !== 'ns') continue;
      const bh = b.kind === 'bh', r = b.radius || 20;
      c.save(); c.translate(b.x, b.y);
      for (let i = 0; i < 3; i++) {
        const phase = this.reducedMotion ? i / 3 : (this.time * .12 + i / 3) % 1;
        const radius = r * (2.1 + (1 - phase) * 3.7);
        c.strokeStyle = bh ? `rgba(196,152,94,${.025 + phase * .025})` : `rgba(116,218,239,${.018 + phase * .024})`;
        c.lineWidth = .8; c.setLineDash([2, 9]);
        c.beginPath(); c.ellipse(0, 0, radius, radius * .9, -.2, 0, TAU); c.stroke();
      }
      c.setLineDash([]); c.restore();
    }
  }

  _drawStreams() {
    const c = this.ctx, bodies = this.sim.bodies || [];
    for (const b of bodies) {
      const donors = Array.isArray(b.accretingIds) && b.accretingIds.length ? b.accretingIds : b.accretingId != null ? [b.accretingId] : [];
      for (const donorId of donors) {
        const donor = bodies.find(v => v.id === donorId);
        if (!donor) continue;
        const dx = donor.x - b.x, dy = donor.y - b.y, d = Math.hypot(dx, dy);
        if (d < 2) continue;
        const bend = Math.min(d * .40, 65), px = -dy / d, py = dx / d;
        const ctrlX = (donor.x + b.x) / 2 + px * bend, ctrlY = (donor.y + b.y) / 2 + py * bend;
        const color = b.kind === 'bh' ? '#f9bd77' : b.kind === 'ns' ? '#97edff' : '#fff4c8';
        c.save(); c.globalCompositeOperation = 'screen';
        for (let j = 0; j < 3; j++) {
          c.lineWidth = j === 0 ? 10 : j === 1 ? 4 : 1;
          c.strokeStyle = rgba(color, j === 0 ? .035 : j === 1 ? .11 : .42);
          c.beginPath(); c.moveTo(donor.x, donor.y); c.quadraticCurveTo(ctrlX + j * 3, ctrlY - j * 2, b.x, b.y); c.stroke();
        }
        for (let i = 0; i < 16; i++) {
          const t = (this.time * (this.reducedMotion ? .05 : .75) + i / 16) % 1, u = 1 - t;
          const x = u * u * donor.x + 2 * u * t * ctrlX + t * t * b.x;
          const y = u * u * donor.y + 2 * u * t * ctrlY + t * t * b.y;
          c.fillStyle = rgba(color, .25 + t * .65); const size = i % 4 === 0 ? 3 : 2;
          c.fillRect(Math.round(x), Math.round(y), size, size);
        }
        c.restore();
      }
    }
  }

  _body(b) {
    const c = this.ctx, radius = b.radius || 22;
    if (b.kind === 'bh') this._blackHole(b);
    else if (b.kind === 'ns') this._neutronStar(b);
    else this._star(b);
    if (b.id === this.selectedId) {
      c.save(); c.strokeStyle = 'rgba(228,243,189,.75)'; c.lineWidth = 1; c.setLineDash([4, 5]);
      c.beginPath(); c.arc(b.x, b.y, radius + 8, 0, TAU); c.stroke(); c.restore();
      c.fillStyle = '#dcecb3'; c.fillRect(b.x - 2, b.y - radius - 14, 4, 4);
    }
  }

  _star(b) {
    const c = this.ctx, type = STAR_TYPES[b.type] || STAR_TYPES[0], wd = b.kind === 'wd';
    const r = b.radius || type.radius || 20;
    const color = wd ? '#d9f0e8' : type.color || '#f4bb79';
    const phase = Number(b.seed) || b.id * 1.71 || 0;
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 2 + phase) * .018;
    c.save(); c.translate(b.x, b.y);
    const corona = c.createRadialGradient(0, 0, r * .7, 0, 0, r * 2.1);
    corona.addColorStop(0, rgba(color, .17)); corona.addColorStop(.3, rgba(color, .09)); corona.addColorStop(1, rgba(color, 0));
    c.fillStyle = corona; c.fillRect(-r * 2.1, -r * 2.1, r * 4.2, r * 4.2);
    if (r > 25 && this.quality === 'high') {
      c.strokeStyle = rgba(color, .16); c.lineWidth = .7;
      c.beginPath(); c.arc(0, 0, r + 2.5, .25 + phase, 3.7 + phase); c.stroke();
      c.beginPath(); c.arc(0, 0, r + 4, 4.2 + phase, 5.6 + phase); c.stroke();
    }
    c.save(); c.scale(pulse, pulse);
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
    const surface = c.createRadialGradient(-r * .32, -r * .38, 0, 0, 0, r * 1.18);
    surface.addColorStop(0, wd ? '#f7ffff' : '#fff3cc'); surface.addColorStop(.16, color);
    surface.addColorStop(.70, rgba(color, .9)); surface.addColorStop(1, '#263a30');
    c.fillStyle = surface; c.fillRect(-r, -r, r * 2, r * 2);
    const angular = phase + (this.reducedMotion ? 0 : this.time * .08);
    for (let i = 0; i < (this.quality === 'low' ? 16 : 34); i++) {
      const a = i * 2.39996 + angular, rr = Math.sqrt((i + .5) / 34) * r * .95;
      const gx = Math.cos(a) * rr, gy = Math.sin(a) * rr;
      const size = r > 40 ? 2 : 1;
      c.fillStyle = i % 3 ? 'rgba(255,253,210,.11)' : 'rgba(37,31,19,.16)';
      c.fillRect(Math.round(gx), Math.round(gy), size + (i % 4 === 0 ? 1 : 0), size);
    }
    if (this.showLayers && !wd) this._layers(type, r, color, b.mass >= 8 && Number.isFinite(b.collapseAt) && b.collapseAt - b.age < 5, b.layers);
    if (wd && this.showLayers) {
      c.fillStyle = 'rgba(74,119,142,.22)'; c.beginPath(); c.arc(r * .12, r * .08, r * .64, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(221,253,255,.45)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r * .66, -.6, 2.0); c.stroke();
    }
    c.restore();
    c.strokeStyle = rgba(color, .66); c.lineWidth = .8; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    // Legible identity, kept over the upper face so the exposed layers remain visible.
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${r < 21 ? 12 : r < 32 ? 15 : 18}px "JetBrains Mono", monospace`;
    c.fillStyle = 'rgba(9,15,13,.72)'; c.fillText(wd ? 'WD' : type.type || type.name?.[0] || 'M', .8, -r * .12 + .8);
    c.fillStyle = '#fff6d9'; c.fillText(wd ? 'WD' : type.type || type.name?.[0] || 'M', 0, -r * .12);
    c.font = `500 ${r < 22 ? 8 : r < 33 ? 9 : 10}px "JetBrains Mono", monospace`;
    c.fillStyle = 'rgba(10,17,15,.8)'; c.fillText(`${massText(b.mass)} M☉`, .6, r * .39 + .6);
    c.fillStyle = '#fff4d4'; c.fillText(`${massText(b.mass)} M☉`, 0, r * .39);
    // Fast massive-star evolution is visually legible as a shrinking fuse.
    if (!wd && b.mass >= 8 && b.age > 0) {
      const lifetime = b.collapseAt || b.evolutionTime || b.lifetime || b.lifeTime;
      if (lifetime) {
        const progress = clamp(b.age / lifetime, 0, 1);
        c.strokeStyle = progress > .75 ? '#ffd7a0' : rgba(color, .7); c.lineWidth = 1.8;
        c.beginPath(); c.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + (1 - progress) * TAU); c.stroke();
      }
    }
    c.restore();
  }

  _layers(type, r, color, terminal = false, evolvedLayers = null) {
    const c = this.ctx;
    const lateLayers = Array.isArray(evolvedLayers) && evolvedLayers.some(layer => /Fe/.test(layer.name));
    const layers = terminal && lateLayers ? [...evolvedLayers].reverse() : terminal ? [
      { name:'H',color,fraction:.28 }, { name:'He',color:'#e3a666',fraction:.23 },
      { name:'C/O',color:'#b87553',fraction:.20 }, { name:'Si',color:'#867c91',fraction:.16 }, { name:'Fe',color:'#d7d2ae',fraction:.13 },
    ] : Array.isArray(type.layers) && type.layers.length ? [...type.layers].reverse() : [{name:'H',color,fraction:.64},{name:'He',color:'#f5d9a4',fraction:.36}];
    c.save();
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r + 1, -.52, 1.91); c.closePath(); c.clip();
    // The wedge is an exposed cross section, with nested compositional zones.
    let radius = r, coreRadius = r * .2;
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      c.fillStyle = layer.color || [color, '#d78253', '#f4d291', '#fff0c4'][i % 4];
      c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(28,27,21,.20)'; c.lineWidth = .8; c.stroke();
      const fraction = Number(layer.fraction) || 1 / layers.length;
      coreRadius = radius;
      radius = Math.max(0, radius - r * (fraction > 1 ? fraction / 100 : fraction));
    }
    const core = c.createRadialGradient(0, 0, 0, 0, 0, coreRadius);
    core.addColorStop(0, 'rgba(255,249,205,.75)'); core.addColorStop(1, 'rgba(255,216,112,0)');
    c.fillStyle = core; c.beginPath(); c.arc(0, 0, coreRadius, 0, TAU); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255,245,201,.35)'; c.lineWidth = .7;
    c.beginPath(); c.moveTo(Math.cos(-.52) * r, Math.sin(-.52) * r); c.lineTo(0, 0); c.lineTo(Math.cos(1.91) * r, Math.sin(1.91) * r); c.stroke();
  }

  _blackHole(b, cinematic = false) {
    const c = this.ctx, r = b.radius || 24, t = this.reducedMotion ? 0 : this.time;
    c.save(); c.translate(b.x, b.y);
    const glow = c.createRadialGradient(0, 0, r * .7, 0, 0, r * 3.1);
    glow.addColorStop(0, 'rgba(255,169,67,.15)'); glow.addColorStop(.45, 'rgba(207,113,40,.07)'); glow.addColorStop(1, 'rgba(132,77,37,0)');
    c.fillStyle = glow; c.fillRect(-r * 3.1, -r * 3.1, r * 6.2, r * 6.2);
    c.rotate(-.18);
    // Lensed far side of the disk rises over the event horizon.
    c.save(); c.globalCompositeOperation = 'screen';
    for (let i = 6; i >= 0; i--) {
      c.strokeStyle = i > 2 ? `rgba(255,173,74,${.035 + (6 - i) * .015})` : ['rgba(255,243,191,.92)','rgba(255,188,93,.75)','rgba(255,143,55,.4)'][i];
      c.lineWidth = i > 2 ? 2 : 1.5;
      c.beginPath(); c.ellipse(0, -r * .03, r * (1.05 + i * .055), r * (.99 + i * .035), 0, Math.PI, TAU); c.stroke();
    }
    for (let i = 7; i >= 0; i--) {
      c.strokeStyle = rgba(i < 2 ? '#fff0ba' : '#f6ab55', i < 2 ? .7 : .055 + (7 - i) * .026);
      c.lineWidth = i < 2 ? 1.2 : 2;
      c.beginPath(); c.ellipse(0, 0, r * (2.05 + i * .13), r * (.31 + i * .025), 0, Math.PI, TAU); c.stroke();
    }
    c.restore();
    c.fillStyle = '#030504'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,200,120,.7)'; c.lineWidth = .9; c.stroke();
    // Near disk crosses in front. Fine nested ellipses create an incandescent edge.
    c.save(); c.globalCompositeOperation = 'screen';
    for (let i = 6; i >= 0; i--) {
      c.strokeStyle = rgba(i < 2 ? '#ffebbc' : '#e59246', i < 2 ? .85 : .045 + (6 - i) * .055);
      c.lineWidth = i < 2 ? 1.25 : 2.5;
      c.beginPath(); c.ellipse(0, 0, r * (2.05 + i * .15), r * (.30 + i * .028), 0, 0, Math.PI); c.stroke();
    }
    for (let i = 0; i < 17; i++) {
      const angle = i * 2.399 + t * (i % 2 ? .9 : 1.2), distance = r * (1.8 + (i % 4) * .17);
      c.fillStyle = i % 4 ? 'rgba(255,201,123,.72)' : '#fff4d1';
      c.fillRect(Math.cos(angle) * distance, Math.sin(angle) * r * .34, i % 5 ? 1 : 2, 1);
    }
    c.restore(); c.rotate(.18);
    if (!cinematic) {
      c.textAlign = 'center'; c.font = '600 9px "JetBrains Mono", monospace'; c.fillStyle = '#ffd293';
      c.fillText(`BH · ${massText(b.mass)} M☉`, 0, r + 17);
    }
    c.restore();
  }

  _neutronStar(b) {
    const c = this.ctx, r = b.radius || 14;
    const phase = this.reducedMotion ? .7 : this.time * 2.8 + (Number(b.seed) || 0);
    const pulse = .5 + Math.sin(phase * 2) * .5;
    c.save(); c.translate(b.x, b.y);
    const glow = c.createRadialGradient(0, 0, 1, 0, 0, r * 4.7);
    glow.addColorStop(0, 'rgba(192,253,255,.55)'); glow.addColorStop(.22, 'rgba(105,214,239,.17)'); glow.addColorStop(1, 'rgba(55,139,193,0)');
    c.fillStyle = glow; c.fillRect(-r * 5, -r * 5, r * 10, r * 10);
    c.save(); c.rotate(phase * .37);
    for (const side of [-1, 1]) {
      const beam = c.createLinearGradient(0, 0, 0, side * r * 6);
      beam.addColorStop(0, `rgba(184,245,255,${.34 + pulse * .2})`); beam.addColorStop(1, 'rgba(126,220,255,0)');
      c.fillStyle = beam; c.beginPath(); c.moveTo(-r * .15, 0); c.lineTo(-r * .9, side * r * 6); c.lineTo(r * .9, side * r * 6); c.lineTo(r * .15, 0); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(180,245,255,.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, side * r); c.lineTo(0, side * r * 4.3); c.stroke();
    }
    c.restore();
    c.strokeStyle = 'rgba(112,218,241,.34)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, r * 1.6, r * .6, -.3, 0, TAU); c.stroke();
    const surface = c.createRadialGradient(-r * .3, -r * .3, 0, 0, 0, r);
    surface.addColorStop(0, '#ffffff'); surface.addColorStop(.32, '#ddffff'); surface.addColorStop(.7, '#83d6e5'); surface.addColorStop(1, '#448baf');
    c.fillStyle = surface; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(224,255,255,.8)'; c.lineWidth = .8; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 9px "JetBrains Mono", monospace'; c.fillStyle = '#173c46'; c.fillText('NS', 0, 0);
    c.textBaseline = 'alphabetic'; c.font = '500 9px "JetBrains Mono", monospace'; c.fillStyle = '#bdeef3'; c.fillText(`${massText(b.mass)} M☉`, 0, r + 15);
    c.restore();
  }

  _dropGuide() {
    const c = this.ctx, type = STAR_TYPES[this.sim.nextType] || STAR_TYPES[0];
    const r = type.radius || 20, x = clamp(this.pointerX || 350, r + 21, W - r - 21), y = 51;
    c.save();
    c.strokeStyle = rgba(type.color, .15); c.lineWidth = 1; c.setLineDash([2, 6]); c.beginPath(); c.moveTo(x, y + r + 9); c.lineTo(x, H - 30); c.stroke(); c.setLineDash([]);
    const glow = c.createRadialGradient(x, y, 0, x, y, r * 2); glow.addColorStop(0, rgba(type.color, .16)); glow.addColorStop(1, rgba(type.color, 0));
    c.fillStyle = glow; c.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    c.fillStyle = rgba(type.color, .055); c.strokeStyle = rgba(type.color, .65); c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = type.color; c.font = '600 13px "JetBrains Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(type.type || 'M', x, y - 2);
    c.font = '8px "JetBrains Mono", monospace'; c.globalAlpha = .7; c.fillText(`${massText(type.mass)} M☉`, x, y + 11); c.globalAlpha = 1;
    c.strokeStyle = rgba(type.color, .42); c.beginPath(); c.moveTo(x - 3, 90); c.lineTo(x, 93); c.lineTo(x + 3, 90); c.stroke();
    c.restore();
  }

  _drawEffects(dt) {
    const c = this.ctx;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.life -= dt; if (e.life <= 0) { this.effects.splice(i, 1); continue; }
      const p = 1 - e.life / e.max, fade = Math.pow(1 - p, 1.4);
      c.save(); c.translate(e.x, e.y);
      if (e.kind === 'wave') {
        const speed = this.reducedMotion ? 180 : 330;
        const radius = 12 + p * speed * Math.sqrt(e.power);
        // A gently displaced local spacetime lattice makes the wave read as gravity.
        c.lineWidth = .8; c.strokeStyle = rgba(e.color, fade * .11);
        for (let axis = 0; axis < (this.quality === 'low' ? 0 : 2); axis++) for (let row = -4; row <= 4; row++) {
          c.beginPath();
          for (let step = -10; step <= 10; step++) {
            const a = step * 25, b = row * 30, d = Math.hypot(a, b);
            const displacement = Math.sin((d - radius) * .085) * Math.exp(-Math.pow((d - radius) / 65, 2)) * 10 * fade;
            const x = axis ? b + displacement : a, y = axis ? a : b + displacement;
            if (step === -10) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.stroke();
        }
        for (let k = 0; k < 4; k++) {
          const rr = Math.max(1, radius - k * 22);
          c.strokeStyle = rgba(e.color, fade * (.45 - k * .08)); c.lineWidth = k ? 1 : 2;
          c.beginPath(); c.ellipse(0, 0, rr, rr * .78, -.18, 0, TAU); c.stroke();
        }
      } else if (e.kind === 'supernova') {
        const radius = 10 + ease(p) * (170 + e.power * 55);
        const blast = c.createRadialGradient(0, 0, radius * .65, 0, 0, radius);
        blast.addColorStop(0, rgba(e.color, 0)); blast.addColorStop(.6, rgba(e.color, fade * .07)); blast.addColorStop(.91, rgba(e.color, fade * .20)); blast.addColorStop(1, rgba(e.color, 0));
        c.fillStyle = blast; c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.fill();
        for (let k = 0; k < 3; k++) {
          c.strokeStyle = rgba(k === 0 ? '#fff1ce' : e.color, fade * (.6 - k * .16)); c.lineWidth = k === 0 ? 1.6 : .8;
          c.beginPath(); c.arc(0, 0, radius * (1 - k * .09), 0, TAU); c.stroke();
        }
        if (p < .35) {
          const core = c.createRadialGradient(0, 0, 0, 0, 0, 45 + p * 150);
          core.addColorStop(0, rgba('#fffce8', (1 - p / .35) * .65)); core.addColorStop(.3, rgba(e.color, (1 - p / .35) * .3)); core.addColorStop(1, rgba(e.color, 0));
          c.fillStyle = core; c.fillRect(-100, -100, 200, 200);
        }
      } else {
        const burst = e.kind === 'burst', r = 5 + ease(p) * (burst ? 90 : e.kind === 'merge' ? 54 : 36) * Math.sqrt(e.power);
        c.strokeStyle = rgba(e.color, fade * .7); c.lineWidth = burst ? 1.2 : 1;
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
        if (e.kind === 'merge' || e.kind === 'evolve') {
          c.strokeStyle = rgba(e.color, fade * .16); c.lineWidth = 5; c.beginPath(); c.arc(0, 0, r * .94, 0, TAU); c.stroke();
        }
        if (burst) {
          c.strokeStyle = rgba('#d8fdff', fade * .6); c.lineWidth = 1;
          c.beginPath(); c.moveTo(-r * 1.4, 0); c.lineTo(r * 1.4, 0); c.moveTo(0, -r * 1.4); c.lineTo(0, r * 1.4); c.stroke();
        }
      }
      c.restore();
    }
  }

  _updateParticles(dt, draw) {
    const c = this.ctx;
    c.save();
    if (draw) c.globalCompositeOperation = 'screen';
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt * (this.reducedMotion ? .35 : 1); p.y += p.vy * dt * (this.reducedMotion ? .35 : 1);
      p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
      if (!draw) continue;
      const alpha = Math.min(1, p.life / p.max * 1.4);
      c.globalAlpha = alpha; c.fillStyle = p.color; c.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      if (p.tail && p.life / p.max > .4 && !this.reducedMotion) { c.strokeStyle = rgba(p.color, .23); c.lineWidth = p.size * .5; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * .04, p.y - p.vy * .04); c.stroke(); }
    }
    c.restore();
  }

  _drawTexts(dt) {
    const c = this.ctx;
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const e = this.texts[i]; e.life -= dt; if (e.life <= 0) { this.texts.splice(i, 1); continue; }
      const progress = 1 - e.life / e.max;
      c.save(); c.globalAlpha = Math.min(1, e.life * 2.5); c.font = '600 12px "JetBrains Mono", monospace'; c.textAlign = 'center';
      c.fillStyle = 'rgba(4,10,8,.85)'; c.fillText(e.text, e.x + 1, e.y - 24 - progress * 32 + 1);
      c.fillStyle = e.color; c.fillText(e.text, e.x, e.y - 24 - progress * 32); c.restore();
    }
  }

  _cinematic() {
    const c = this.ctx, t = this.cinematicTime;
    const winner = (this.sim.bodies || []).filter(b => b.kind === 'bh').sort((a, b) => b.mass - a.mass)[0];
    const bx = winner?.x || 350, by = winner?.y || 410;
    const zoom = mix(1, .12, ease((t - .6) / 7.8));
    if (t < 7) {
      c.save(); c.globalAlpha = 1 - ease((t - 2) / 5);
      c.translate(W / 2, H / 2); c.scale(zoom, zoom); c.translate(-mix(350, bx, ease(t / 2)), -mix(410, by, ease(t / 2)));
      this._gravityFields(); this._drawStreams(); for (const b of this.sim.bodies || []) this._body(b); c.restore();
    }
    const arrival = ease((t - 1.5) / 5.5), rotation = this.reducedMotion ? 0 : this.time * .022;
    if (arrival <= 0) return;
    c.save(); c.translate(350, 410); c.rotate(-.35); c.globalAlpha = arrival;
    const halo = c.createRadialGradient(0, 0, 0, 0, 0, 310);
    halo.addColorStop(0, 'rgba(241,185,100,.20)'); halo.addColorStop(.25, 'rgba(119,137,91,.11)'); halo.addColorStop(.7, 'rgba(61,119,103,.06)'); halo.addColorStop(1, 'rgba(27,67,57,0)');
    c.save(); c.scale(1, .62); c.fillStyle = halo; c.fillRect(-330, -330, 660, 660); c.restore();
    c.globalCompositeOperation = 'screen';
    const sample = this.quality === 'low' ? 2 : 1;
    for (let i = 0; i < this.galaxy.length; i += sample) {
      const p = this.galaxy[i], r = 20 + p.r * 286 * mix(.45, 1, arrival);
      const a = p.angle + rotation / (.5 + p.r);
      let x = Math.cos(a) * r, y = Math.sin(a) * r * .48 + p.z * 200;
      // A few luminous particles continuously fall toward the galactic nucleus.
      if (i % 31 === 0 && t > 4 && !this.reducedMotion) {
        const infall = 1 - (this.time * .1 + p.phase) % 1;
        x *= infall; y *= infall;
      }
      c.fillStyle = p.r < .22 ? `rgba(255,217,153,${p.a * arrival})` : p.hue > .8 ? `rgba(173,181,231,${p.a * arrival * .8})` : `rgba(138,201,176,${p.a * arrival * .75})`;
      c.fillRect(Math.round(x), Math.round(y), p.size, p.size);
      if (p.size === 2 && i % 3 === 0) { c.globalAlpha = arrival * .12; c.fillRect(x - 2, y - 2, 6, 6); c.globalAlpha = arrival; }
    }
    c.restore();
    if (t > 3.5) {
      c.save(); c.globalAlpha = ease((t - 3.5) / 2.5);
      this._blackHole({ x:350, y:410, radius:mix(13, 24, ease((t - 3.5) / 5)), mass:1e6 }, true); c.restore();
    }
    if (t > 7) {
      c.save(); c.globalAlpha = ease((t - 7) / 2); c.textAlign = 'center';
      c.font = '10px "JetBrains Mono", monospace'; c.fillStyle = '#9fae8d'; c.fillText('从一颗恒星，到一座星系', 350, 635);
      c.fillStyle = '#e2c491'; c.font = '500 11px "JetBrains Mono", monospace'; c.fillText('SUPERMASSIVE BLACK HOLE', 350, 657); c.restore();
    }
  }
}
