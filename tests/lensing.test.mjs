import test from 'node:test';
import assert from 'node:assert/strict';
import {deflectionAt,mapBackground} from '../dist/optics.js';
import {CRITICAL_B,traceDeflection} from '../dist/vendor/bruneton/geodesic.js';
import {waveDisplacement} from '../dist/vendor/algometrix/wave.js';
test('Schwarzschild capture and weak-field limit match their physical limits',()=>{
  assert.equal(traceDeflection(CRITICAL_B-.001).captured,true);
  const a=traceDeflection(100).alpha,b=traceDeflection(200).alpha;
  assert.ok(Math.abs(a/.02-1)<.025);assert.ok(Math.abs(a/b-2)<.04);
});
test('precomputed light deflections match direct RK4 geodesics including strong field',()=>{
  for(const b of [CRITICAL_B+.00001,2.61,2.7,3,4,10,30,119])assert.ok(Math.abs(deflectionAt(b)-traceDeflection(b).alpha)<.002,`b=${b}`);
});
test('lensing maps image coordinates, masks the black-hole shadow and keeps NS surface visible',()=>{
  const bh={kind:'bh',x:350,y:400,rs:10,radius:CRITICAL_B*10};
  assert.equal(mapBackground(350,400,[bh]).visible,false);
  const p=mapBackground(450,420,[bh]);assert.ok(p.visible);assert.ok(Math.abs(p.x-450)>5);assert.ok(Number.isFinite(p.y));
  assert.equal(mapBackground(350,400,[{...bh,kind:'ns',radius:36}]).visible,true);
  assert.deepEqual(mapBackground(100,200,[]),{x:100,y:200,visible:true});
});
test('quadrupole strain has a causal travelling front and smaller NS amplitude',()=>{
  assert.deepEqual(waveDisplacement(500,400,{x:350,y:400,age:.1,power:1}),{x:0,y:0});
  const w={x:350,y:400,age:1.8,power:1},a=waveDisplacement(500,450,w),b=waveDisplacement(500,450,{...w,power:.45});
  assert.ok(Math.hypot(a.x,a.y)>0);assert.ok(Math.abs(Math.hypot(b.x,b.y)/Math.hypot(a.x,a.y)-.45)<1e-10);
});
