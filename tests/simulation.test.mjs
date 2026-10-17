import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, STAR_TYPES, PHYSICS, gravityAt, calculateTimeBonus } from '../dist/simulation.js';

function game(seed = 417) {
  const events = [];
  const sim = new Simulation({ seed, onEvent: event => events.push(event) });
  sim.start();
  sim.bodies = [];
  events.length = 0;
  return { sim, events };
}

function body(sim, kind, type, x, y, mass) {
  const value = sim.addBody(kind, type, x, y, mass);
  value.mergeGrace = 0;
  value.age = 1;
  return value;
}

function advance(sim, seconds) {
  for (let time = 0; time < seconds - 1e-8; time += 1 / 60) {
    sim.update(Math.min(1 / 60, seconds - time));
  }
}

function eventIs(event, kind) {
  return event.kind === kind || event.type === kind;
}

test('every adjacent spectral tier merges only matching stars and preserves their mass', () => {
  for (let type = 0; type < STAR_TYPES.length - 1; type++) {
    const { sim, events } = game();
    const first = body(sim, 'star', type, 330, 500);
    const second = body(sim, 'star', type, 331, 500);
    const combinedMass = first.mass + second.mass;
    sim.update(1 / 60);
    assert.equal(sim.bodies.length, 1, `spectral tier ${type} should merge`);
    assert.equal(sim.bodies[0].type, type + 1);
    assert.equal(sim.bodies[0].mass, combinedMass);
    assert.ok(sim.score > 0, 'a merge awards points');
    assert.ok(events.some(event => event.kind === 'merge' || event.type === 'merge'));
  }
});

test('different spectral types collide without merging or awarding merge points', () => {
  const { sim } = game();
  body(sim, 'star', 0, 330, 500);
  body(sim, 'star', 1, 331, 500);
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 2);
  assert.deepEqual(sim.bodies.map(value => value.type).sort(), [0, 1]);
  assert.equal(sim.score, 0);
  const [first, second] = sim.bodies;
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > 1);
});

test('pause freezes elapsed time, stellar aging, and motion, then resumes', () => {
  const { sim } = game();
  const star = body(sim, 'star', 0, 300, 300);
  star.vx = 50;
  advance(sim, 0.3);
  sim.togglePause();
  assert.equal(sim.drop(300), false, 'paused games must reject additional drops');
  const frozen = { time: sim.time, x: star.x, y: star.y, age: star.age };
  advance(sim, 1);
  assert.deepEqual({ time: sim.time, x: star.x, y: star.y, age: star.age }, frozen);
  sim.togglePause();
  advance(sim, 0.1);
  assert.ok(sim.time > frozen.time);
  assert.ok(star.age > frozen.age);
});

test('a settled stack above the warning line loses only after the overflow grace period', () => {
  const { sim, events } = game();
  for (const x of [100, 265, 430, 595]) {
    for (let row = 0; row < 6; row++) {
      body(sim, 'star', row % 2 === 0 ? 5 : 4, x, 728 - row * 127);
    }
  }
  advance(sim, 2.9);
  assert.equal(sim.state, 'playing', 'the warning grants time to clear the stack');
  advance(sim, 3.1);
  assert.equal(sim.state, 'lost');
  assert.equal(sim.drop(330), false);
  assert.ok(events.some(event => eventIs(event, 'lose')));
});

test('the time bonus is finite, nonnegative, and rewards faster completion', () => {
  assert.ok(Number.isFinite(calculateTimeBonus(0)));
  assert.ok(calculateTimeBonus(60) > calculateTimeBonus(300));
  assert.ok(calculateTimeBonus(300) > calculateTimeBonus(1800));
  assert.ok(calculateTimeBonus(1e12) >= 0);
});

test('core collapse respects the approximate 8 and 25 solar-mass boundaries', () => {
  for (const [mass, expectedKind] of [[7.99, 'star'], [8, 'ns'], [16, 'ns'], [24.99, 'ns'], [25, 'bh'], [32, 'bh']]) {
    const { sim, events } = game();
    const star = body(sim, 'star', mass < 16 ? 5 : 6, 330, 500, mass);
    star.collapseAt = 0;
    sim.update(1 / 60);
    assert.equal(sim.bodies.length, 1);
    assert.equal(sim.bodies[0].kind, expectedKind, `${mass} solar masses`);
    if (expectedKind !== 'star') {
      assert.ok(sim.bodies[0].mass < mass, 'ejecta remove mass from the progenitor');
      assert.ok(events.some(event => eventIs(event, 'supernova')));
    }
  }
});

test('two O stars can merge into a heavier O star before becoming a black hole', () => {
  const { sim } = game();
  const first = body(sim, 'star', 6, 330, 500);
  const second = body(sim, 'star', 6, 331, 500);
  const total = first.mass + second.mass;
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].kind, 'star');
  assert.equal(sim.bodies[0].type, 6);
  assert.equal(sim.bodies[0].mass, total);
  sim.bodies[0].collapseAt = 0;
  sim.update(1 / 60);
  assert.equal(sim.bodies[0].kind, 'bh');
});

