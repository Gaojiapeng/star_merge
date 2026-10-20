/**
 * STELLAR FORGE — deterministic, dependency-free simulation.
 * Stellar masses are in solar masses. Time, distance and evolutionary lifetimes
 * are deliberately compressed; spectral tiers are a mass-conserving game ladder.
 */
/* Sizes follow the reference 合成大西瓜 demo (tinoe.bytedance.com/demo/watermelon):
 * fruit sprite diameters 52, 78, 108, 119, 153, 183 | 186 | 258, 308, 404 on a
 * 720-wide board. Our nine rungs take them in order, skipping the peach (186,
 * a near-twin of the tomato), so the six droppable classes M–B line up with the
 * six droppable fruits and O3V is the watermelon. Scaled to our 660-wide chamber. */
const REFERENCE_SCALE = 660 / 720;
const refRadius = diameter => diameter / 2 * REFERENCE_SCALE;
export const STAR_TYPES = [
  { type: 'M', name: '红矮星', mass: 0.25, radius: refRadius(52), color: '#ff7a4c', temp: 3200, layers: [
    { name: '全对流 H / He', color: '#b93831', fraction: 0.78 },
    { name: '氢包层', color: '#ff8a62', fraction: 0.22 },
  ] },
  { type: 'K', name: '橙矮星', mass: 0.5, radius: refRadius(78), color: '#ffa84e', temp: 4500, layers: [
    { name: '富氦核心', color: '#fff2be', fraction: 0.25 },
    { name: '氢燃烧区', color: '#eb7850', fraction: 0.3 },
    { name: '氢对流包层', color: '#ffbd70', fraction: 0.45 },
  ] },
  { type: 'G', name: '黄矮星', mass: 1, radius: refRadius(108), color: '#ffd46a', temp: 5800, layers: [
    { name: 'H → He 核心', color: '#fff7d7', fraction: 0.22 },
    { name: '辐射层 · H / He', color: '#e3a84c', fraction: 0.46 },
    { name: '对流氢包层', color: '#ffe691', fraction: 0.32 },
  ] },
  { type: 'F', name: '黄白恒星', mass: 2, radius: refRadius(119), color: '#fbecc4', temp: 7000, layers: [
    { name: 'CNO 循环核 · H → He', color: '#ffffff', fraction: 0.3 },
    { name: '辐射层 · H / He', color: '#dcb176', fraction: 0.5 },
    { name: '浅对流氢包层', color: '#f9edc6', fraction: 0.2 },
  ] },
  { type: 'A', name: '白色恒星', mass: 4, radius: refRadius(153), color: '#d6e6ff', temp: 9500, layers: [
    { name: '对流核 · H → He', color: '#ffffff', fraction: 0.34 },
    { name: '辐射层 · H / He', color: '#739fc4', fraction: 0.46 },
    { name: '氢包层', color: '#d6edff', fraction: 0.2 },
  ] },
  { type: 'B', name: '蓝白恒星', mass: 8, radius: refRadius(183), color: '#8db8ff', temp: 22000, layers: [
    { name: '富氦对流核', color: '#fff4e1', fraction: 0.4 },
    { name: 'CNO 燃烧区', color: '#6697eb', fraction: 0.25 },
    { name: '辐射氢包层', color: '#a6dcff', fraction: 0.35 },
  ] },
  { type: 'O', name: '蓝色大质量恒星', mass: 16, radius: refRadius(258), color: '#a49cff', temp: 40000, layers: [
    { name: '富氦对流核', color: '#fff8ef', fraction: 0.43 },
    { name: 'CNO 燃烧区', color: '#8d87ec', fraction: 0.27 },
    { name: '辐射氢包层', color: '#c5caff', fraction: 0.3 },
  ] },
];

/** O stars climb a short ladder of their own: O9V + O9V → O6V, O6V + O6V → O3V.
 * O3V is the end of the line. Subclass follows mass (16 / 32 / 64 M☉), so a
 * stripped donor falls back down the ladder. */
export const O_SUBCLASSES = [
  { type: 'O9V', name: '蓝色大质量恒星', mass: 16, radius: refRadius(258), color: '#a49cff', temp: 33000, layers: STAR_TYPES[6].layers },
  { type: 'O6V', name: '炽热大质量恒星', mass: 32, radius: refRadius(308), color: '#8a78ff', temp: 40000, layers: [
    { name: '富氦对流核', color: '#fffaf2', fraction: 0.5 },
    { name: 'CNO 燃烧区', color: '#7a6cf0', fraction: 0.25 },
    { name: '星风剥离包层', color: '#beb8ff', fraction: 0.25 },
  ] },
  { type: 'O3V', name: '极端大质量恒星', mass: 64, radius: refRadius(404), color: '#e0d6ff', temp: 45000, layers: [
    { name: '巨型对流核', color: '#ffffff', fraction: 0.6 },
    { name: 'CNO 燃烧区', color: '#8f84ff', fraction: 0.22 },
    { name: '强星风包层', color: '#dcd6ff', fraction: 0.18 },
  ] },
];
export const O_TYPE = STAR_TYPES.length - 1;
export function oSubclass(mass) {
  return mass >= O_SUBCLASSES[2].mass - 1e-7 ? 2 : mass >= O_SUBCLASSES[1].mass - 1e-7 ? 1 : 0;
}
/** Spectral entry (type label, name, colour, layers) for a star body. */
export function spectralOf(body) {
  return body.type === O_TYPE ? O_SUBCLASSES[oSubclass(body.mass)] : STAR_TYPES[body.type];
}
/** Same-class stars merge; O stars only within a subclass, and O3V never. */
export function canFuse(a, b) {
  if (a.kind !== 'star' || b.kind !== 'star' || a.type !== b.type) return false;
  if (a.type !== O_TYPE) return true;
  const sub = oSubclass(a.mass);
  return sub === oSubclass(b.mass) && sub < O_SUBCLASSES.length - 1;
}

/* ---------- evolving interior ----------
 * Composition follows the star's own clock from birth to death, so the cutaway
 * doubles as a lifetime gauge. Stage lengths are deliberately NOT the real
 * ratios (real H burning is ~90% of a life and Si burning lasts a day): every
 * stage gets a readable share of the remaining life instead.
 * • fully convective M dwarfs (< 0.35 M☉) stay mixed; helium builds evenly;
 * • 0.35–1.5 M☉: pp-chain core leaves a growing He ash core under a convective
 *   envelope; near the end an H-burning shell, then He ignition makes C/O;
 * • 1.5–8 M☉: a CNO convective core that recedes, leaving a μ-gradient zone;
 *   late He core and C/O core inside an H-burning shell;
 * • ≥ 8 M☉: a receding CNO core for the first 35% of life, then the onion
 *   forms inward over the rest: He → C/O → O/Ne → Si → Fe.
 * Every boundary is a continuous function of age, so layers grow smoothly.
 * fraction is the share of disc area, matching how the cutaway is drawn. */
