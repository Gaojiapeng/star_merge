import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// This harness executes the real application and renderer without a browser.
// It checks DOM contracts and interaction state; it does not emulate layout,
// perform screenshots, or claim visual/browser compatibility coverage.
class ElementStub {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    if (this.tagName === 'CANVAS') this.getContext = () => new Proxy({}, {
      get(target,key) { if(key in target)return target[key]; return (...args) => { for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value), `finite Canvas argument for ${String(key)}`); }; }
    });
    this.attributes = { ...attributes };
    this.id = attributes.id;
    this.dataset = {};
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('data-')) this.dataset[name.slice(5)] = value;
    }
    this.hidden = 'hidden' in attributes;
    this.open = false;
    this.disabled = false;
    this.checked = 'checked' in attributes;
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
    this.listeners = new Map();
    this.style = { setProperty(name, value) { this[name] = value; } };
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      toggle(name, force) { const include = force ?? !classes.has(name); if (include) classes.add(name); else classes.delete(name); return include; },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(name, callback) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(callback);
    this.listeners.set(name, listeners);
  }
  dispatch(name, event = {}) {
    event.target ||= this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    for (const callback of this.listeners.get(name) || []) callback(event);
    return event;
  }
  click() {
    if (this.disabled) return;
    const event = { target: this };
    this.onclick?.(event);
    this.dispatch('click', event);
  }
  querySelector(selector) {
    if (selector === '.close-dialog') return this.closeButton;
    if (selector === 'h3') return this.heading;
    if (selector === 'span') return this.span;
    throw new Error(`Unimplemented fixture selector: ${selector}`);
  }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; this.dispatch('close'); }
  focus() { globalThis.document.activeElement = this; }
  scrollIntoView() {}
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: 700, bottom: 820, width: 700, height: 820 }; }
}

function parseAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[match[1]] = match[2] ?? '';
  return attributes;
}

