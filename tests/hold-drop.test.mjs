import test from 'node:test';
import assert from 'node:assert/strict';
import{HoldDrop}from'../dist/hold-drop.js';
test('short tap drops once on release; a hold repeats at the dragged position without a release extra',()=>{
 const drops=[],h=new HoldDrop(x=>drops.push(x));h.begin(1,100);h.update(.1);h.end(1,120);assert.deepEqual(drops,[120]);
 h.begin(2,200);for(let i=0;i<5;i++)h.update(.1);h.move(2,400);for(let i=0;i<4;i++)h.update(.1);h.end(2,500);assert.deepEqual(drops,[120,200,400]);
});
test('hold cancellation and second-pointer rejection prevent delayed or accidental drops',()=>{
 const drops=[],h=new HoldDrop(x=>drops.push(x));assert.equal(h.begin(1,50),true);assert.equal(h.begin(2,400),false);h.move(2,450);h.end(2,450);h.cancel();for(let i=0;i<30;i++)h.update(.1);assert.equal(drops.length,0);
 h.begin(3,300);h.update(60);assert.equal(drops.length,0,'background time cannot catch up in a burst');
});