const ELEMENT_COLORS = { burn: '#fff6dc', he: '#f0e6b0', co: '#f1ba73', one: '#8cc5e9', si: '#d2b6e9', fe: '#b9c2d6' };
function mixHex(a, b, t) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16), k = Math.max(0, Math.min(1, t));
  const ch = shift => Math.round(((p >> shift) & 255) + ((((q >> shift) & 255) - ((p >> shift) & 255)) * k));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}
function ramp(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function stellarPhase(body) {
  const massive = body.mass >= PHYSICS.coreCollapseMass;
  const life = massive ? body.collapseAt : PHYSICS.whiteDwarfAge;
  const progress = Math.max(0, Math.min(1, body.age / Math.max(1e-6, life)));
  // Share of life spent on core hydrogen burning; later stages split the rest.
  const hydrogen = massive ? 0.35 : body.mass < 0.35 ? 0.5 : body.mass < 1.5 ? 0.6 : 0.55;
  return {
    massive, progress, left: Math.max(0, life - body.age),
    mainSequence: Math.min(1, progress / hydrogen),
    late: Math.max(0, (progress - hydrogen) / (1 - hydrogen)),
  };
}
export function stellarLayers(body) {
  if (body.kind !== 'star') return [];
  const m = body.mass, spec = spectralOf(body), base = spec.layers, E = ELEMENT_COLORS;
  const envelope = base[base.length - 1].color, radiative = base[Math.min(1, base.length - 1)].color;
  const { mainSequence: ms, late } = stellarPhase(body);
  const zones = []; // [element label, name, colour, cumulative area from the centre]
  if (m < 0.35) {
    zones.push(['He', '惰性 He 核', E.he, 0.45 * ramp(0, 1, late)]);
    zones.push(['H+He', '全对流 H/He', mixHex(envelope, E.he, 0.35 * ms), 1]);
  } else if (m < 1.5) {
    const he = 0.04 + 0.14 * ms + 0.16 * late, burn = he + 0.1 * (1 - 0.5 * late);
    const depth = m < 0.75 ? 0.45 : m < 1.2 ? 0.32 : 0.16;
    zones.push(['C/O', 'C/O 核', E.co, 0.16 * ramp(0.55, 1, late)]);
    zones.push(['He', late > 0.55 ? 'He 燃烧区' : 'He 灰烬核', E.he, he]);
    zones.push(['H→He', late > 0 ? 'H 燃烧壳' : 'H 燃烧核 · pp 链', E.burn, burn]);
    zones.push(['H', 'H/He 辐射层', radiative, Math.max(burn + 0.05, 1 - depth - 0.25 * late)]);
    zones.push(['H', 'H 对流包层', envelope, 1]);
  } else if (m < PHYSICS.coreCollapseMass) {
    const start = 0.32, core = start - 0.1 * ms, he = core + 0.1 * ramp(0, 0.4, late);
    zones.push(['C/O', 'C/O 核', E.co, 0.22 * ramp(0.3, 1, late)]);
    zones.push(late > 0 ? ['He', 'He 核', E.he, he] : ['H→He', 'CNO 对流核', mixHex(E.burn, E.he, ms), core]);
    if (late > 0) zones.push(['H→He', 'H 燃烧壳', E.burn, he + 0.06 * ramp(0, 0.2, late)]);
    zones.push(['He/H', 'μ 梯度区', mixHex(radiative, E.he, 0.4), start]);
    zones.push(['H', m < 3 ? 'H/He 辐射层' : 'H 辐射包层', radiative, m < 3 ? 0.86 : 1]);
    if (m < 3) zones.push(['H', '浅对流包层', envelope, 1]);
  } else {
    const start = m >= 16 ? 0.5 + 0.04 * oSubclass(m) : 0.42, core = start - 0.1 * ms;
    if (late <= 0) {
      zones.push(['H→He', 'CNO 对流核', mixHex(E.burn, E.he, ms), core]);
    } else {
      const he = core + (0.69 - core) * ramp(0, 0.35, late);
      const co = Math.min(he, 0.53 * ramp(0.05, 0.5, late)), one = Math.min(co, 0.39 * ramp(0.4, 0.75, late));
      const si = Math.min(one, 0.24 * ramp(0.6, 0.9, late)), fe = Math.min(si, 0.12 * ramp(0.8, 1, late));
      zones.push(['Fe', '惰性 Fe 核', E.fe, fe]);
      zones.push(['Si', 'Si/S 壳 · Si 燃烧', E.si, si]);
      zones.push(['O/Ne', 'O/Ne/Mg 壳', E.one, one]);
      zones.push(['C/O', 'C/O 壳', E.co, co]);
      zones.push(['He', late < 0.3 ? 'He 燃烧核' : 'He 壳', E.he, he]);
      zones.push(['H→He', 'H 燃烧壳', E.burn, Math.min(0.97, he + 0.04)]);
    }
    zones.push(['He/H', 'μ 梯度区', mixHex(radiative, E.he, 0.4), start]);
    zones.push(['H', 'H 辐射包层', envelope, 1]);
  }
  const layers = [];
  let inner = 0;
  for (const [el, name, color, outer] of zones) {
    // Slivers are folded into the next shell so the interior always sums to 1.
    const edge = Math.max(inner, Math.min(1, outer));
    if (edge - inner > 0.004 || edge >= 1) { layers.push({ el, name, color, fraction: edge - inner }); inner = edge; }
  }
  return layers;
}

export const PHYSICS = Object.freeze({
  coreCollapseMass: 8,
  blackHoleProgenitorMass: 25,
  neutronStarLimit: 2.3,
  chandrasekharMass: 1.4,
  whiteDwarfAge: 300,
  winningMass: 200,
  supernovaTimeScale: 5,
  blackHoleAccretionScale: 1 / 200,
  compactMergerDuration: 5,
  supernovaPush: 6100,
  xrayBurstPush: 640,
  gravityConstant: 200000,
  gravityAccelerationLimit: 1400,
});

/** Plummer-softened Newtonian field, shared by bodies and material tracers. */
export function gravityAt(dx, dy, mass, softening = 24) {
  const r2 = dx * dx + dy * dy + softening * softening;
  const factor = PHYSICS.gravityConstant * mass / (r2 * Math.sqrt(r2));
  const ax = dx * factor, ay = dy * factor;
  const limit = Math.min(1, PHYSICS.gravityAccelerationLimit / (Math.hypot(ax, ay) || 1));
  return { x: ax * limit, y: ay * limit };
}

export const calculateTimeBonus = seconds => Math.round(6000 / (1 + Math.max(0, seconds) / 180));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REMNANT_COLORS = { bh: '#ffcf8a', ns: '#8fe0ff', wd: '#e6eeff' };

// Compact binaries that coalesce: BH+BH, NS+NS, BH+NS and a white dwarf swallowed by a BH.
function canInspiral(a, b) {
  const pair = [a.kind, b.kind].sort().join('+');
  return pair === 'bh+bh' || pair === 'ns+ns' || pair === 'bh+wd' || pair === 'bh+ns';
}

const SIM_MODES = ['classic', 'endless', 'sandbox'];
const WIN_SNAPSHOT_KEYS = ['bodies', 'mergers', 'time', 'score', 'nextType', 'stats', 'combo', 'danger', 'dangerTime', '_rng', '_id', '_lastDrop', '_lastMerge', '_dropCount', 'wallLeft', 'wallRight', 'floor'];

function typeForMass(mass) {
  for (let i = STAR_TYPES.length - 1; i >= 0; i--) {
    if (mass >= STAR_TYPES[i].mass - 1e-7) return i;
  }
  return 0;
}

function starRadius(mass) {
  if (mass < STAR_TYPES[0].mass) return Math.max(3, STAR_TYPES[0].radius * Math.sqrt(mass / STAR_TYPES[0].mass));
  // Rungs M…B then O9V/O6V/O3V; stripped stars shrink geometrically between them.
  const rungs = [...STAR_TYPES.slice(0, O_TYPE), ...O_SUBCLASSES];
  let i = 0;
  while (i < rungs.length - 1 && mass >= rungs[i + 1].mass - 1e-7) i++;
  if (i === rungs.length - 1) return rungs[i].radius;
  const a = rungs[i], b = rungs[i + 1];
  return a.radius * Math.pow(b.radius / a.radius, Math.log2(mass / a.mass));
}

function remnantRadius(kind, mass) {
  if (kind === 'bh') return Math.min(61, 15 + Math.sqrt(mass) * 2.5);
  if (kind === 'ns') return 15.5;
  return Math.max(12, 22 - mass * 4);
}

function lifetime(mass) {
  if (mass >= 25) return 7 * PHYSICS.supernovaTimeScale;
  if (mass >= 16) return 18 * PHYSICS.supernovaTimeScale;
  if (mass >= 8) return 27 * PHYSICS.supernovaTimeScale;
  return PHYSICS.whiteDwarfAge;
}

function inertialMass(body) {
  // Softened inertia prevents a tiny object tunnelling after a massive impact.
  return body.kind === 'star' ? Math.pow(Math.max(0.1, body.mass), 0.55) : 2 + Math.sqrt(body.mass);
}

export class Simulation {
  constructor({ seed = 193107, onEvent = () => {} } = {}) {
    this.seed = Number(seed) >>> 0;
    this.onEvent = onEvent;
    this.width = 700;
    this.height = 820;
    this.ceiling = 12;
    this.dangerLine = 100;
    this.winningMass = PHYSICS.winningMass;
    this.restart();
  }

  _random() {
    let value = this._rng += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }

  _reset() {
    // Chamber bounds (fixed during play).
    this.wallLeft = 20;
    this.wallRight = 680;
    this.floor = 798;
    this._rng = this.seed;
    this._id = 0;
    this.bodies = [];
    this.mergers = [];
    this.time = 0;
    this.score = 0;
    this.nextType = 0;
    this._lastDrop = -1;
    this._lastMerge = -10;
    this._dropCount = 0;
    this.combo = 0;
    this.danger = 0;
    this.dangerTime = 0;
    this.winnerId = null;
    this.winTime = null;
    this.finaleTime = 0;
    this._finaleSpawn = 0;
    this.stats = { merges: 0, supernovae: 0, accreted: 0, ejected: 0, timeBonus: 0, bestMass: 0, starsAbsorbed: 0 };
  }

  restart() {
    this._reset();
    this.mode = 'classic';
    this.state = 'ready';
    // A static, deterministic attract screen. start() resets this preview.
    let x = this.wallLeft + 4;
    const row = [0, 1, 2, 0, 3, 1, 2].map(type => {
      const r = STAR_TYPES[type].radius;
      x += r + 3;
      const body = this.addBody('star', type, x, this.floor - r);
      x += r;
      return body;
    });
    // A few smaller stars resting on top of the row.
    for (const [type, under] of [[0, 4], [1, 2], [0, 6]]) {
      const base = row[under], r = STAR_TYPES[type].radius;
      this.addBody('star', type, base.x, base.y - base.radius - r);
    }
    const hole = this.addBody('bh', 6, 0, 0, 18);
    hole.x = this.wallRight - hole.radius - 8;
    hole.y = this.floor - hole.radius;
    this.stats.bestMass = 0;
    return this;
  }

  /** classic: win at the goal mass. endless: no win, black holes grow without
   * limit. sandbox: place any body, no win and no loss. */
  start(mode = 'classic') {
    if (this.state === 'playing' || this.state === 'paused') return this;
    this._reset();
    this.mode = SIM_MODES.includes(mode) ? mode : 'classic';
    this.state = 'playing';
    if (this.mode !== 'sandbox') for (const [type, x] of [[0, 178], [1, 296], [0, 420], [1, 538]]) this.addBody('star', type, x, this.floor - STAR_TYPES[type].radius);
    this.nextType = this._rollNext();
    return this;
  }

  /** After the victory ending, resume the exact board as it was when the goal
   * was reached, in endless or sandbox mode. */
  continueAfterWin(mode = 'endless') {
    if (this.state !== 'won' || !this._winSnapshot) return false;
    Object.assign(this, structuredClone(this._winSnapshot));
    this.mode = mode === 'sandbox' ? 'sandbox' : 'endless';
    this.state = 'playing';
    this.winnerId = null;
    this.finaleTime = 0;
    for (const body of this.bodies) body.isGalaxySeed = false;
    return true;
  }

  /** Sandbox: describe and place any body. spec = { kind, type?, mass? }. */
  specFor(spec) {
    const kind = spec.kind ?? 'star';
    const mass = spec.mass ?? (kind === 'star' ? (spec.type === O_TYPE ? O_SUBCLASSES[spec.sub ?? 0].mass : STAR_TYPES[spec.type ?? 0].mass) : kind === 'bh' ? 30 : kind === 'ns' ? 1.4 : 0.8);
    const type = kind === 'star' ? typeForMass(mass) : O_TYPE;
    return { kind, type, mass, radius: kind === 'star' ? starRadius(mass) : remnantRadius(kind, mass) };
  }

  place(spec, x) {
    if (this.state !== 'playing' || this.mode !== 'sandbox' || this.time - this._lastDrop < 0.22 || !Number.isFinite(x)) return null;
    const { kind, type, mass, radius } = this.specFor(spec);
    const body = this.addBody(kind, type, clamp(x, this.wallLeft + radius + 1, this.wallRight - radius - 1), Math.max(62, this.ceiling + radius + 2), mass);
    body.vy = 42;
    body.dropGrace = 2;
    this._lastDrop = this.time;
    return body;
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    return this.state;
  }

  get canDrop() {
    return this.state === 'playing' && this.time - this._lastDrop >= 0.34;
  }

  // As in the reference: the next star is drawn uniformly from the six smallest classes (M–B).
  _rollNext() {
    return Math.floor(this._random() * 6);
  }

  dropHeight(type = this.nextType) {
    return Math.max(62, this.ceiling + STAR_TYPES[type].radius + 2);
  }

  drop(x) {
    if (!this.canDrop || !Number.isFinite(x)) return false;
    const type = this.nextType;
    const radius = STAR_TYPES[type].radius;
    const body = this.addBody('star', type, clamp(x, this.wallLeft + radius + 1, this.wallRight - radius - 1), this.dropHeight(type));
    body.vy = 42;
    body.dropGrace = 2;
    this._lastDrop = this.time;
    this._dropCount++;
    this.nextType = this._rollNext();
    this._emit('drop', body, { text: `${STAR_TYPES[type].type} 型恒星 · ${body.mass} M☉` });
    return true;
  }

  addBody(kind = 'star', type = 0, x = 350, y = 100, mass) {
    if (!['star', 'bh', 'ns', 'wd'].includes(kind)) throw new TypeError(`Unknown body kind: ${kind}`);
    type = clamp(Math.floor(type || 0), 0, 6);
    mass = mass ?? (kind === 'star' ? STAR_TYPES[type].mass : kind === 'bh' ? 6 : kind === 'ns' ? 1.55 : 0.65);
    mass = Math.max(0.005, Number(mass));
    const body = {
      id: ++this._id,
      kind, type, mass, initialMass: mass,
      radius: kind === 'star' ? starRadius(mass) : remnantRadius(kind, mass),
      x, y, vx: 0, vy: 0, age: 0, seed: this._random(),
      accretingId: null, lockedBy: null, burstTimer: 0, mergingWith: null, mergerProgress: 0,
      mergeGrace: 0.16, dropGrace: 0, dangerTime: 0,
      collapseAt: lifetime(mass),
      evolution: kind === 'star' ? 'main-sequence' : kind,
      rotation: this._random() * Math.PI * 2,
      angularVelocity: 0,
      gravityRadius: kind === 'bh' ? 210 + Math.sqrt(mass) * 19 : kind === 'ns' ? 190 : kind === 'wd' ? 140 : 0,
      accretionRate: 0,
    };
    this.bodies.push(body);
    this.stats.bestMass = Math.max(this.stats.bestMass, mass);
    return body;
  }

  _emit(kind, body, extra = {}) {
    this.onEvent({
      kind, x: body?.x ?? 350, y: body?.y ?? 410,
      color: body?.kind === 'star' ? spectralOf(body).color : REMNANT_COLORS[body?.kind] ?? '#ffffff',
      mass: body?.mass ?? 0, power: 1, bodyId: body?.id ?? null,
      time: this.time, ...extra,
    });
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    if (this.state === 'won') {
      this._updateFinale(dt);
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;
    for (const body of this.bodies) {
      body.age += dt;
      body.mergeGrace = Math.max(0, body.mergeGrace - dt);
      body.dropGrace = Math.max(0, body.dropGrace - dt);
      body.rotation += body.angularVelocity * dt;
      body.angularVelocity *= Math.exp(-dt*.025);
    }
    this._applyGravity(dt);
    for (const body of this.bodies) {
      body.vy += 430 * dt;
      body.vx *= Math.pow(0.997, dt * 60);
      body.vy *= Math.pow(0.999, dt * 60);
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > 1150) {
        body.vx *= 1150 / speed;
        body.vy *= 1150 / speed;
      }
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }
    this._mergeContacts(dt);
    this._updateMergers(dt);
    for (let i = 0; i < 5; i++) {
      this._solveContacts();
      this._solveAttachments();
      this._solveBounds();
    }
    this._updateEvolution();
    this._updateAccretion(dt);
    this._checkVictory();
    if (this.state === 'playing' && this.mode !== 'sandbox') this._checkDanger(dt);
  }

  _applyGravity() {
    // No extra attraction between stars and compact objects: everything moves
    // only under the chamber's uniform gravity, contacts, blasts and bursts.
  }

  /** While a compact object feeds, its donor stays in contact with it: a
   * mass-weighted distance constraint holds the pair touching (pulling a
   * captured star in gently) so they move as one. */
  _solveAttachments() {
    for (const source of this.bodies) {
      if (source.kind === 'star' || !source.accretingId || source.mergingWith) continue;
      const donor = this.bodies.find(body => body.id === source.accretingId);
      if (!donor || donor.lockedBy !== source.id) continue;
      let dx = donor.x - source.x, dy = donor.y - source.y, d = Math.hypot(dx, dy);
      if (d < 0.001) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d, ny = dy / d, ia = 1 / inertialMass(source), ib = 1 / inertialMass(donor), sum = ia + ib;
      const error = d - (source.radius + donor.radius), correction = error * (error > 0 ? 0.35 : 0.8) / sum;
      source.x += nx * correction * ia; source.y += ny * correction * ia;
      donor.x -= nx * correction * ib; donor.y -= ny * correction * ib;
      const separating = (donor.vx - source.vx) * nx + (donor.vy - source.vy) * ny, impulse = separating / sum;
      source.vx += nx * impulse * ia; source.vy += ny * impulse * ia;
      donor.vx -= nx * impulse * ib; donor.vy -= ny * impulse * ib;
    }
  }

  _mergeContacts() {
    const available = this.bodies.slice();
    const consumed = new Set();
    const pairs = [];
    for (let i = 0; i < available.length; i++) {
      const a = available[i];
      if (consumed.has(a.id) || a.lockedBy || a.mergeGrace > 0 || a.mergingWith) continue;
      for (let j = i + 1; j < available.length; j++) {
        const b = available[j];
        if (consumed.has(b.id) || b.lockedBy || b.mergeGrace > 0 || b.mergingWith) continue;
        const stars = canFuse(a, b);
        if (!(stars || canInspiral(a, b)) || distance(a, b) > a.radius + b.radius + 0.5) continue;
        consumed.add(a.id);
        consumed.add(b.id);
        if (stars) pairs.push([a, b]);
        else this._beginInspiral(a, b);
        break;
      }
    }
    for (const [a, b] of pairs) this._merge(a, b);
  }

  /** Compact binaries spiral in for a fixed time before coalescing: separation
   * follows the gravitational-wave law a ∝ (t_c − t)^¼ and the orbital rate
   * Kepler's ω ∝ a^−3/2. The path is scripted: neighbours and walls never bend
   * it. Instead the centre of mass glides (in 0.25 s) to a spot where the widest
   * orbit already fits the chamber, and stays there until coalescence. */
  _beginInspiral(a, b) {
    for (const body of [a, b]) {
      this._releaseDonor(body);
      body.mergingWith = body === a ? b.id : a.id;
      body.mergerProgress = 0;
    }
    const mass = a.mass + b.mass, separation = Math.max(1, distance(a, b));
    const cx = (a.x * a.mass + b.x * b.mass) / mass, cy = (a.y * a.mass + b.y * b.mass) / mass;
    const reach = Math.max(separation * b.mass / mass + a.radius, separation * a.mass / mass + b.radius);
    const merger = {
      aId: a.id, bId: b.id, age: 0, duration: PHYSICS.compactMergerDuration,
      separation, phase: Math.atan2(b.y - a.y, b.x - a.x),
      spin: ((a.x - b.x) * (a.vy - b.vy) - (a.y - b.y) * (a.vx - b.vx)) < 0 ? -1 : 1,
      from: [cx, cy],
      to: [clamp(cx, this.wallLeft + reach, this.wallRight - reach), clamp(cy, this.ceiling + reach, this.floor - reach)],
    };
    for (const body of [a, b]) { body.vx = 0; body.vy = 0; }
    this.mergers.push(merger);
    const kinds = [a.kind, b.kind].sort().join('+');
    this._emit('inspiral', { x: (a.x * a.mass + b.x * b.mass) / mass, y: (a.y * a.mass + b.y * b.mass) / mass, kind: 'bh', id: a.id, mass }, {
      partnerId: b.id, duration: merger.duration, variant: kinds,
      text: kinds === 'bh+bh' ? '黑洞双星旋近 · 5 秒后并合' : kinds === 'ns+ns' ? '中子星双星旋近 · 5 秒后并合' : kinds === 'bh+ns' ? '黑洞–中子星旋近 · 5 秒后并合' : '白矮星落入黑洞 · 潮汐撕裂',
    });
    return merger;
  }

  _updateMergers(dt) {
    for (const merger of this.mergers.slice()) {
      const a = this.bodies.find(body => body.id === merger.aId), b = this.bodies.find(body => body.id === merger.bId);
      if (!a || !b) {
        for (const body of [a, b]) if (body) { body.mergingWith = null; body.mergerProgress = 0; }
        this.mergers.splice(this.mergers.indexOf(merger), 1);
        continue;
      }
      merger.age += dt;
      const progress = Math.min(1, merger.age / merger.duration), mass = a.mass + b.mass;
      const glide = 1 - Math.pow(1 - Math.min(1, merger.age / 0.25), 3);
      const cx = merger.from[0] + (merger.to[0] - merger.from[0]) * glide, cy = merger.from[1] + (merger.to[1] - merger.from[1]) * glide;
      const separation = merger.separation * Math.pow(1 - progress, 0.25);
      const omega = Math.min(32, 2.2 * Math.pow(merger.separation / Math.max(separation, merger.separation * 0.05), 1.5));
      merger.phase += omega * dt * merger.spin;
      merger.omega = omega;
      merger.current = separation;
      const ux = Math.cos(merger.phase), uy = Math.sin(merger.phase), ra = separation * b.mass / mass, rb = separation * a.mass / mass;
      a.x = cx - ux * ra; a.y = cy - uy * ra;
      b.x = cx + ux * rb; b.y = cy + uy * rb;
      for (const body of [a, b]) {
        body.vx = 0; body.vy = 0;
        body.mergerProgress = progress;
        body.dangerTime = 0;
      }
      if (progress >= 1) {
        this.mergers.splice(this.mergers.indexOf(merger), 1);
        a.mergingWith = b.mergingWith = null;
        this._merge(a, b);
      }
    }
  }

  _releaseDonor(body) {
    const donor = this.bodies.find(candidate => candidate.id === body.accretingId);
    if (donor?.lockedBy === body.id) donor.lockedBy = null;
    body.accretingId = null;
    body.accretionRate = 0;
  }

  _merge(a, b) {
    const mass = a.mass + b.mass;
    const x = (a.x * a.mass + b.x * b.mass) / mass;
    const y = (a.y * a.mass + b.y * b.mass) / mass;
    const vx = (a.vx * a.mass + b.vx * b.mass) / mass;
    const vy = (a.vy * a.mass + b.vy * b.mass) / mass;
    const kind = a.kind === 'star' ? 'star' : 'bh';
    const type = kind === 'star' ? Math.min(a.type + 1, O_TYPE) : O_TYPE;
    const from = kind === 'star' ? spectralOf(a).type : '';
    this._removeBody(a.id);
    this._removeBody(b.id);
    const merged = this.addBody(kind, type, x, y, mass);
    merged.vx = vx;
    merged.rotation = a.rotation;
    merged.vy = vy - (kind === 'star' ? 27 : 0);
    merged.mergeGrace = 0.2;
    merged.dropGrace = Math.max(a.dropGrace, b.dropGrace);
    const inertia=body=>.5*inertialMass(body)*body.radius**2;
    const angularMomentum=inertia(a)*a.angularVelocity+inertia(b)*b.angularVelocity
      +inertialMass(a)*((a.x-x)*(a.vy-vy)-(a.y-y)*(a.vx-vx))
      +inertialMass(b)*((b.x-x)*(b.vy-vy)-(b.y-y)*(b.vx-vx));
    merged.angularVelocity=clamp(angularMomentum/inertia(merged),-3.5,3.5);
    this.combo = this.time - this._lastMerge < 1.4 ? this.combo + 1 : 1;
    this._lastMerge = this.time;
    this.stats.merges++;
    const points = Math.round(mass * (kind === 'star' ? 40 : 80));
    this.score += points;
    if (kind === 'star') {
      this._emit('merge', merged, {
        points, combo: this.combo, fromType: a.type,
        text: `${from} + ${from} → ${spectralOf(merged).type}  +${points}`, toClass: spectralOf(merged).type,
      });
    } else {
      const pair = [a.kind, b.kind].sort().join('+'), neutron = pair === 'ns+ns', dwarf = pair === 'bh+wd', mixed = pair === 'bh+ns';
      // A neutron star is torn apart outside the horizon only by a light black
      // hole (≲ 10 M☉ without spin); a heavy one swallows it whole, with no kilonova.
      const disrupted = mixed && (a.kind === 'bh' ? a.mass : b.mass) < 10;
      this._emit('wave', merged, {
        points, power: neutron ? 0.45 : dwarf ? 0.35 : mixed ? 0.75 : 1.1, disrupted,
        variant: neutron ? 'neutron-merger' : dwarf ? 'white-dwarf-disruption' : mixed ? (disrupted ? 'neutron-star-disruption' : 'neutron-star-plunge') : 'black-hole-merger',
        source: neutron ? 'ns' : dwarf ? 'wd' : mixed ? 'bhns' : 'bh',
        text: neutron ? '中子星并合 · 黑洞诞生' : dwarf ? `白矮星被吞噬 · ${mass.toFixed(1)} M☉` : mixed ? (disrupted ? '中子星被潮汐撕裂 · 千新星' : '中子星整体落入黑洞') : `黑洞并合 · ${mass.toFixed(1)} M☉`,
      });
      this._emit('merge', merged, { points, power: 0.2, silent: true, fromKind: a.kind });
    }
    return merged;
  }

  _solveContacts() {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (a.mergingWith === b.id) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const sumRadius = a.radius + b.radius;
        const square = dx * dx + dy * dy;
        if (square >= sumRadius * sumRadius) continue;
        let d = Math.sqrt(square);
        if (d < 0.001) {
          dx = ((a.id + b.id) % 2 ? 1 : -1) * 0.001;
          dy = 0.001;
          d = Math.hypot(dx, dy);
        }
        const nx = dx / d;
        const ny = dy / d;
        // A spiralling binary is on a scripted path: neighbours yield to it.
        const ia = a.mergingWith ? 0 : 1 / inertialMass(a);
        const ib = b.mergingWith ? 0 : 1 / inertialMass(b);
        const inverseSum = ia + ib;
        if (inverseSum === 0) continue;
        const correction = Math.max(0, sumRadius - d - 0.08) * 0.8 / inverseSum;
        a.x -= nx * correction * ia;
        a.y -= ny * correction * ia;
        b.x += nx * correction * ib;
        b.y += ny * correction * ib;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const normalSpeed = rvx * nx + rvy * ny;
        if (normalSpeed >= 0) continue;
        const restitution = normalSpeed < -60 ? 0.11 : 0;
        const impulse = -(1 + restitution) * normalSpeed / inverseSum;
        a.vx -= impulse * nx * ia;
        a.vy -= impulse * ny * ia;
        b.vx += impulse * nx * ib;
        b.vy += impulse * ny * ib;
        const invIa=2*ia/(a.radius*a.radius),invIb=2*ib/(b.radius*b.radius);
        const tangentSpeed = -rvx * ny + rvy * nx-a.angularVelocity*a.radius-b.angularVelocity*b.radius;
        const frictionDenominator=inverseSum+a.radius*a.radius*invIa+b.radius*b.radius*invIb;
        const friction = clamp(-tangentSpeed / frictionDenominator, -impulse * 0.24, impulse * 0.24);
        a.vx += friction * ny * ia;
        a.vy -= friction * nx * ia;
        b.vx -= friction * ny * ib;
        b.vy += friction * nx * ib;
        a.angularVelocity=clamp(a.angularVelocity-friction*a.radius*invIa,-3.5,3.5);
        b.angularVelocity=clamp(b.angularVelocity-friction*b.radius*invIb,-3.5,3.5);
      }
    }
  }

  _solveBounds() {
    // Slow contacts stay damped so stacks settle; fast hits (blasts) rebound.
    const bounce = (speed, slow) => speed > 300 ? 0.45 : slow;
    for (const body of this.bodies) {
      if (body.mergingWith) continue;
      if (body.x - body.radius < this.wallLeft) {
        body.x = this.wallLeft + body.radius;
        const friction=clamp(-(body.vy-body.angularVelocity*body.radius)/3,-Math.abs(body.vx)*.288,Math.abs(body.vx)*.288);
        body.vy+=friction;body.angularVelocity=clamp(body.angularVelocity-2*friction/body.radius,-3.5,3.5);
        body.vx = Math.abs(body.vx) * bounce(Math.abs(body.vx), 0.2);
      }
      if (body.x + body.radius > this.wallRight) {
        body.x = this.wallRight - body.radius;
        const friction=clamp(-(body.vy+body.angularVelocity*body.radius)/3,-Math.abs(body.vx)*.288,Math.abs(body.vx)*.288);
        body.vy+=friction;body.angularVelocity=clamp(body.angularVelocity+2*friction/body.radius,-3.5,3.5);
        body.vx = -Math.abs(body.vx) * bounce(Math.abs(body.vx), 0.2);
      }
      if (body.y + body.radius > this.floor) {
        body.y = this.floor - body.radius;
        if (body.vy > 0) body.vy = body.vy > 35 ? -body.vy * bounce(body.vy, 0.1) : 0;
        const slip=body.vx-body.angularVelocity*body.radius;
        const friction=-slip/3;
        body.vx+=friction*.35;
        body.angularVelocity=clamp(body.angularVelocity-2*friction/body.radius*.35,-3.5,3.5);
        body.vx *= 0.995;
      }
      if (body.y - body.radius < this.ceiling) {
        body.y = this.ceiling + body.radius;
        if (body.vy < 0) body.vy = -body.vy * bounce(-body.vy, 0.2);
      }
    }
  }

  _updateEvolution() {
    for (const body of this.bodies.slice()) {
      if (body.kind !== 'star' || !this.bodies.includes(body)) continue;
      if (body.mass >= PHYSICS.coreCollapseMass) {
        if (body.collapseAt - body.age < 5 * PHYSICS.supernovaTimeScale) {
          body.evolution = 'pre-supernova';
        }
        if (body.age >= body.collapseAt) this._coreCollapse(body);
      } else if (body.age >= PHYSICS.whiteDwarfAge) {
        const progenitorMass = body.mass;
        const remnantMass = Math.min(1.24, Math.max(0.16, progenitorMass * 0.109 + 0.394));
        // The smallest hypothetical remnants never gain mass during evolution.
        this._convert(body, 'wd', Math.min(progenitorMass, remnantMass));
        this._emit('evolve', body, {
          fromKind: 'star', toKind: 'wd', progenitorMass, variant: 'planetary-nebula',
          text: '包层散逸 · 白矮星形成', power: 0.55,
        });
      }
    }
  }

  _convert(body, kind, mass) {
    if (body.lockedBy) {
      const owner = this.bodies.find(candidate => candidate.id === body.lockedBy);
      if (owner) owner.accretingId = null;
    }
    body.kind = kind;
    body.mass = mass;
    body.initialMass = mass;
    body.radius = remnantRadius(kind, mass);
    body.age = 0;
    body.accretingId = null;
    body.lockedBy = null;
    body.burstTimer = 0;
    body.mergeGrace = 0.32;
    body.evolution = kind;
    delete body.layers;
    body.gravityRadius = kind === 'bh' ? 210 + Math.sqrt(mass) * 19 : kind === 'ns' ? 190 : 140;
  }

  _coreCollapse(body) {
    const progenitorMass = body.mass;
    const oldRadius = body.radius;
    // The onion at the moment of collapse: the renderer expands it as ejecta shells.
    const layers = stellarLayers(body).map(({ el, color, fraction }) => ({ el, color, fraction }));
    const blackHole = progenitorMass >= PHYSICS.blackHoleProgenitorMass;
    const remnantMass = blackHole ? progenitorMass * 0.72 : clamp(1.35 + (progenitorMass - 8) * 0.035, 1.35, 2.1);
    this._convert(body, blackHole ? 'bh' : 'ns', remnantMass);
    this._blast(body.x, body.y, body.id, {
      power: 1 + Math.min(progenitorMass, 40) / 60,
      radius: 280 + Math.min(100, progenitorMass * 2),
      variant: 'core-collapse', progenitorMass, ejectaRadius: oldRadius, layers,
      text: blackHole ? '核心坍缩超新星 · 黑洞诞生' : '核心坍缩超新星 · 中子星诞生',
    });
    this._emit('evolve', body, { fromKind: 'star', toKind: body.kind, progenitorMass, power: 0.4 });
  }

  _blast(x, y, excludedId, options = {}) {
    const power = options.power ?? 1;
    const radius = options.radius ?? 305;
    // Blasts push everything in range but destroy nothing.
    const destroyed = 0, ejecta = [];
    // The push is applied at once to everything in range; the expanding ring
    // drawn by the renderer is only a visual. Core-collapse and Ia share it.
    for (const body of this.bodies) {
      if (body.id === excludedId || body.mergingWith) continue;
      const dx = body.x - x, dy = body.y - y, d = Math.max(1, Math.hypot(dx, dy));
      if (d >= radius) continue;
      const impulse = PHYSICS.supernovaPush * power * Math.pow(1 - d / radius, .9) / Math.pow(inertialMass(body), .18);
      body.vx += dx / d * impulse;
      body.vy += dy / d * impulse;
      body.dropGrace = Math.max(body.dropGrace, 2.5);
      body.dangerTime = 0;
    }
    this.stats.supernovae++;
    this._emit('supernova', { x, y, id: excludedId, mass: options.progenitorMass ?? 1.4, kind: 'star', type: 6 }, {
      color: options.variant === 'Ia' ? '#fff2c9' : '#bbbcff',
      ...options, radius, destroyed, power, ejecta, duration: 14,
    });
  }

  _removeBody(id) {
    const body = this.bodies.find(candidate => candidate.id === id);
    if (!body) return;
    if (body.accretingId) {
      const donor = this.bodies.find(candidate => candidate.id === body.accretingId);
      if (donor?.lockedBy === id) donor.lockedBy = null;
    }
    if (body.lockedBy) {
      const owner = this.bodies.find(candidate => candidate.id === body.lockedBy);
      if (owner?.accretingId === id) owner.accretingId = null;
    }
    this.bodies = this.bodies.filter(candidate => candidate.id !== id);
  }

  _updateAccretion(dt) {
    for (const source of this.bodies.slice()) {
      if (source.kind === 'star' || !this.bodies.includes(source)) continue;
      if (source.mergingWith) { source.accretionRate = 0; source.burstTimer = 0; continue; }
      let donor = this.bodies.find(candidate => candidate.id === source.accretingId);
      if (donor && (donor.kind !== 'star' || donor.lockedBy !== source.id)) donor = null;
      if (!donor) {
        source.accretingId = null;
        let nearest = Infinity;
        for (const candidate of this.bodies) {
          if (candidate.kind !== 'star' || candidate.lockedBy || candidate.age < 0.25) continue;
          const d = distance(source, candidate);
          const capture = source.radius + candidate.radius + (source.kind === 'bh' ? 3 : source.kind === 'ns' ? 48 : 32);
          if (d < capture && d < nearest) {
            donor = candidate;
            nearest = d;
          }
        }
        if (donor) {
          source.accretingId = donor.id;
          donor.lockedBy = source.id;
          source.burstTimer = 0;
          this._emit('accretion', source, {
            donorId: donor.id, targetId: donor.id, targetX: donor.x, targetY: donor.y,
            phase: 'start', text: source.kind === 'bh' ? '黑洞吸积 · 单目标锁定' : source.kind === 'ns' ? '中子星吸积 · X 射线暴' : '白矮星吸积 · 接近钱德拉塞卡极限',
          });
        }
      }
      if (!donor) {
        source.accretionRate = 0;
        source.burstTimer = 0;
        continue;
      }
      const rate = source.kind === 'bh' ? (0.72 + source.mass * 0.075) * PHYSICS.blackHoleAccretionScale : source.kind === 'ns' ? 0.12 : 0.14;
      const amount = Math.min(donor.mass, rate * dt);
      source.accretionRate = rate;
      const retained = source.kind === 'ns' ? Math.min(amount, Math.max(0, PHYSICS.neutronStarLimit - source.mass)) : amount;
      source.mass += retained;
      // A gameplay propeller/outflow prescription: excess fuel is expelled.
      // Neutron stars keep bursting and NEVER collapse through accretion.
      source.ejectedMass = (source.ejectedMass || 0) + amount - retained;
      this.stats.ejected += amount - retained;
      donor.mass -= amount;
      source.radius = remnantRadius(source.kind, source.mass);
      donor.radius = starRadius(Math.max(0.001, donor.mass));
      donor.type = typeForMass(donor.mass);
      donor.collapseAt = lifetime(donor.mass);
      if (donor.mass < PHYSICS.coreCollapseMass) {
        donor.evolution = 'main-sequence';
        delete donor.layers;
      }
      this.stats.accreted += retained;
      this.stats.bestMass = Math.max(this.stats.bestMass, source.mass);
      if (source.kind === 'ns') {
        source.burstTimer += dt;
        if (source.burstTimer >= 1.25) {
          source.burstTimer -= 1.25;
          this._xrayBurst(source);
        }
      }
      if (donor.mass <= 0.003) {
        // Account for the last numerical crumb without silently losing mass.
        const crumb = source.kind === 'ns' ? Math.min(donor.mass, Math.max(0, PHYSICS.neutronStarLimit - source.mass)) : donor.mass;
        source.mass += crumb;
        this.stats.accreted += crumb;
        this.stats.ejected += donor.mass - crumb;
        source.ejectedMass = (source.ejectedMass || 0) + donor.mass - crumb;
        this.stats.starsAbsorbed++;
        this._removeBody(donor.id);
        source.accretingId = null;
        this._emit('accretion', source, { phase: 'complete', donorId: donor.id, power: 0.35 });
      }
      if (source.kind === 'wd' && source.mass >= PHYSICS.chandrasekharMass) {
        const { x, y, id } = source;
        this._removeBody(id);
        // Thermonuclear burning leaves stratified ejecta: Ni/Fe inside, Si, unburnt C/O outside.
        this._blast(x, y, id, { power: 1.3, radius: 312, variant: 'Ia', progenitorMass: 1.4, ejectaRadius: 34, text: 'Ia 型超新星 · 白矮星完全解体',
          layers: [{ el: 'Ni/Fe', color: ELEMENT_COLORS.fe, fraction: 0.3 }, { el: 'Si/S', color: ELEMENT_COLORS.si, fraction: 0.35 }, { el: 'C/O', color: ELEMENT_COLORS.co, fraction: 0.35 }] });
      }
    }
  }

  _xrayBurst(source) {
    for (const other of this.bodies) {
      // The donor being fed on stays put; only the surroundings are blown back.
      if (other.id === source.id || other.id === source.accretingId || other.mergingWith) continue;
      const dx = other.x - source.x;
      const dy = other.y - source.y;
      const d = Math.hypot(dx, dy);
      if (d < 1 || d > 190) continue;
      // 10× the original 64 (and its small upward lift).
      const kick = (1 - d / 190) * PHYSICS.xrayBurstPush;
      other.vx += dx / d * kick;
      other.vy += dy / d * kick - PHYSICS.xrayBurstPush / 8;
    }
    this._emit('burst', source, { power: 0.45, radius: 190, variant: 'x-ray', ejectedMass: source.ejectedMass || 0, text: '周期性 X 射线暴' });
  }

  _checkVictory() {
    if (this.state !== 'playing' || this.mode !== 'classic') return;
    const winner = this.bodies.find(body => body.kind === 'bh' && body.mass >= this.winningMass);
    if (!winner) return;
    // Keep the board as it stands so endless or sandbox play can resume from it.
    this._winSnapshot = structuredClone(Object.fromEntries(WIN_SNAPSHOT_KEYS.map(key => [key, this[key]])));
    this.state = 'won';
    this.winnerId = winner.id;
    this.winTime = this.time;
    this.stats.timeBonus = calculateTimeBonus(this.time);
    this.score += this.stats.timeBonus;
    winner.isGalaxySeed = true;
    this.finaleTime = 0;
    for (const body of this.bodies) body.lockedBy = null;
    this._emit('win', winner, {
      power: 2, timeBonus: this.stats.timeBonus, score: this.score,
      text: '失控吸积启动 · 星系之心诞生',
    });
  }

  _checkDanger(dt) {
    let highestDanger = 0;
    for (const body of this.bodies) {
      const settled = Math.abs(body.vy) < 42 && Math.abs(body.vx) < 58;
      if (body.y - body.radius < this.dangerLine && settled && body.dropGrace <= 0 && body.age > 1.8) {
        body.dangerTime += dt;
      } else {
        body.dangerTime = Math.max(0, body.dangerTime - dt * 1.8);
      }
      highestDanger = Math.max(highestDanger, body.dangerTime);
    }
    this.dangerTime = highestDanger;
    this.danger = clamp(highestDanger / 3, 0, 1);
    if (highestDanger >= 3) {
      this.state = 'lost';
      this._emit('lose', null, { text: '星云舱已满 · 再试一次', score: this.score });
    }
  }

  _updateFinale(dt) {
    this.finaleTime += dt;
    const winner = this.bodies.find(body => body.id === this.winnerId);
    if (!winner) return;
    winner.x += (350 - winner.x) * dt * 0.8;
    winner.y += (410 - winner.y) * dt * 0.8;
    winner.vx = 0;
    winner.vy = 0;
    winner.age += dt;
    winner.radius = remnantRadius('bh', winner.mass);
    this._finaleSpawn += dt;
    if (this._finaleSpawn > 0.12 && this.bodies.length < 90 && this.finaleTime < 22) {
      this._finaleSpawn = 0;
      const angle = this._random() * Math.PI * 2;
      const radius = 440 + this._random() * 200;
      const body = this.addBody('star', Math.floor(this._random() * 5), 350 + Math.cos(angle) * radius, 410 + Math.sin(angle) * radius * 0.7);
      body.radius *= 0.55;
      body.vx = -Math.sin(angle) * 130;
      body.vy = Math.cos(angle) * 130;
      body.isFinale = true;
    }
    winner.accretingIds = [];
    for (const body of this.bodies.slice()) {
      if (body === winner) continue;
      winner.accretingIds.push(body.id);
      const dx = winner.x - body.x;
      const dy = winner.y - body.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.rotation += body.angularVelocity * dt;
      body.lockedBy = winner.id;
      if (d <= winner.radius+body.radius+3) {
        const amount = Math.min(body.mass, (0.72 + winner.mass * .075) * PHYSICS.blackHoleAccretionScale * dt);
        winner.mass += amount;
        body.mass -= amount;
        body.radius = starRadius(Math.max(.001, body.mass));
        if (body.mass < .003) { winner.mass += body.mass; this._removeBody(body.id); }
      }
    }
    winner.accretingId = winner.accretingIds[0] ?? null;
  }

  getSnapshot() {
    return {
      state: this.state, mode: this.mode, width: this.width, height: this.height,
      time: this.time, score: this.score, nextType: this.nextType,
      stats: { ...this.stats },
      danger: this.danger, dangerTime: this.dangerTime,
      winningMass: this.winningMass, winnerId: this.winnerId,
      winTime: this.winTime, finaleTime: this.finaleTime,
      mergers: this.mergers.map(merger => ({ ...merger })),
      bodies: this.bodies.map(body => ({ ...body, layers: body.layers?.map(layer => ({ ...layer })) })),
    };
  }
}



