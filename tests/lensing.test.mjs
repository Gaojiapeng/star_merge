import test from 'node:test';
import assert from 'node:assert/strict';
import { lensImages } from '../dist/renderer.js';

test('the lens equation gives opposite-parity images on the same radial axis',()=>{
  const p=lensImages(30,40,50);
  assert.ok(p.outerX>30&&p.outerY>40);
  assert.ok(p.innerX<0&&p.innerY<0);
  assert.ok(Math.abs(p.outerX/p.outerY-.75)<1e-10);
  assert.ok(Math.abs(Math.hypot(p.outerX,p.outerY)-Math.hypot(p.innerX,p.innerY)-50)<1e-9);
});
test('near-perfect alignment approaches the Einstein radius without infinities',()=>{
  const p=lensImages(0,0,50);
  assert.ok(Math.abs(Math.hypot(p.outerX,p.outerY)-50)<.001);
  assert.ok(Math.abs(Math.hypot(p.innerX,p.innerY)-50)<.001);
  for(const v of Object.values(p))assert.ok(Number.isFinite(v));
});
test('a distant source has inverse-angle light deflection and a faint secondary image',()=>{
  const a=lensImages(1000,0,20),b=lensImages(2000,0,20);
  assert.ok(Math.abs((a.outerX-1000)/(b.outerX-2000)-2)<.002);
  assert.ok(a.innerGain<.001&&b.innerGain<a.innerGain);
});
