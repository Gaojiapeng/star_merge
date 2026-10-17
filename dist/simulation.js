/**
 * STELLAR FORGE — deterministic, dependency-free simulation.
 * Stellar masses are in solar masses. Time, distance and evolutionary lifetimes
 * are deliberately compressed; spectral tiers are a mass-conserving game ladder.
 */
export const STAR_TYPES = [
  { type: 'M', name: '红矮星', mass: 0.25, radius: 19, color: '#ff7259', temp: 3200, layers: [
    { name: '全对流 H / He', color: '#b93831', fraction: 0.78 },
    { name: '氢包层', color: '#ff8a62', fraction: 0.22 },
  ] },
  { type: 'K', name: '橙矮星', mass: 0.5, radius: 26, color: '#ffaf62', temp: 4500, layers: [
    { name: '富氦核心', color: '#fff2be', fraction: 0.25 },
    { name: '氢燃烧区', color: '#eb7850', fraction: 0.3 },
    { name: '氢对流包层', color: '#ffbd70', fraction: 0.45 },
  ] },
  { type: 'G', name: '黄矮星', mass: 1, radius: 35, color: '#ffdf83', temp: 5800, layers: [
    { name: 'H → He 核心', color: '#fff7d7', fraction: 0.22 },
    { name: '辐射层 · H / He', color: '#e3a84c', fraction: 0.46 },
    { name: '对流氢包层', color: '#ffe691', fraction: 0.32 },
  ] },
  { type: 'F', name: '黄白恒星', mass: 2, radius: 45, color: '#fbefc8', temp: 7000, layers: [
    { name: 'CNO 循环核 · H → He', color: '#ffffff', fraction: 0.3 },
    { name: '辐射层 · H / He', color: '#dcb176', fraction: 0.5 },
    { name: '浅对流氢包层', color: '#f9edc6', fraction: 0.2 },
  ] },
  { type: 'A', name: '白色恒星', mass: 4, radius: 57, color: '#cde9ff', temp: 9500, layers: [
    { name: '对流核 · H → He', color: '#ffffff', fraction: 0.34 },
    { name: '辐射层 · H / He', color: '#739fc4', fraction: 0.46 },
    { name: '氢包层', color: '#d6edff', fraction: 0.2 },
  ] },
  { type: 'B', name: '蓝白恒星', mass: 8, radius: 70, color: '#82c4ff', temp: 22000, layers: [
    { name: '富氦对流核', color: '#fff4e1', fraction: 0.4 },
    { name: 'CNO 燃烧区', color: '#6697eb', fraction: 0.25 },
    { name: '辐射氢包层', color: '#a6dcff', fraction: 0.35 },
  ] },
  { type: 'O', name: '蓝色大质量恒星', mass: 16, radius: 86, color: '#afadff', temp: 40000, layers: [
    { name: '富氦对流核', color: '#fff8ef', fraction: 0.43 },
    { name: 'CNO 燃烧区', color: '#8d87ec', fraction: 0.27 },
    { name: '辐射氢包层', color: '#c5caff', fraction: 0.3 },
  ] },
];

export const PHYSICS = Object.freeze({
  coreCollapseMass: 8,
  blackHoleProgenitorMass: 25,
  neutronStarLimit: 2.3,
  chandrasekharMass: 1.4,
  whiteDwarfAge: 300,
  winningMass: 40,
});

export const calculateTimeBonus = seconds => Math.round(6000 / (1 + Math.max(0, seconds) / 180));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const REMNANT_COLORS = { bh: '#b594ff', ns: '#a5f5ff', wd: '#f2e8df' };
const SHELL_LAYERS = [
  { name: 'Fe 核', color: '#fff0dc', fraction: 0.15 },
  { name: 'Si / S 壳', color: '#d2b6e9', fraction: 0.13 },
  { name: 'O / Ne 壳', color: '#8cc5e9', fraction: 0.16 },
  { name: 'C 壳', color: '#f1ba73', fraction: 0.15 },
  { name: 'He 壳', color: '#f0e6b0', fraction: 0.16 },
  { name: 'H 包层', color: '#a1b9ff', fraction: 0.25 },
];

function typeForMass(mass) {
  for (let i = STAR_TYPES.length - 1; i >= 0; i--) {
    if (mass >= STAR_TYPES[i].mass - 1e-7) return i;
  }
  return 0;
}

function starRadius(mass) {
  if (mass < 0.25) return Math.max(3, 19 * Math.sqrt(mass / 0.25));
  const type = typeForMass(mass);
  if (type === 6) return Math.min(113, 86 * Math.pow(mass / 16, 0.2));
  const a = STAR_TYPES[type];
  const b = STAR_TYPES[type + 1];
  const t = Math.log2(mass / a.mass);
  return a.radius * Math.pow(b.radius / a.radius, t);
}