test('black-hole mergers emit gravitational waves and retain most of their mass', () => {
  const { sim, events } = game();
  body(sim, 'bh', 0, 330, 500, 5);
  body(sim, 'bh', 0, 331, 500, 6);
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].kind, 'bh');
  assert.ok(sim.bodies[0].mass > 9 && sim.bodies[0].mass <= 11);
  assert.ok(events.some(event => eventIs(event, 'wave')));
});

test('two neutron stars merge into a black hole and emit gravitational waves', () => {
  const { sim, events } = game();
  body(sim, 'ns', 0, 330, 500, 1.7);
  body(sim, 'ns', 0, 331, 500, 1.7);
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].kind, 'bh');
  assert.ok(sim.bodies[0].mass > 2.3);
  assert.ok(events.some(event => eventIs(event, 'wave')));
});

test('a low-mass main-sequence star ages into a white dwarf after five minutes', () => {
  const { sim, events } = game();
  const star = body(sim, 'star', 2, 330, 500);
  const initialMass = star.mass;
  star.age = 299.99;
  sim.update(0.03);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].kind, 'wd');
  assert.ok(sim.bodies[0].mass < initialMass);
  assert.ok(events.some(event => eventIs(event, 'evolve')));
});

test('core-collapse blasts destroy close stars and push farther stars outward', () => {
  const { sim, events } = game();
  const progenitor = body(sim, 'star', 6, 330, 500, 32);
  progenitor.collapseAt = 0;
  const close = body(sim, 'star', 0, 450, 500);
  const far = body(sim, 'star', 3, 560, 500);
  sim.update(1 / 60);
  assert.ok(!sim.bodies.some(value => value.id === close.id), 'adjacent star should be destroyed');
  assert.ok(sim.bodies.some(value => value.id === far.id), 'distant star should survive');
  assert.equal(far.vx, 0, 'a distant star is not hit before the shock front arrives');
  sim._updateShocks(2.4);
  assert.ok(far.vx > 0, 'survivor receives an outward impulse when the shock arrives');
  assert.ok(events.some(event => eventIs(event, 'supernova') && event.destroyed > 0));
});

test('a black hole drains exactly one donor at a time, shrinking it and conserving mass', () => {
  const { sim } = game();
  const hole = body(sim, 'bh', 0, 330, 500, 9);
  const left = body(sim, 'star', 4, 220, 500);
  const right = body(sim, 'star', 3, 440, 500);
  const before = [left, right].map(value => ({ id: value.id, mass: value.mass, radius: value.radius }));
  const total = sim.bodies.reduce((sum, value) => sum + value.mass, 0);
  sim.update(1 / 60);
  const changed = [left, right].filter((value, index) => value.mass < before[index].mass);
  assert.equal(changed.length, 1);
  assert.equal(hole.accretingId, changed[0].id);
  assert.equal(changed[0].lockedBy, hole.id);
  assert.ok(changed[0].radius < before.find(value => value.id === changed[0].id).radius);
  assert.ok(hole.mass > 9);
  assert.ok(Math.abs(sim.bodies.reduce((sum, value) => sum + value.mass, 0) - total) < 1e-9);
});

test('two black holes cannot claim the same donor simultaneously', () => {
  const { sim } = game();
  const first = body(sim, 'bh', 0, 280, 500, 5);
  const second = body(sim, 'bh', 0, 450, 500, 5);
  const donor = body(sim, 'star', 2, 350, 500);
  sim.update(1 / 60);
  const owners = [first, second].filter(value => value.accretingId === donor.id);
  assert.equal(owners.length, 1);
  assert.equal(donor.lockedBy, owners[0].id);
});

test('a white dwarf crossing 1.4 solar masses self-destructs in a Type Ia supernova', () => {
  const { sim, events } = game();
  const dwarf = body(sim, 'wd', 0, 330, 500, 1.399);
  body(sim, 'star', 2, 390, 500);
  const distant = body(sim, 'star', 3, 540, 500);
  sim.update(1 / 60);
  assert.ok(!sim.bodies.some(value => value.id === dwarf.id), 'the dwarf leaves no compact remnant');
  assert.ok(events.some(event => eventIs(event, 'supernova') && event.variant === 'Ia'));
  sim._updateShocks(2.4);
  assert.ok(distant.vx > 0, 'Type Ia ejecta also mix the remaining stars');
});

test('core-collapse lifetimes are exactly five times the original values', () => {
  const {sim}=game();
  for(const [mass,original] of [[8,27],[16,18],[32,7]]) {
    const star=body(sim,'star',5,100,500,mass);
    assert.equal(star.collapseAt,original*5);
  }
});

test('black-hole mass transfer is exactly one twentieth of its previous rate', () => {
  const {sim}=game();const hole=body(sim,'bh',6,330,500,9),donor=body(sim,'star',4,430,500);
  const expected=(.72+9*.075)/20,initial=donor.mass;
  sim._updateAccretion(.05);
  assert.ok(Math.abs(initial-donor.mass-expected*.05)<1e-10);
  assert.ok(Math.abs(hole.accretionRate-expected)<1e-10);
});