function fixture(html) {
  const elements = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="[^"]+"[^>]*)>/gi)) {
    const attributes = parseAttributes(match[2]);
    elements.set(attributes.id, new ElementStub(match[1], attributes));
  }
  const dialogs = [...elements.values()].filter(element => element.tagName === 'DIALOG');
  for (const dialog of dialogs) dialog.closeButton = new ElementStub('button', { class: 'close-dialog' });
  const scenarios = [...html.matchAll(/<button\s+data-scenario="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map(match => {
    const button = new ElementStub('button', { 'data-scenario': match[1] });
    button.heading = new ElementStub('h3');
    button.heading.textContent = match[2].match(/<h3>([^<]+)<\/h3>/)?.[1] || '';
    return button;
  });
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: String(text).length * 7 });
      if (String(key).startsWith('create') && String(key).endsWith('Gradient')) return () => ({ addColorStop() {} });
      return () => {};
    },
  });
  elements.get('universe').getContext = () => context;
  const document = new ElementStub('document');
  document.hidden = false;
  document.getElementById = id => {
    assert.ok(elements.has(id), `app references existing HTML element #${id}`);
    return elements.get(id);
  };
  document.createElement = tag => new ElementStub(tag);
  document.querySelectorAll = selector => {
    if (selector === 'dialog') return dialogs;
    if (selector === '[data-scenario]') return scenarios;
    throw new Error(`Unimplemented fixture selector: ${selector}`);
  };
  document.querySelector = selector => {
    if (selector === 'dialog[open]') return dialogs.find(dialog => dialog.open) || null;
    throw new Error(`Unimplemented fixture selector: ${selector}`);
  };
  const storage = new Map();
  let clock = 0;
  let nextFrame;
  const globals = {
    document,
    window: { devicePixelRatio: 1 },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
    performance: { now: () => clock },
    requestAnimationFrame: callback => { nextFrame = callback; return 1; },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return {
    elements, dialogs, scenarios, document, storage,
    get: id => document.getElementById(id),
    tick(seconds) {
      for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60) {
        clock += 1000 / 60;
        assert.equal(typeof nextFrame, 'function', 'animation loop remains scheduled');
        const callback = nextFrame;
        nextFrame = null;
        callback(clock);
      }
    },
    key(target, key = ' ', code = 'Space') { return document.dispatch('keydown', { target, key, code, repeat: false }); },
    restore() {
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('minimal game starts, responds to mobile input, pauses, and reaches its ending', async t => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const env = fixture(html);
  try {
    const { sim, renderer } = await import('../dist/app.js');
    const get = env.get;
    await t.test('only the game and its options remain', () => {
      env.tick(.2);
      assert.equal(env.dialogs.length,1);
      assert.equal(env.scenarios.length,0);
      assert.ok(!html.includes('lab-open')&&!html.includes('guide-open')&&!html.includes('inspector'));
      assert.equal(get('ready-overlay').hidden,false);
      assert.equal(get('score').textContent,'0');
      assert.equal(sim.winningMass,2000);
      assert.ok(renderer.materials.size>0,'stars are rasterized from material particles');
    });
    await t.test('Space on a focused button preserves native button behavior', () => {
      const event=env.key(get('settings-open'));
      assert.equal(event.defaultPrevented,undefined);
      assert.equal(sim.state,'ready');
    });
    await t.test('drag release drops one star at the new horizontal position', () => {
      get('start').click();env.tick(.5);const before=sim.bodies.length;
      get('universe').dispatch('pointerdown',{pointerId:7,button:0,clientX:120,clientY:300});
      get('universe').dispatch('pointermove',{pointerId:7,clientX:570,clientY:300});
      assert.equal(sim.bodies.length,before,'pressing does not immediately drop');
      get('universe').dispatch('pointerup',{pointerId:7,clientX:570,clientY:300});
      assert.equal(sim.bodies.length,before+1);assert.ok(sim.bodies.at(-1).x>550);
      get('pause').click();const snapshot=sim.getSnapshot(),visualTime=renderer.time;
      env.tick(1);assert.deepEqual(sim.getSnapshot(),snapshot);assert.equal(renderer.time,visualTime);
      get('state-action').click();assert.equal(sim.state,'playing');
    });
    await t.test('cancelled pointers and inspection never drop an accidental star', () => {
      env.tick(.5);const before=sim.bodies.length;
      get('universe').dispatch('pointerdown',{pointerId:8,button:0,clientX:120,clientY:300});
      get('universe').dispatch('pointercancel');
      get('universe').dispatch('pointerup',{pointerId:8,clientX:120,clientY:300});
      assert.equal(sim.bodies.length,before);
      get('mode').click();const body=sim.bodies[0];
      get('universe').dispatch('pointerdown',{pointerId:9,button:0,clientX:body.x,clientY:body.y});
      assert.equal(get('body-info').hidden,false);assert.ok(get('info-layers').children.length>0);
      get('mode').click();assert.equal(get('body-info').hidden,true);
    });
    await t.test('options restore prior pause state and allow lensing to be disabled', () => {
      get('settings-open').click();assert.equal(sim.state,'paused');
      get('setting-lensing').onchange({target:{checked:false}});assert.equal(renderer.showLensing,false);
      get('settings-close').click();assert.equal(sim.state,'playing');
      get('pause').click();get('settings-open').click();get('settings-close').click();assert.equal(sim.state,'paused');
      get('pause').click();
    });
    await t.test('the 2000-mass ending keeps advancing the physical and visual clocks', () => {
      sim.bodies=[];sim.addBody('bh',6,350,600,2000);sim.addBody('star',3,490,600);env.tick(.2);
      assert.equal(sim.state,'won');assert.equal(get('cinema-caption').hidden,false);
      const elapsed=sim.time;env.tick(13);assert.equal(sim.time,elapsed);
      assert.ok(sim.finaleTime>12&&renderer.isCinematicDone);
      assert.equal(get('state-overlay').hidden,false);
      get('state-action').click();assert.equal(sim.state,'playing');assert.equal(sim.score,0);
    });
    await t.test('ejecta stay visible longer, feel gravity, cool and remain budgeted', () => {
      renderer.event({kind:'supernova',x:350,y:400,radius:300,power:1});
      const shock=renderer.effects.find(e=>e.kind==='shock');assert.equal(shock.duration,14);
      env.tick(3);assert.ok(renderer.particles.length>0);
      assert.ok(renderer.effects.some(e=>e.kind==='shock'));
      assert.ok(renderer.particles.length<=renderer.particleLimit);
      for(let i=0;i<20;i++)renderer.event({kind:'supernova',x:350,y:400,radius:300});
      assert.ok(renderer.particles.length<=renderer.particleLimit);
      get('setting-quality').onchange({target:{checked:false}});env.tick(.1);
      assert.ok(renderer.particles.length<=1100);
    });
    await t.test('a crowded field shares a hard material-pixel budget', () => {
      sim.bodies=[];renderer.reset();
      for(let i=0;i<100;i++)sim.addBody('star',6,30+i%10*64,150+Math.floor(i/10)*60);
      renderer.render(1/60);
      const pixels=[...renderer.materials.values()].reduce((n,m)=>n+m.points.length,0);
      assert.ok(pixels<=renderer.materialLimit);assert.ok(pixels>0);
      for(const m of renderer.materials.values())assert.ok(m.points.length>0,'each star retains visible material');
    });
  } finally { env.restore(); }
});
