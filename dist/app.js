import { Simulation, STAR_TYPES, PHYSICS } from './simulation.js?v=2.0.1';
import { Renderer } from './renderer.js?v=2.0.1';
const $=id=>document.getElementById(id),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pad=n=>String(Math.floor(n)).padStart(2,'0'),timeText=n=>`${pad(n/60)}:${pad(n%60)}`;
const massText=n=>n<10?n.toFixed(2):Math.round(n).toLocaleString('en-US');
const storageKey='stellar-forge-v2';
let best=0,settings={sound:false,layers:true,lensing:true,quality:!matchMedia('(max-width: 640px)').matches,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};
try{best=Number(localStorage.getItem(storageKey+'-best'))||0;settings={...settings,...JSON.parse(localStorage.getItem(storageKey+'-settings')||'{}')};}catch{}
let renderer,mode='drop',selectedId=null,activePointer=null,restoreAfterOptions=false,toastTimer,audioContext,wonBefore=false;
const sim=new Simulation({onEvent:event=>{renderer?.event(event);playSound(event.kind);if(event.kind==='supernova')toast(event.variant==='Ia'?'Ia 型超新星':'超新星爆发');}});
renderer=new Renderer($('universe'),sim);
export { sim, renderer };
function playSound(kind){
  if(!settings.sound||!['merge','supernova','wave','burst'].includes(kind))return;
  try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime,duration=kind==='supernova'?1.6:kind==='wave'?1:.2;osc.type=kind==='wave'?'sine':kind==='supernova'?'triangle':'sine';osc.frequency.setValueAtTime({merge:360,supernova:55,wave:100,burst:680}[kind],t);osc.frequency.exponentialRampToValueAtTime(kind==='merge'?650:22,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.035,t+.02);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+duration);}catch{}
}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2400);}
function reset(){activePointer=null;selectedId=null;renderer.selectedId=null;renderer.reset();sim.restart();wonBefore=false;setMode('drop');updateUi();}
function start(){renderer.reset();sim.start();updateUi();$('universe').focus({preventScroll:true});}
function togglePause(){if(['playing','paused'].includes(sim.state)){sim.togglePause();updateUi();}}
function setMode(next){mode=next;renderer.inspectMode=next==='inspect';$('mode').setAttribute('aria-pressed',next==='inspect');$('mode').innerHTML=next==='inspect'?'<span aria-hidden="true">✦</span> 投放':'<span aria-hidden="true">◎</span> 查看';$('universe').style.cursor=next==='inspect'?'help':'crosshair';if(next==='drop'){selectedId=null;renderer.selectedId=null;$('body-info').hidden=true;}}
$('start').onclick=start;$('pause').onclick=togglePause;$('mode').onclick=()=>{setMode(mode==='drop'?'inspect':'drop');if(mode==='inspect')toast('点击天体，查看质量与元素分层');};
$('restart').onclick=()=>{reset();start();};
$('state-action').onclick=()=>{if(sim.state==='paused')togglePause();else{reset();start();}};
$('info-close').onclick=()=>{selectedId=null;renderer.selectedId=null;$('body-info').hidden=true;};
$('settings-open').onclick=()=>{activePointer=null;restoreAfterOptions=sim.state==='playing';if(restoreAfterOptions)sim.togglePause();$('settings-dialog').showModal();updateUi();};
$('settings-close').onclick=()=>$('settings-dialog').close();
$('settings-dialog').addEventListener('close',()=>{if(restoreAfterOptions&&sim.state==='paused')sim.togglePause();restoreAfterOptions=false;updateUi();});
$('settings-dialog').addEventListener('click',e=>{if(e.target!==$('settings-dialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
function applySettings(){renderer.showLayers=settings.layers;renderer.showLensing=settings.lensing;renderer.setQuality(settings.quality?'high':'low');renderer.setReducedMotion(settings.motion);for(const key of Object.keys(settings))$('setting-'+key).checked=settings[key];try{localStorage.setItem(storageKey+'-settings',JSON.stringify(settings));}catch{}}
for(const key of Object.keys(settings))$('setting-'+key).onchange=e=>{settings[key]=e.target.checked;applySettings();if(key==='sound'&&settings.sound)playSound('merge');};
function point(event){const r=$('universe').getBoundingClientRect(),x=(event.clientX-r.left)*$('universe').width/r.width,y=(event.clientY-r.top)*$('universe').height/r.height;return{x:(x-renderer.offsetX)/renderer.scale,y:(y-renderer.offsetY)/renderer.scale};}
$('universe').addEventListener('pointermove',e=>{renderer.pointerX=clamp(point(e).x,42,658);});
$('universe').addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const p=point(e);if(p.y<0||p.y>sim.height)return;renderer.pointerX=clamp(p.x,42,658);
  if(mode==='inspect'||e.shiftKey){const body=[...sim.bodies].reverse().find(b=>Math.hypot(b.x-p.x,b.y-p.y)<b.radius+10);if(body){selectedId=body.id;renderer.selectedId=body.id;updateInfo();}return;}
  if(sim.state==='playing'){activePointer=e.pointerId;$('universe').setPointerCapture?.(e.pointerId);}
});
$('universe').addEventListener('pointerup',e=>{if(activePointer===null||e.pointerId!==activePointer)return;activePointer=null;renderer.pointerX=clamp(point(e).x,42,658);if(sim.state==='playing'&&mode==='drop')sim.drop(renderer.pointerX);updateUi();});
$('universe').addEventListener('pointercancel',()=>{activePointer=null;});
document.addEventListener('keydown',e=>{
  if($('settings-dialog').open||['BUTTON','INPUT','A','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')renderer.pointerX=clamp(renderer.pointerX-25,42,658);
  if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')renderer.pointerX=clamp(renderer.pointerX+25,42,658);
  if(e.code==='Space'&&!e.repeat){if(sim.state==='ready')start();else if(sim.state==='playing'&&mode==='drop')sim.drop(renderer.pointerX);}
  if(e.key.toLowerCase()==='p'&&!e.repeat)togglePause();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){activePointer=null;restoreAfterOptions=false;if(sim.state==='playing')sim.togglePause();updateUi();}});
new ResizeObserver(()=>renderer.resize()).observe($('canvas-wrap'));
function updateInfo(){
  const b=sim.bodies.find(b=>b.id===selectedId);$('body-info').hidden=!b;if(!b){selectedId=null;renderer.selectedId=null;return;}
  $('info-name').textContent=b.kind==='star'?`${STAR_TYPES[b.type].type} 型 · ${STAR_TYPES[b.type].name}`:{bh:'黑洞',ns:'中子星',wd:'白矮星'}[b.kind];$('info-mass').textContent=`${massText(b.mass)} M☉`;
  const layers=b.kind==='bh'?[['事件视界','#cdb4a2'],['等离子吸积盘','#de9e60'],['引力透镜','#b3a5cb']]:b.kind==='ns'?[['富中子外壳','#a3d7f7'],['中子核心','#c1e9ff']]:b.kind==='wd'?[['H / He 包层','#d9e9ff'],['C / O 简并内核','#a5bad7']]:(b.layers||STAR_TYPES[b.type].layers).map(layer=>[layer.name,layer.color]);
  $('info-layers').replaceChildren(...layers.map(([name,color])=>{const chip=document.createElement('span');chip.textContent=name;chip.style.setProperty('--color',color);return chip;}));
  $('info-evolution').textContent=b.kind==='star'?`${b.mass>=8?'距核心坍缩':'距白矮星阶段'}约 ${Math.max(0,Math.ceil((b.mass>=8?b.collapseAt:300)-b.age))} 秒`:b.kind==='ns'?'持续吸积并产生 X 射线暴；多余物质由喷流排出，不因吸积坍缩。':b.kind==='wd'?'吸积至 1.4 M☉，触发 Ia 型超新星。':b.accretingId?'正缓慢剥离一颗恒星的物质。':'一次锁定一颗恒星吸积。';
}
function updateUi(){
  $('score').textContent=Math.floor(sim.score).toLocaleString('en-US');if(sim.score>best){best=Math.floor(sim.score);try{localStorage.setItem(storageKey+'-best',String(best));}catch{}}$('best').textContent=best.toLocaleString('en-US');$('timer').textContent=timeText(sim.time);
  const next=STAR_TYPES[sim.nextType];$('next-type').textContent=next.type;$('next-type').style.color=next.color;$('next-mass').textContent=`${massText(next.mass)} M☉`;
  const mass=sim.state==='ready'?0:Math.max(0,...sim.bodies.filter(b=>b.kind==='bh').map(b=>b.mass));$('bh-mass').textContent=massText(mass);$('mass-progress').style.width=`${clamp(mass/PHYSICS.winningMass*100,0,100)}%`;
  $('field-status').textContent={ready:'等待投放',playing:'同类合成 · 不同类型碰撞',paused:'已暂停',won:'星系正在形成',lost:'观测结束'}[sim.state];$('body-count').textContent=`${sim.bodies.length} 天体`;
  $('ready-overlay').hidden=sim.state!=='ready';$('pause').disabled=!['playing','paused'].includes(sim.state);$('pause').innerHTML=sim.state==='paused'?'<span aria-hidden="true">▷</span> 继续':'<span aria-hidden="true">Ⅱ</span> 暂停';$('pause').setAttribute('aria-label',sim.state==='paused'?'继续游戏':'暂停游戏');
  $('danger').hidden=sim.state!=='playing'||sim.danger<.12;
  const cinema=sim.state==='won'&&!renderer.isCinematicDone;$('cinema-caption').hidden=!cinema;$('state-overlay').hidden=!['paused','lost'].includes(sim.state)&&!(sim.state==='won'&&!cinema);
  if(!$('state-overlay').hidden){const paused=sim.state==='paused',won=sim.state==='won';$('state-title').textContent=paused?'已暂停':won?'一整个星系，由你诞生。':'星场满了，再试一次。';$('state-detail').textContent=paused?'恒星、物质与时间，都在等待。':won?'黑洞种子跨越亿万年，成为星系的心脏。':'在警戒线下留一点空间，让同类恒星相遇。';$('state-action').textContent=paused?'继续游戏':'重新开始';$('end-stats').className='end-stats';$('end-stats').innerHTML=paused?'':`<div><span>得分</span><strong>${Math.floor(sim.score).toLocaleString('en-US')}</strong></div><div><span>用时</span><strong>${timeText(sim.time)}</strong></div>${won?`<div><span>时间奖励</span><strong>+${sim.stats.timeBonus}</strong></div>`:''}`;}
  if(sim.state==='won'&&!wonBefore){selectedId=null;$('body-info').hidden=true;wonBefore=true;}updateInfo();
}
let previous=performance.now(),accumulator=0,lastUi=0;
function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;if(sim.state==='playing'||sim.state==='won'){accumulator+=dt;while(accumulator>=1/60){sim.update(1/60);accumulator-=1/60;}}else accumulator=0;renderer.render(sim.state==='paused'?0:dt);if(now-lastUi>150){lastUi=now;updateUi();}requestAnimationFrame(frame);}
applySettings();updateUi();requestAnimationFrame(frame);