test('neutron-star accretion never forms a black hole; excess mass is ejected', () => {
  const {sim,events}=game();const neutron=body(sim,'ns',6,330,500,2.299),donor=body(sim,'star',4,410,500);
  const total=neutron.mass+donor.mass;
  for(let i=0;i<240;i++)sim._updateAccretion(1/60);
  assert.equal(neutron.kind,'ns');assert.equal(neutron.mass,PHYSICS.neutronStarLimit);
  assert.ok(sim.stats.ejected>0);assert.ok(events.some(event=>event.kind==='burst'));
  assert.ok(Math.abs(neutron.mass+donor.mass+sim.stats.ejected-total)<1e-9);
});

test('the win threshold is 2000 solar masses and 40 no longer wins', () => {
  const {sim}=game();const hole=body(sim,'bh',6,330,500,40);sim._checkVictory();
  assert.equal(sim.state,'playing');assert.equal(sim.winningMass,40*50);
  hole.mass=1999.99;sim._checkVictory();assert.equal(sim.state,'playing');
  hole.mass=2000;sim._checkVictory();assert.equal(sim.state,'won');
});

test('softened gravity approaches inverse-square falloff and is finite at the origin', () => {
  const near=gravityAt(200,0,1,1),far=gravityAt(400,0,1,1),center=gravityAt(0,0,1000);
  assert.ok(Math.abs(near.x/far.x-4)<.001);assert.equal(near.y,0);
  assert.deepEqual(center,{x:0,y:0});
});

test('remnant gravity applies opposite pair momentum without orbit singularities', () => {
  const {sim}=game();const hole=body(sim,'bh',6,330,500,9),star=body(sim,'star',2,450,500,1);
  sim._applyGravity(.01);
  assert.ok(star.vx<0&&hole.vx>0);assert.ok(Math.abs(hole.mass*hole.vx+star.mass*star.vx)<1e-9);
  assert.equal(star.vy,0);assert.equal(hole.vy,0);
});

test('a neutron star accretes matter and emits repeated regular X-ray bursts', () => {
  const { sim, events } = game();
  const neutron = body(sim, 'ns', 0, 330, 780, 1.4);
  const donor = body(sim, 'star', 2, 395, 760);
  advance(sim, 4);
  const bursts = events.filter(event => eventIs(event, 'burst') && event.bodyId === neutron.id);
  assert.ok(neutron.mass > 1.4);
  assert.ok(donor.mass < 1);
  assert.ok(bursts.length >= 2, 'sustained accretion produces recurring bursts');
  for (let index = 1; index < bursts.length; index++) {
    assert.ok(Math.abs(bursts[index].time - bursts[index - 1].time - 1.25) < 0.04);
  }
});

test('neutron-star merger waves are smaller than black-hole merger waves', () => {
  const wavePower = kind => {
    const { sim, events } = game();
    body(sim, kind, 0, 330, 500, kind === 'ns' ? 1.7 : 5);
    body(sim, kind, 0, 331, 500, kind === 'ns' ? 1.7 : 5);
    sim.update(1 / 60);
    return events.find(event => eventIs(event, 'wave')).power;
  };
  assert.ok(wavePower('ns') < wavePower('bh'));
});

test('victory unlocks simultaneous accretion and keeps the completion timer fixed', () => {
  const { sim } = game();
  const hole = body(sim, 'bh', 0, 330, 500, sim.winningMass);
  const first = body(sim, 'star', 2, 200, 500);
  const second = body(sim, 'star', 3, 480, 500);
  sim.update(1 / 60);
  const finishedAt = sim.time;
  sim.update(1 / 60);
  assert.equal(sim.state, 'won');
  assert.ok(hole.accretingIds.includes(first.id));
  assert.ok(hole.accretingIds.includes(second.id));
  assert.equal(first.lockedBy, hole.id);
  assert.equal(second.lockedBy, hole.id);
  assert.equal(sim.time, finishedAt);
});

test('the same seed and input produce identical drop sequences and physics', () => {
  const left = game(521).sim;
  const right = game(521).sim;
  for (const x of [150, 150, 330, 330, 500, 510, 180, 320]) {
    assert.equal(left.drop(x), right.drop(x));
    advance(left, 0.45);
    advance(right, 0.45);
  }
  assert.deepEqual(left.getSnapshot(), right.getSnapshot());
});

test('reaching the seed black-hole mass ends the game with a time bonus', () => {
  const { sim, events } = game();
  sim.time = 120;
  body(sim, 'bh', 0, 330, 500, sim.winningMass);
  sim.update(1 / 60);
  assert.equal(sim.state, 'won');
  assert.equal(sim.stats.timeBonus, calculateTimeBonus(sim.time));
  assert.ok(events.some(event => eventIs(event, 'win')));
  const time = sim.time;
  advance(sim, 1);
  assert.equal(sim.time, time, 'the completion timer must stop during the ending');
});