function remnantRadius(kind, mass) {
  if (kind === 'bh') return Math.min(61, 15 + Math.sqrt(mass) * 2.5);
  if (kind === 'ns') return 13 + mass * 1.4;
  return Math.max(12, 22 - mass * 4);
}

function lifetime(mass) {
  if (mass >= 25) return 7;
  if (mass >= 16) return 18;
  if (mass >= 8) return 27;
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
    this.wallLeft = 20;
    this.wallRight = 680;
    this.floor = 798;
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
    this._rng = this.seed;
    this._id = 0;
    this.bodies = [];
    this.time = 0;
    this.score = 0;
    this.isLab = false;
    this.labName = null;
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
    this.stats = { merges: 0, supernovae: 0, accreted: 0, timeBonus: 0, bestMass: 0, starsAbsorbed: 0 };
  }

  restart() {
    this._reset();
    this.state = 'ready';
    // A static, deterministic attract screen. start() resets this preview.
    [
      [0, 84, 776], [1, 133, 770], [2, 199, 760], [0, 249, 776],
      [3, 308, 752], [1, 368, 772], [2, 426, 760], [5, 544, 727],
      [0, 167, 712], [1, 275, 678], [0, 393, 706], [0, 636, 775],
    ].forEach(([type, x, y]) => this.addBody('star', type, x, y));
    this.stats.bestMass = 0;
    return this;
  }

  start() {
    if (this.state === 'playing' || this.state === 'paused') return this;
    this._reset();
    this.state = 'playing';
    this.addBody('star', 0, 178, 777);
    this.addBody('star', 1, 296, 770);
    this.addBody('star', 0, 420, 777);
    this.addBody('star', 1, 538, 770);
    this.nextType = this._rollNext();
    return this;
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    return this.state;
  }

  get canDrop() {
    return this.state === 'playing' && this.time - this._lastDrop >= 0.34;
  }

  _rollNext() {
    const progress = Math.min(1, this.stats.merges / 45);
    const roll = this._random();
    if (roll < 0.51 - progress * 0.13) return 0;
    if (roll < 0.81 - progress * 0.14) return 1;
    if (roll < 0.98 - progress * 0.1) return 2;
    return 3;
  }

  drop(x) {
    if (!this.canDrop || !Number.isFinite(x)) return false;
    const type = this.nextType;
    const radius = STAR_TYPES[type].radius;
    const body = this.addBody('star', type, clamp(x, this.wallLeft + radius + 1, this.wallRight - radius - 1), 62);
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
      accretingId: null, lockedBy: null, burstTimer: 0,
      mergeGrace: 0.16, dropGrace: 0, dangerTime: 0,
      collapseAt: lifetime(mass),
      evolution: kind === 'star' ? 'main-sequence' : kind,
      rotation: this._random() * Math.PI * 2,
      angularVelocity: (this._random() - 0.5) * 0.15,
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
      color: body?.kind === 'star' ? STAR_TYPES[body.type].color : REMNANT_COLORS[body?.kind] ?? '#ffffff',
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
    this._mergeContacts();
    for (let i = 0; i < 5; i++) {
      this._solveContacts();
      this._solveBounds();
    }
    this._updateEvolution();
    this._updateAccretion(dt);
    this._checkVictory();
    if (this.state === 'playing') this._checkDanger(dt);
  }

  _applyGravity(dt) {
    for (const source of this.bodies) {
      if (source.kind === 'star') continue;
      const range = source.gravityRadius = source.kind === 'bh' ? 210 + Math.sqrt(source.mass) * 19 : source.kind === 'ns' ? 190 : 140;
      const strength = source.kind === 'bh' ? 680 + Math.sqrt(source.mass) * 160 : source.kind === 'ns' ? 510 : 230;
      for (const other of this.bodies) {
        if (source === other) continue;
        const dx = source.x - other.x;
        const dy = source.y - other.y;
        const d = Math.hypot(dx, dy);
        if (d < 1 || d > range) continue;
        const acceleration = strength * Math.pow(1 - d / range, 1.2);
        other.vx += dx / d * acceleration * dt;
        other.vy += dy / d * acceleration * dt;
      }
    }
  }

  _mergeContacts() {
    const available = this.bodies.slice();
    const consumed = new Set();
    const pairs = [];
    for (let i = 0; i < available.length; i++) {
      const a = available[i];
      if (consumed.has(a.id) || a.lockedBy || a.mergeGrace > 0) continue;
      for (let j = i + 1; j < available.length; j++) {
        const b = available[j];
        if (consumed.has(b.id) || b.lockedBy || b.mergeGrace > 0) continue;
        const canMerge = (a.kind === 'star' && b.kind === 'star' && a.type === b.type)
          || (a.kind === 'bh' && b.kind === 'bh')
          || (a.kind === 'ns' && b.kind === 'ns');
        if (!canMerge || distance(a, b) > a.radius + b.radius + 0.5) continue;
        consumed.add(a.id);
        consumed.add(b.id);
        pairs.push([a, b]);
        break;
      }
    }
    for (const [a, b] of pairs) this._merge(a, b);
  }

  _merge(a, b) {
    const mass = a.mass + b.mass;
    const x = (a.x * a.mass + b.x * b.mass) / mass;
    const y = (a.y * a.mass + b.y * b.mass) / mass;
    const vx = (a.vx * a.mass + b.vx * b.mass) / mass;
    const vy = (a.vy * a.mass + b.vy * b.mass) / mass;
    const kind = a.kind === 'star' ? 'star' : 'bh';
    const type = kind === 'star' ? Math.min(a.type + 1, 6) : 6;
    this._removeBody(a.id);
    this._removeBody(b.id);
    const merged = this.addBody(kind, type, x, y, mass);
    merged.vx = vx;
    merged.vy = vy - (kind === 'star' ? 27 : 10);
    merged.mergeGrace = 0.2;
    merged.dropGrace = Math.max(a.dropGrace, b.dropGrace);
    this.combo = this.time - this._lastMerge < 1.4 ? this.combo + 1 : 1;
    this._lastMerge = this.time;
    this.stats.merges++;
    const points = Math.round(mass * (kind === 'star' ? 40 : 80));
    this.score += points;
    if (kind === 'star') {
      this._emit('merge', merged, {
        points, combo: this.combo, fromType: a.type,
        text: `${STAR_TYPES[a.type].type} + ${STAR_TYPES[b.type].type} → ${STAR_TYPES[type].type}  +${points}`,
      });
    } else {
      const neutron = a.kind === 'ns';
      this._emit('wave', merged, {
        points, power: neutron ? 0.45 : 1.1, variant: neutron ? 'neutron-merger' : 'black-hole-merger',
        source: neutron ? 'ns' : 'bh',
        text: neutron ? '中子星并合 · 黑洞诞生' : `黑洞并合 · ${mass.toFixed(1)} M☉`,
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
        const ia = 1 / inertialMass(a);
        const ib = 1 / inertialMass(b);
        const inverseSum = ia + ib;
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
        const tangentSpeed = -rvx * ny + rvy * nx;
        const friction = clamp(-tangentSpeed / inverseSum, -impulse * 0.2, impulse * 0.2);
        a.vx += friction * ny * ia;
        a.vy -= friction * nx * ia;
        b.vx -= friction * ny * ib;
        b.vy += friction * nx * ib;
      }
    }
  }

  _solveBounds() {
    for (const body of this.bodies) {
      if (body.x - body.radius < this.wallLeft) {
        body.x = this.wallLeft + body.radius;
        body.vx = Math.abs(body.vx) * 0.2;
      }
      if (body.x + body.radius > this.wallRight) {
        body.x = this.wallRight - body.radius;
        body.vx = -Math.abs(body.vx) * 0.2;
      }
      if (body.y + body.radius > this.floor) {
        body.y = this.floor - body.radius;
        if (body.vy > 0) body.vy = body.vy > 35 ? -body.vy * 0.1 : 0;
        body.vx *= 0.94;
      }
      // Blast ejecta may leave the chamber briefly and fall back in.
      if (body.y < -250) {
        body.y = -250;
        body.vy = Math.max(0, body.vy);
      }
    }
  }

  _updateEvolution() {
    for (const body of this.bodies.slice()) {
      if (body.kind !== 'star' || !this.bodies.includes(body)) continue;
      if (body.mass >= PHYSICS.coreCollapseMass) {
        if (body.collapseAt - body.age < 5) {
          body.evolution = 'pre-supernova';
          body.layers = SHELL_LAYERS;
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
    const blackHole = progenitorMass >= PHYSICS.blackHoleProgenitorMass;
    const remnantMass = blackHole ? progenitorMass * 0.72 : clamp(1.35 + (progenitorMass - 8) * 0.035, 1.35, 2.1);
    this._convert(body, blackHole ? 'bh' : 'ns', remnantMass);
    this._blast(body.x, body.y, body.id, {
      power: 1 + Math.min(progenitorMass, 40) / 60,
      killRadius: oldRadius + 30,
      radius: 280 + Math.min(100, progenitorMass * 2),
      variant: 'core-collapse', progenitorMass,
      text: blackHole ? '核心坍缩超新星 · 黑洞诞生' : '核心坍缩超新星 · 中子星诞生',
    });
    this._emit('evolve', body, { fromKind: 'star', toKind: body.kind, progenitorMass, power: 0.4 });
  }

  _blast(x, y, excludedId, options = {}) {
    const power = options.power ?? 1;
    const killRadius = options.killRadius ?? 64;
    const radius = options.radius ?? 305;
    let destroyed = 0;
    for (const other of this.bodies.slice()) {
      if (other.id === excludedId) continue;
      let dx = other.x - x;
      let dy = other.y - y;
      let d = Math.hypot(dx, dy);
      if (other.kind === 'star' && d < killRadius + other.radius * 0.15) {
        this._removeBody(other.id);
        destroyed++;
        continue;
      }
      if (d >= radius) continue;
      if (d < 1) {
        const angle = this._random() * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        d = 1;
      }
      const impulse = 610 * power * Math.pow(1 - d / radius, 0.9) / Math.pow(inertialMass(other), 0.18);
      other.vx += dx / d * impulse;
      other.vy += dy / d * impulse - 55 * power;
      other.dropGrace = Math.max(other.dropGrace, 2.5);
      other.dangerTime = 0;
    }
    this.stats.supernovae++;
    this._emit('supernova', { x, y, id: excludedId, mass: options.progenitorMass ?? 1.4, kind: 'star', type: 6 }, {
      color: options.variant === 'Ia' ? '#fff2c9' : '#bbbcff',
      ...options, radius, killRadius, destroyed, power,
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
      let donor = this.bodies.find(candidate => candidate.id === source.accretingId);
      if (donor && (donor.kind !== 'star' || donor.lockedBy !== source.id)) donor = null;
      if (!donor) {
        source.accretingId = null;
        let nearest = Infinity;
        for (const candidate of this.bodies) {
          if (candidate.kind !== 'star' || candidate.lockedBy || candidate.age < 0.25) continue;
          const d = distance(source, candidate);
          const capture = source.radius + candidate.radius + (source.kind === 'bh' ? 65 : source.kind === 'ns' ? 48 : 32);
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
      // A blast can strip the donor from its accretor; release the shared lock.
      if (distance(source, donor) > source.gravityRadius + donor.radius + 80) {
        donor.lockedBy = null;
        source.accretingId = null;
        source.accretionRate = 0;
        continue;
      }
      const rate = source.kind === 'bh' ? 0.72 + source.mass * 0.075 : source.kind === 'ns' ? 0.12 : 0.14;
      const amount = Math.min(donor.mass, rate * dt);
      source.accretionRate = rate;
      source.mass += amount;
      donor.mass -= amount;
      source.radius = remnantRadius(source.kind, source.mass);
      donor.radius = starRadius(Math.max(0.001, donor.mass));
      donor.type = typeForMass(donor.mass);
      donor.collapseAt = lifetime(donor.mass);
      if (donor.mass < PHYSICS.coreCollapseMass) {
        donor.evolution = 'main-sequence';
        delete donor.layers;
      }
      this.stats.accreted += amount;
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
        source.mass += donor.mass;
        this.stats.accreted += donor.mass;
        this.stats.starsAbsorbed++;
        this._removeBody(donor.id);
        source.accretingId = null;
        this._emit('accretion', source, { phase: 'complete', donorId: donor.id, power: 0.35 });
      }
      if (source.kind === 'wd' && source.mass >= PHYSICS.chandrasekharMass) {
        const { x, y, id } = source;
        this._removeBody(id);
        this._blast(x, y, id, { power: 1.3, killRadius: 69, radius: 312, variant: 'Ia', progenitorMass: 1.4, text: 'Ia 型超新星 · 白矮星完全解体' });
      } else if (source.kind === 'ns' && source.mass >= PHYSICS.neutronStarLimit) {
        const mass = source.mass;
        this._convert(source, 'bh', mass);
        // Conversion preserves mass but releases a current donor to reacquire.
        if (donor && this.bodies.includes(donor)) donor.lockedBy = null;
        this._emit('evolve', source, { fromKind: 'ns', toKind: 'bh', power: 0.55, text: '中子星越过支撑极限 · 坍缩为黑洞' });
      }
    }
  }

  _xrayBurst(source) {
    for (const other of this.bodies) {
      if (other.id === source.id) continue;
      const dx = other.x - source.x;
      const dy = other.y - source.y;
      const d = Math.hypot(dx, dy);
      if (d < 1 || d > 190) continue;
      const kick = (1 - d / 190) * 64;
      other.vx += dx / d * kick;
      other.vy += dy / d * kick - 8;
    }
    this._emit('burst', source, { power: 0.45, radius: 190, variant: 'x-ray', text: '周期性 X 射线暴' });
  }

  _checkVictory() {
    if (this.state !== 'playing') return;
    const winner = this.bodies.find(body => body.kind === 'bh' && body.mass >= this.winningMass);
    if (!winner) return;
    this.state = 'won';
    this.winnerId = winner.id;
    this.winTime = this.time;
    this.stats.timeBonus = calculateTimeBonus(this.time);
    this.score += this.stats.timeBonus;
    winner.isSupermassive = true;
    this.finaleTime = 0;
    for (const body of this.bodies) body.lockedBy = null;
    this._emit('win', winner, {
      power: 2, timeBonus: this.stats.timeBonus, score: this.score,
      text: '失控吸积启动 · 星系之心诞生', isLab: this.isLab,
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
    if (!this.isLab && highestDanger >= 3) {
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
      if (d < winner.radius * 0.9) {
        winner.mass += body.mass;
        this._removeBody(body.id);
        continue;
      }
      body.vx += (dx / d * 720 - dy / d * 85) * dt;
      body.vy += (dy / d * 720 + dx / d * 85) * dt;
      body.vx *= Math.pow(0.989, dt * 60);
      body.vy *= Math.pow(0.989, dt * 60);
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      body.rotation += dt;
      body.lockedBy = winner.id;
      if (d < 150) body.radius = Math.max(2, body.radius - dt * 9);
    }
    winner.accretingId = winner.accretingIds[0] ?? null;
  }

  loadScenario(name) {
    const valid = ['fusion', 'supernova', 'accretion', 'neutron', 'white-dwarf', 'finale'];
    if (!valid.includes(name)) throw new TypeError(`Unknown lab scenario: ${name}`);
    this._reset();
    this.state = 'playing';
    this.isLab = true;
    this.labName = name;
    const star = (type, x, y, mass) => this.addBody('star', type, x, y, mass);
    if (name === 'fusion') {
      star(0, 132, 750); star(0, 169, 750);
      star(1, 275, 739); star(1, 326, 739);
      star(2, 460, 720); star(2, 529, 720);
      star(3, 260, 560); star(3, 350, 550);
    } else if (name === 'supernova') {
      const a = star(5, 226, 660); a.age = a.collapseAt - 1.6;
      const b = star(6, 470, 648, 32); b.age = b.collapseAt - 4.2;
      star(0, 145, 709); star(1, 144, 766); star(2, 338, 760);
      star(0, 570, 748); star(1, 588, 638); star(0, 375, 520);
    } else if (name === 'accretion') {
      this.addBody('bh', 6, 350, 762, 9);
      star(4, 446, 737); star(3, 248, 750); star(1, 186, 770);
      star(2, 555, 760); star(0, 112, 776);
      // The pair accretes independently before meeting after about five seconds.
      this.addBody('bh', 6, 90, 768, 3.2);
    } else if (name === 'neutron') {
      this.addBody('ns', 6, 290, 780, 1.45);
      this.addBody('ns', 6, 470, 780, 1.45);
      star(2, 225, 761); star(3, 535, 750);
      star(1, 145, 770); star(0, 620, 777);
    } else if (name === 'white-dwarf') {
      this.addBody('wd', 2, 350, 781, 1.22);
      star(2, 414, 759);
      const future = star(2, 204, 760); future.age = 299.2;
      star(0, 276, 779); star(1, 518, 770); star(0, 598, 778);
    } else if (name === 'finale') {
      this.addBody('bh', 6, 350, 748, 38.5);
      star(4, 467, 740); star(3, 244, 750);
      star(2, 570, 760); star(1, 135, 770);
    }
    for (const body of this.bodies) body.mergeGrace = 0.25;
    this.nextType = this._rollNext();
    return this;
  }

  getSnapshot() {
    return {
      state: this.state, width: this.width, height: this.height,
      time: this.time, score: this.score, nextType: this.nextType,
      isLab: this.isLab, labName: this.labName, stats: { ...this.stats },
      danger: this.danger, dangerTime: this.dangerTime,
      winningMass: this.winningMass, winnerId: this.winnerId,
      winTime: this.winTime, finaleTime: this.finaleTime,
      bodies: this.bodies.map(body => ({ ...body, layers: body.layers?.map(layer => ({ ...layer })) })),
    };
  }
}
