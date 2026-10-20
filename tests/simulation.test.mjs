import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, STAR_TYPES, PHYSICS, gravityAt, calculateTimeBonus, spectralOf, canFuse, stellarLayers, stellarPhase } from '../dist/simulation.js';

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

test('O stars merge only within a subclass: O9V → O6V → O3V, and O3V is final', () => {
  const { sim } = game();
  body(sim, 'star', 6, 330, 500);
  body(sim, 'star', 6, 331, 500);
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 1);
  assert.equal(spectralOf(sim.bodies[0]).type, 'O6V');
  assert.equal(sim.bodies[0].mass, 32);
  const o6 = sim.bodies[0];
  o6.mergeGrace = 0;
  const twin = body(sim, 'star', 6, o6.x + 1, o6.y, 32);
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 1);
  assert.equal(spectralOf(sim.bodies[0]).type, 'O3V');
  assert.ok(!sim.bodies.some(value => value.id === twin.id));
  const o3 = sim.bodies[0];
  o3.mergeGrace = 0;
  body(sim, 'star', 6, o3.x + 1, o3.y, 64);
  advance(sim, .3);
  assert.equal(sim.bodies.length, 2, 'two O3V stars never merge');
  assert.ok(sim.bodies.every(value => spectralOf(value).type === 'O3V'));
});

test('different O subclasses do not merge, and O6V collapses to a black hole', () => {
  const { sim } = game();
  const o9 = body(sim, 'star', 6, 330, 500, 16), o6 = body(sim, 'star', 6, 331, 500, 32);
  advance(sim, .3);
  assert.equal(sim.bodies.length, 2);
  assert.ok(!canFuse(o9, o6));
  o6.collapseAt = 0;o9.collapseAt = 0;
  sim.update(1 / 60);
  assert.equal(sim.bodies.find(value => value.id === o6.id).kind, 'bh');
  assert.equal(sim.bodies.find(value => value.id === o9.id).kind, 'ns');
});

test('touching black holes spiral in for five seconds, then coalesce with a wave', () => {
  const { sim, events } = game();
  const a = body(sim, 'bh', 0, 330, 700, 5), b = body(sim, 'bh', 0, 331, 700, 6);
  sim.update(1 / 60);
  assert.ok(events.some(event => event.kind === 'inspiral' && event.duration === PHYSICS.compactMergerDuration));
  assert.equal(sim.mergers.length, 1);
  assert.equal(a.mergingWith, b.id);
  advance(sim, 2.5);
  assert.equal(sim.bodies.length, 2, 'still orbiting halfway through the inspiral');
  assert.ok(a.mergerProgress > .45 && a.mergerProgress < .6);
  const momentum = (a.vx * a.mass + b.vx * b.mass);
  assert.ok(Number.isFinite(momentum));
  for (const value of [a, b]) {
    assert.ok(value.x - value.radius >= sim.wallLeft - 1e-6 && value.x + value.radius <= sim.wallRight + 1e-6);
    assert.ok(value.y + value.radius <= sim.floor + 1e-6, 'the binary stays inside the chamber');
  }
  advance(sim, 2.6);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].kind, 'bh');
  assert.ok(Math.abs(sim.bodies[0].mass - 11) < 1e-9);
  assert.equal(sim.mergers.length, 0);
  assert.ok(events.some(event => event.kind === 'wave' && event.variant === 'black-hole-merger'));
});

test('a white dwarf touching a black hole is swallowed after the inspiral', () => {
  const { sim, events } = game();
  const hole = body(sim, 'bh', 0, 330, 700, 9), dwarf = body(sim, 'wd', 0, 330 + 0, 700, 0.9);
  dwarf.x = hole.x + hole.radius + dwarf.radius;
  dwarf.y = hole.y;
  sim.update(1 / 60);
  assert.equal(hole.mergingWith, dwarf.id);
  advance(sim, PHYSICS.compactMergerDuration + .1);
  assert.equal(sim.bodies.length, 1);
  assert.equal(sim.bodies[0].kind, 'bh');
  assert.ok(Math.abs(sim.bodies[0].mass - 9.9) < 1e-9);
  assert.ok(events.some(event => event.kind === 'wave' && event.variant === 'white-dwarf-disruption'));
});

