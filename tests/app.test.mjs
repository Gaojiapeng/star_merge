import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// This harness executes the real application and renderer without a browser.
// It checks DOM contracts and interaction state; it does not emulate layout,
// perform screenshots, or claim visual/browser compatibility coverage.
class ElementStub {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
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
  elements.get('sound').span = new ElementStub('span');
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

test('real app startup and interaction state work against the shipped HTML contract', async t => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const env = fixture(html);
  try {
    await import('../dist/app.js');
    const get = env.get;

    await t.test('startup renders a ready game and all six lab controls', () => {
      env.tick(0.2);
      assert.equal(get('ready-overlay').hidden, false);
      assert.equal(get('field-status').textContent, '等待点火');
      assert.equal(get('score').textContent, '000000');
      assert.equal(env.scenarios.length, 6);
      assert.equal(get('pause').disabled, true);
    });

    await t.test('Space on a focused control is not captured as a game command', () => {
      const event = env.key(get('settings-open'));
      env.tick(0.2);
      assert.equal(event.defaultPrevented, undefined);
      assert.equal(get('ready-overlay').hidden, false);
      assert.equal(get('settings-dialog').open, false, 'the harness does not synthesize native button clicks');
    });

    await t.test('start, drop, pause and resume update the actual UI', () => {
      get('start').click();
      assert.equal(get('ready-overlay').hidden, true);
      assert.equal(get('field-status').textContent, '引力场稳定运行');
      const originalCount = get('body-count').textContent;
      env.key(get('settings-open'));
      env.tick(0.2);
      assert.equal(get('body-count').textContent, originalCount, 'focused-button Space does not drop a star');
      env.key(get('universe'));
      env.tick(0.2);
      assert.notEqual(get('body-count').textContent, originalCount);
      get('pause').click();
      assert.equal(get('field-status').textContent, '时间已暂停');
      const pausedTime = get('timer').textContent;
      env.tick(2);
      assert.equal(get('timer').textContent, pausedTime);
      get('state-action').click();
      assert.equal(get('field-status').textContent, '引力场稳定运行');
    });

    await t.test('dialogs restore the prior running or paused state correctly', () => {
      get('guide-open').click();
      assert.equal(get('guide-dialog').open, true);
      assert.equal(get('field-status').textContent, '时间已暂停');
      get('guide-dialog').closeButton.click();
      assert.equal(get('field-status').textContent, '引力场稳定运行');
      get('pause').click();
      get('guide-open').click();
      get('guide-dialog').closeButton.click();
      assert.equal(get('field-status').textContent, '时间已暂停');
      get('pause').click();
    });

    await t.test('lab finale advances to its ending without contaminating the record', () => {
      const record = get('best').textContent;
      get('lab-open').click();
      env.scenarios.find(button => button.dataset.scenario === 'finale').click();
      assert.equal(get('lab-dialog').open, false);
      assert.equal(get('lab-tag').hidden, false);
      assert.equal(get('arena-title').textContent, '天体物理实验室');
      env.tick(2);
      assert.equal(get('cinema-caption').hidden, false);
      assert.ok(Number(get('score').textContent) > 0);
      const countAtWin = get('body-count').textContent;
      env.tick(2);
      assert.notEqual(get('body-count').textContent, countAtWin, 'won-state physics continues consuming/spawning stars');
      env.tick(8);
      assert.equal(get('state-overlay').hidden, false);
      assert.equal(get('state-eyebrow').textContent, 'A GALAXY IS BORN');
      assert.equal(get('best').textContent, record);
      assert.equal(env.storage.has('stellar-forge-best'), false);
      get('lab-exit').click();
      assert.equal(get('ready-overlay').hidden, false);
      assert.equal(get('lab-tag').hidden, true);
      assert.equal(get('score').textContent, '000000');
    });

    await t.test('reset from settings returns to a clean ready game', () => {
      get('start').click();
      env.tick(1.2);
      get('settings-open').click();
      get('restart').click();
      assert.equal(get('settings-dialog').open, false);
      assert.equal(get('ready-overlay').hidden, false);
      assert.equal(get('field-status').textContent, '等待点火');
      assert.equal(get('timer').textContent, '00:00');
      assert.equal(get('score').textContent, '000000');
      assert.equal(get('pause').disabled, true);
    });
  } finally {
    env.restore();
  }
});