test('a black hole stops feeding while it spirals into a partner', () => {
  const { sim } = game();
  const a = body(sim, 'bh', 0, 300, 700, 9), b = body(sim, 'bh', 0, 300, 700, 9), donor = body(sim, 'star', 2, 300, 700);
  b.x = a.x + a.radius + b.radius; donor.x = a.x - a.radius - donor.radius; donor.y = a.y;
  sim.update(1 / 60);
  assert.ok(a.mergingWith && b.mergingWith);
  const mass = donor.mass;
  advance(sim, .5);
  assert.equal(donor.lockedBy, null);
  assert.ok(Math.abs(donor.mass - mass) < 1e-9);
});

test('two neutron stars merge into a black hole and emit gravitational waves', () => {
  const { sim, events } = game();
  body(sim, 'ns', 0, 330, 500, 1.7);
  body(sim, 'ns', 0, 331, 500, 1.7);
  sim.update(1 / 60);
  assert.equal(sim.bodies.length, 2, 'neutron stars first spiral together');
  advance(sim, PHYSICS.compactMergerDuration + .1);
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

test('core-collapse blasts push every nearby body outward and destroy nothing', () => {
  const { sim, events } = game();
  const progenitor = body(sim, 'star', 6, 330, 500, 32);
  progenitor.collapseAt = 0;
  const close = body(sim, 'star', 0, 450, 500);
  const far = body(sim, 'star', 3, 560, 500);
  sim.update(1 / 60);
  assert.ok(sim.bodies.some(value => value.id === close.id), 'even an adjacent star survives');
  assert.ok(close.vx > 0 && far.vx > 0, 'both are pushed outward in the same frame as the collapse');
  assert.equal(PHYSICS.supernovaPush, 6100, 'the blast push is ten times the original 610');
  assert.ok(events.some(event => eventIs(event, 'supernova') && event.destroyed === 0));
});

test('a black hole drains exactly one donor at a time, shrinking it and conserving mass', () => {
  const { sim } = game();
  const hole = body(sim, 'bh', 0, 330, 500, 9);
  const left = body(sim, 'star', 4, 250, 500);
  const right = body(sim, 'star', 3, 398, 500);
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
  const first = body(sim, 'bh', 0, 292, 500, 5);
  const second = body(sim, 'bh', 0, 408, 500, 5);
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
  // Same frame, full 10× push: the original 610 gave this star well under 300 px/s.
  assert.ok(distant.vx > 1000, 'Type Ia blasts push instantly with the 10x strength');
});

test('core-collapse lifetimes are exactly five times the original values', () => {
  const {sim}=game();
  for(const [mass,original] of [[8,27],[16,18],[32,7]]) {
    const star=body(sim,'star',5,100,500,mass);
    assert.equal(star.collapseAt,original*5);
  }
});

test('black-hole mass transfer is exactly one two-hundredth of the original rate', () => {
  const {sim}=game();const hole=body(sim,'bh',6,330,500,9),donor=body(sim,'star',4,410,500);
  const expected=(.72+9*.075)/200,initial=donor.mass;
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

test('the win threshold is 200 solar masses and 40 no longer wins', () => {
  const {sim}=game();const hole=body(sim,'bh',6,330,500,40);sim._checkVictory();
  assert.equal(sim.state,'playing');assert.equal(sim.winningMass,200);
  hole.mass=199.99;sim._checkVictory();assert.equal(sim.state,'playing');
  hole.mass=200;sim._checkVictory();assert.equal(sim.state,'won');
});

test('after winning, endless play resumes the exact board and never ends at the goal', () => {
  const { sim } = game();
  body(sim, 'bh', 6, 330, 700, 200); body(sim, 'star', 2, 520, 760); body(sim, 'star', 1, 140, 760);
  sim.update(1 / 60);
  assert.equal(sim.state, 'won');
  const before = sim.bodies.map(value => [value.id, value.kind, value.mass]);
  advance(sim, 10);
  assert.notDeepEqual(sim.bodies.map(value => value.id), before.map(value => value[0]), 'the finale changed the board');
  assert.ok(sim.continueAfterWin('endless'));
  assert.equal(sim.state, 'playing'); assert.equal(sim.mode, 'endless');
  assert.deepEqual(sim.bodies.map(value => [value.id, value.kind, value.mass]), before);
  sim.bodies[0].mass = 5000;
  advance(sim, .5);
  assert.equal(sim.state, 'playing', 'no upper bound: a 5000 M☉ hole keeps playing');
  assert.ok(sim.bodies[0].mass >= 5000);
});

test('sandbox places any body, with no win and no loss', () => {
  const { sim } = game();
  sim.restart(); sim.start('sandbox');
  assert.equal(sim.bodies.length, 0, 'sandbox starts empty');
  const placed = [];
  for (const spec of [{ kind: 'star', type: 0 }, { kind: 'star', type: 6, sub: 2 }, { kind: 'wd' }, { kind: 'ns' }, { kind: 'bh', mass: 250 }]) {
    advance(sim, .3);
    placed.push(sim.place(spec, 330));
  }
  assert.deepEqual(placed.map(value => value.kind), ['star', 'star', 'wd', 'ns', 'bh']);
  assert.equal(placed[1].mass, 64);
  assert.equal(placed[4].mass, 250);
  advance(sim, 1);
  assert.equal(sim.state, 'playing', 'a 250 M☉ hole does not win in the sandbox');
  for (let i = 0; i < 30; i++) { advance(sim, .25); sim.place({ kind: 'star', type: 6, sub: 1 }, 100 + (i % 5) * 120); }
  advance(sim, 6);
  assert.equal(sim.state, 'playing', 'an overfull sandbox never loses');
  assert.equal(game().sim.place({ kind: 'bh' }, 300), null, 'placing is sandbox-only');
});

test('softened gravity approaches inverse-square falloff and is finite at the origin', () => {
  const near=gravityAt(200,0,1,1),far=gravityAt(400,0,1,1),center=gravityAt(0,0,1000);
  assert.ok(Math.abs(near.x/far.x-4)<.001);assert.equal(near.y,0);
  assert.deepEqual(center,{x:0,y:0});
});

test('compact objects and stars exert no gravitational attraction on each other', () => {
  const {sim}=game();
  const bodies=[body(sim,'ns',6,330,500,1.4),body(sim,'wd',0,200,500,1),body(sim,'bh',0,520,500,20),body(sim,'star',2,430,500,1),body(sim,'star',4,260,420)];
  sim._applyGravity(.5);
  for(const value of bodies){assert.equal(value.vx,0);assert.equal(value.vy,0);}
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
    advance(sim, PHYSICS.compactMergerDuration + .1);
    return events.find(event => eventIs(event, 'wave')).power;
  };
  assert.ok(wavePower('ns') < wavePower('bh'));
});

test('victory unlocks simultaneous accretion and keeps the completion timer fixed', () => {
  const { sim } = game();
  const hole = body(sim, 'bh', 0, 330, 500, sim.winningMass);
  const first = body(sim, 'star', 2, 235, 500);
  const second = body(sim, 'star', 3, 435, 500);
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


test('black holes exert no attraction, receive none, and cannot accrete a separated star',()=>{
 const {sim}=game();const a=body(sim,'bh',0,300,400,30),b=body(sim,'bh',0,420,400,50),s=body(sim,'star',2,520,400),n=body(sim,'ns',0,300,600,1.4);
 sim._applyGravity(.1);assert.equal(a.vx,0);assert.equal(a.vy,0);assert.equal(b.vx,0);assert.equal(b.vy,0);
 sim.bodies=[a,b,s];s.vx=s.vy=0;sim._applyGravity(.1);assert.equal(s.vx,0);assert.equal(s.vy,0);
 const mass=s.mass;sim._updateAccretion(1);assert.equal(s.mass,mass);assert.equal(a.accretingId,null);assert.equal(b.accretingId,null);
});
test('discs start without spin; free fall and centred impacts do not invent angular motion',()=>{
 const {sim}=game();const a=body(sim,'star',0,200,300),b=body(sim,'star',1,242,300);
 const initial=a.rotation;assert.equal(a.angularVelocity,0);advance(sim,.1);assert.equal(a.angularVelocity,0);assert.equal(a.rotation,initial);
 a.x=200;a.y=300;b.x=242;b.y=300;a.vx=100;a.vy=0;b.vx=0;b.vy=0;sim._solveContacts();assert.equal(a.angularVelocity,0);assert.equal(b.angularVelocity,0);
});
test('tangential contact creates spin, advances the texture angle and floor friction creates rolling',()=>{
 const {sim}=game();const a=body(sim,'star',0,200,300),b=body(sim,'star',1,242,300);
 a.vx=100;a.vy=80;sim._solveContacts();assert.ok(Math.abs(a.angularVelocity)>.1);assert.ok(Math.abs(b.angularVelocity)>.1);
 const angle=a.rotation;advance(sim,.05);assert.notEqual(a.rotation,angle);
 sim.bodies=[a];a.y=sim.floor-a.radius+1;a.vx=80;a.vy=0;a.angularVelocity=0;sim._solveBounds();assert.ok(a.angularVelocity>0);assert.ok(a.vx<80);
});


test('a glancing wall collision transfers tangential momentum into disc rotation',()=>{
 const {sim}=game();const a=body(sim,'star',0,sim.wallRight-18,300);a.vx=100;a.vy=80;sim._solveBounds();assert.ok(a.angularVelocity<0);assert.ok(a.vy<80);assert.ok(a.vx<0);
});

test('the chamber has a ceiling: fast stars bounce back down and never leave', () => {
  const { sim } = game();
  const star = body(sim, 'star', 1, 330, 120);
  star.vy = -1100;
  let highest = Infinity;
  for (let i = 0; i < 30; i++) { sim.update(1 / 60); highest = Math.min(highest, star.y - star.radius); }
  assert.ok(highest >= sim.ceiling - 1e-6, 'the star stays below the ceiling');
  assert.ok(star.vy > 0, 'it rebounds downward');
});

test('fast wall impacts rebound while slow contacts stay damped', () => {
  const { sim } = game();
  const fast = body(sim, 'star', 0, sim.wallRight - 18, 300);
  fast.vx = 900; fast.vy = 0;
  sim._solveBounds();
  assert.ok(fast.vx < -300);
  const slow = body(sim, 'star', 0, sim.wallLeft + 18, 500);
  slow.vx = -100; slow.vy = 0;
  sim._solveBounds();
  assert.ok(slow.vx > 0 && slow.vx <= 20);
});

test('an inspiral follows the same path whatever surrounds it, inside every bound', () => {
  const run = crowd => {
    const { sim } = game();
    const a = body(sim, 'bh', 0, 80, 760, 30), b = body(sim, 'bh', 0, 80, 760, 30);
    a.x = sim.wallLeft + a.radius; a.y = sim.floor - a.radius;
    b.x = a.x + a.radius + b.radius; b.y = a.y;
    if (crowd) for (const [type, x, y] of [[2, 240, 740], [3, 120, 640], [1, 60, 600], [4, 260, 560]]) body(sim, 'star', type, x, y);
    const path = [];
    sim.update(1 / 60);
    for (let i = 0; i < 290; i++) {
      sim.update(1 / 60);
      for (const value of [a, b]) {
        assert.ok(value.x - value.radius >= sim.wallLeft - 1e-6 && value.x + value.radius <= sim.wallRight + 1e-6, 'within the walls');
        assert.ok(value.y - value.radius >= sim.ceiling - 1e-6 && value.y + value.radius <= sim.floor + 1e-6, 'within floor and ceiling');
      }
      if (i > 15 && i % 10 === 0) path.push(+a.x.toFixed(6), +a.y.toFixed(6), +b.x.toFixed(6), +b.y.toFixed(6));
    }
    return path;
  };
  assert.deepEqual(run(true), run(false));
});

test('supernova shocks and X-ray bursts do not deflect a spiralling binary', () => {
  const { sim } = game();
  const a = body(sim, 'bh', 0, 330, 600, 9), b = body(sim, 'bh', 0, 330, 600, 9);
  b.x = a.x + a.radius + b.radius;
  sim.update(1 / 60);
  sim._blast(330, 760, -1, { power: 1.5, radius: 400, killRadius: 0 });
  assert.equal(a.vx, 0); assert.equal(a.vy, 0); assert.equal(b.vx, 0); assert.equal(b.vy, 0);
});

test('X-ray bursts push nearby bodies ten times harder than the original 64', () => {
  const { sim } = game();
  const neutron = body(sim, 'ns', 0, 330, 500, 1.4), near = body(sim, 'star', 0, 425, 500);
  sim._xrayBurst(neutron);
  assert.equal(PHYSICS.xrayBurstPush, 640);
  assert.ok(Math.abs(near.vx - (1 - 95 / 190) * 640) < 1e-9);
  assert.ok(Math.abs(near.vy + 80) < 1e-9);
});

test('X-ray bursts leave the star being accreted in place', () => {
  const { sim } = game();
  const neutron = body(sim, 'ns', 0, 330, 500, 1.4), donor = body(sim, 'star', 2, 400, 500), other = body(sim, 'star', 0, 260, 500);
  neutron.accretingId = donor.id; donor.lockedBy = neutron.id;
  sim._xrayBurst(neutron);
  assert.equal(donor.vx, 0); assert.equal(donor.vy, 0);
  assert.ok(other.vx < 0, 'other nearby stars are still pushed');
});

test('a black hole and a neutron star spiral together and merge', () => {
  for (const [holeMass, variant] of [[6, 'neutron-star-disruption'], [20, 'neutron-star-plunge']]) {
    const { sim, events } = game();
    const hole = body(sim, 'bh', 0, 330, 700, holeMass), neutron = body(sim, 'ns', 0, 330, 700, 1.5);
    neutron.x = hole.x + hole.radius + neutron.radius;
    sim.update(1 / 60);
    assert.equal(hole.mergingWith, neutron.id);
    advance(sim, PHYSICS.compactMergerDuration + .1);
    assert.equal(sim.bodies.length, 1);
    assert.equal(sim.bodies[0].kind, 'bh');
    assert.ok(Math.abs(sim.bodies[0].mass - holeMass - 1.5) < 1e-9);
    const wave = events.find(event => event.kind === 'wave');
    assert.equal(wave.variant, variant);
    assert.equal(wave.disrupted, holeMass < 10);
  }
});

test('stellar interiors evolve continuously and fill the whole star', () => {
  const { sim } = game();
  for (const [type, mass] of [[0, 0.25], [1, 0.5], [2, 1], [3, 2], [4, 4], [5, 8], [6, 16], [6, 32], [6, 64]]) {
    const star = body(sim, 'star', type, 330, 500, mass);
    const life = mass >= 8 ? star.collapseAt : PHYSICS.whiteDwarfAge;
    let previous = null;
    for (let step = 0; step <= 400; step++) {
      star.age = life * step / 400;
      const layers = stellarLayers(star);
      assert.ok(Math.abs(layers.reduce((sum, layer) => sum + layer.fraction, 0) - 1) < 1e-9, `${mass} M☉ fills the disc`);
      assert.ok(layers.every(layer => layer.el && layer.name && /^#[0-9a-f]{6}$/.test(layer.color)));
      // Boundaries (cumulative area per element) move by small steps, never jump.
      const edges = new Map();let area = 0;
      for (const layer of layers) { area += layer.fraction; edges.set(layer.el, area); }
      if (previous) for (const [el, edge] of edges) if (previous.has(el)) assert.ok(Math.abs(edge - previous.get(el)) < 0.06, `${mass} M☉ ${el} at step ${step}`);
      previous = edges;
    }
  }
});

test('massive stars burn hydrogen first, then build an onion inward', () => {
  const { sim } = game();
  const star = body(sim, 'star', 6, 330, 500, 32);
  star.age = star.collapseAt * 0.3;
  assert.equal(stellarPhase(star).late, 0, 'core hydrogen burning dominates the lifetime');
  assert.deepEqual(stellarLayers(star).map(layer => layer.el).slice(0, 1), ['H→He']);
  star.age = star.collapseAt;
  assert.deepEqual(stellarLayers(star).map(layer => layer.el).slice(0, 5), ['Fe', 'Si', 'O/Ne', 'C/O', 'He']);
  const dwarf = body(sim, 'star', 0, 330, 500, 0.25);
  dwarf.age = 100;
  assert.deepEqual(stellarLayers(dwarf).map(layer => layer.el), ['H+He'], 'an M dwarf stays fully mixed');
});

test('star sizes follow the reference watermelon ladder and drops are uniform over M–B', () => {
  const scale = 660 / 720, expected = [52, 78, 108, 119, 153, 183, 258].map(d => d / 2 * scale);
  STAR_TYPES.forEach((type, i) => assert.ok(Math.abs(type.radius - expected[i]) < 1e-9, type.type));
  const { sim } = game();
  for (const [mass, d] of [[16, 258], [32, 308], [64, 404]]) assert.ok(Math.abs(sim.addBody('star', 6, 330, 500, mass).radius - d / 2 * scale) < 1e-9);
  const counts = new Array(7).fill(0);
  for (let i = 0; i < 6000; i++) counts[sim._rollNext()]++;
  assert.equal(counts[6], 0, 'O stars are never dropped');
  for (let i = 0; i < 6; i++) assert.ok(counts[i] > 850 && counts[i] < 1150, `class ${i} appears about 1/6 of the time`);
  assert.ok(sim.dropHeight(5) - STAR_TYPES[5].radius >= sim.ceiling, 'even a dropped B star clears the ceiling');
});

test('donors stay attached to the compact object feeding on them', () => {
  for (const kind of ['bh', 'ns', 'wd']) {
    const { sim } = game();
    const source = body(sim, kind, 0, 330, 600, kind === 'bh' ? 20 : kind === 'ns' ? 1.4 : 0.8), donor = body(sim, 'star', 3, 330, 600);
    donor.x = source.x + source.radius + donor.radius + (kind === 'bh' ? 2 : 30);
    sim.update(1 / 60);
    assert.equal(source.accretingId, donor.id, `${kind} captures the donor`);
    donor.vx = 900; donor.vy = -300;
    advance(sim, 1.5);
    assert.equal(source.accretingId, donor.id, `${kind} keeps feeding after a kick`);
    assert.ok(Math.abs(Math.hypot(donor.x - source.x, donor.y - source.y) - source.radius - donor.radius) < 2, `${kind} donor stays in contact`);
  }
});

test('interior change starts at birth so it reads as a lifetime gauge', () => {
  const { sim } = game();
  for (const [type, mass] of [[2, 1], [4, 4], [6, 32]]) {
    const star = body(sim, 'star', type, 330, 500, mass);
    star.age = 0;
    const birth = stellarLayers(star);
    star.age = (mass >= 8 ? star.collapseAt : PHYSICS.whiteDwarfAge) * 0.1;
    const early = stellarLayers(star);
    assert.notDeepEqual(early, birth, `${mass} M☉ has visibly evolved after 10% of its life`);
    assert.ok(Math.abs(stellarPhase(star).progress - 0.1) < 1e-9);
  }
});

test('core-collapse events carry the onion so the ejecta can be drawn shell by shell', () => {
  const { sim, events } = game();
  const star = body(sim, 'star', 6, 330, 500, 32);
  star.age = star.collapseAt;
  sim.update(1 / 60);
  const blast = events.find(event => event.kind === 'supernova');
  assert.deepEqual(blast.layers.map(layer => layer.el).slice(0, 5), ['Fe', 'Si', 'O/Ne', 'C/O', 'He']);
  assert.ok(Math.abs(blast.layers.reduce((sum, layer) => sum + layer.fraction, 0) - 1) < 1e-9);
});
