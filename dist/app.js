import { Simulation, STAR_TYPES, PHYSICS, spectralOf, oSubclass, O_TYPE, stellarLayers, stellarPhase } from './simulation.js?v=3.1.0';
import { Renderer } from './renderer.js?v=3.1.0';
import { HoldDrop } from './hold-drop.js?v=3.1.0';
import { t, setLang, name } from './i18n.js?v=3.1.0';
const $=id=>document.getElementById(id),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pad=n=>String(Math.floor(n)).padStart(2,'0'),timeText=n=>`${pad(n/60)}:${pad(n%60)}`;
const massText=n=>n<10?n.toFixed(2):Math.round(n).toLocaleString('en-US');
const storageKey='stellar-forge-v2';
const icon=(name,label)=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg><span>${label}</span>`;
let best=0,settings={lang:'en',sound:false,layers:true,lensing:true,quality:!matchMedia('(max-width: 640px)').matches,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};
try{best=Number(localStorage.getItem(storageKey+'-best'))||0;settings={...settings,...JSON.parse(localStorage.getItem(storageKey+'-settings')||'{}')};}catch{}
let renderer,mode='drop',selectedId=null,activePointer=null,restoreAfterOptions=false,toastTimer,audioContext,wonBefore=false;
const sim=new Simulation({onEvent:event=>{renderer?.event(event);playSound(event.kind);if(event.kind==='supernova')toast(t(event.variant==='Ia'?'supernovaIa':'supernova'));if(event.kind==='inspiral')toast(t('inspiral.'+event.variant));}});
renderer=new Renderer($('universe'),sim);
const hold=new HoldDrop(x=>{if(sim.state==='playing'&&mode==='drop')sim.drop(x);});
function cancelHold(){activePointer=null;hold.cancel();}
export { sim, renderer };
function playSound(kind){
  if(!settings.sound||!['merge','supernova','wave','burst','inspiral'].includes(kind))return;
  if(kind==='inspiral'){try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime,T=PHYSICS.compactMergerDuration;
    // Gravitational-wave chirp: frequency sweeps up as (t_c − t)^−3/8.
    osc.type='sine';osc.frequency.setValueAtTime(32,t);for(let i=1;i<=24;i++){const f=i/24;osc.frequency.linearRampToValueAtTime(Math.min(420,32*Math.pow(Math.max(.002,1-f*.998),-.375)),t+f*T);}
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.02,t+.4);gain.gain.exponentialRampToValueAtTime(.05,t+T*.98);gain.gain.exponentialRampToValueAtTime(.0001,t+T+.08);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+T+.1);}catch{}return;}
  try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime,duration=kind==='supernova'?1.6:kind==='wave'?1:.2;osc.type=kind==='wave'?'sine':kind==='supernova'?'triangle':'sine';osc.frequency.setValueAtTime({merge:360,supernova:55,wave:100,burst:680}[kind],t);osc.frequency.exponentialRampToValueAtTime(kind==='merge'?650:22,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.035,t+.02);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+duration);}catch{}
}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2400);}
function reset(){cancelHold();selectedId=null;renderer.selectedId=null;renderer.reset();sim.restart();wonBefore=false;setMode('drop');updateUi();}
function start(){renderer.reset();sim.start();updateUi();$('universe').focus({preventScroll:true});}
function togglePause(){cancelHold();if(['playing','paused'].includes(sim.state)){sim.togglePause();updateUi();}}
function setMode(next){cancelHold();mode=next;renderer.inspectMode=next==='inspect';$('mode').setAttribute('aria-pressed',next==='inspect');$('mode').innerHTML=next==='inspect'?icon('drop',t('drop')):icon('scope',t('inspect'));$('universe').style.cursor=next==='inspect'?'help':'crosshair';if(next==='drop'){selectedId=null;renderer.selectedId=null;$('body-info').hidden=true;}}
$('start').onclick=start;$('pause').onclick=togglePause;$('mode').onclick=()=>{setMode(mode==='drop'?'inspect':'drop');if(mode==='inspect')toast(t('inspectHint'));};
$('restart').onclick=()=>{reset();start();};
$('state-action').onclick=()=>{if(sim.state==='paused')togglePause();else{reset();start();}};
$('info-close').onclick=()=>{selectedId=null;renderer.selectedId=null;$('body-info').hidden=true;};
$('settings-open').onclick=()=>{cancelHold();restoreAfterOptions=sim.state==='playing';if(restoreAfterOptions)sim.togglePause();$('settings-dialog').showModal();updateUi();};
$('settings-close').onclick=()=>$('settings-dialog').close();
$('settings-dialog').addEventListener('close',()=>{if(restoreAfterOptions&&sim.state==='paused')sim.togglePause();restoreAfterOptions=false;updateUi();});
$('settings-dialog').addEventListener('click',e=>{if(e.target!==$('settings-dialog'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();});
// Static text carries data-i18n hooks: text, inner HTML, aria-label and title.
function applyLanguage(){
  setLang(settings.lang);const all=sel=>[...(document.querySelectorAll?.(sel)??[])];
  if(document.documentElement)document.documentElement.lang=settings.lang==='zh'?'zh-CN':'en';document.title=t('docTitle');
  all('meta[name="description"]').forEach(el=>el.setAttribute('content',t('metaDesc')));
  all('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));all('[data-i18n-html]').forEach(el=>el.innerHTML=t(el.dataset.i18nHtml));
  all('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));all('[data-i18n-title]').forEach(el=>el.setAttribute('title',t(el.dataset.i18nTitle)));
  setMode(mode);
}
function applySettings(){renderer.showLayers=settings.layers;renderer.showLensing=settings.lensing;renderer.setQuality(settings.quality?'high':'low');renderer.setReducedMotion(settings.motion);for(const key of Object.keys(settings)){const el=$('setting-'+key);if(key==='lang')el.value=settings.lang;else el.checked=settings[key];}applyLanguage();try{localStorage.setItem(storageKey+'-settings',JSON.stringify(settings));}catch{}}
for(const key of Object.keys(settings))$('setting-'+key).onchange=e=>{settings[key]=key==='lang'?e.target.value:e.target.checked;applySettings();updateUi();if(key==='sound'&&settings.sound)playSound('merge');};
function point(event){const r=$('universe').getBoundingClientRect(),x=(event.clientX-r.left)*$('universe').width/r.width,y=(event.clientY-r.top)*$('universe').height/r.height;return{x:(x-renderer.offsetX)/renderer.scale,y:(y-renderer.offsetY)/renderer.scale};}
$('universe').addEventListener('pointermove',e=>{renderer.pointerX=clamp(point(e).x,42,658);});
$('universe').addEventListener('pointerdown',e=>{
  if(e.button!==0||activePointer!==null)return;const p=point(e);if(p.y<0||p.y>sim.height)return;renderer.pointerX=clamp(p.x,42,658);
  if(mode==='inspect'||e.shiftKey){const body=[...sim.bodies].reverse().find(b=>Math.hypot(b.x-p.x,b.y-p.y)<b.radius+10);if(body){selectedId=body.id;renderer.selectedId=body.id;updateInfo();}return;}
  if(sim.state==='playing'){activePointer=e.pointerId;hold.begin(e.pointerId,renderer.pointerX);$('universe').setPointerCapture?.(e.pointerId);}
});
$('universe').addEventListener('pointermove',e=>hold.move(e.pointerId,renderer.pointerX));
$('universe').addEventListener('pointerup',e=>{if(activePointer===null||e.pointerId!==activePointer)return;renderer.pointerX=clamp(point(e).x,42,658);hold.end(e.pointerId,renderer.pointerX);activePointer=null;updateUi();});
$('universe').addEventListener('pointercancel',cancelHold);
$('universe').addEventListener('lostpointercapture',cancelHold);
$('universe').addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{
  if($('settings-dialog').open||['BUTTON','INPUT','A','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')renderer.pointerX=clamp(renderer.pointerX-25,42,658);
  if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')renderer.pointerX=clamp(renderer.pointerX+25,42,658);
  if(e.code==='Space'&&!e.repeat){if(sim.state==='ready')start();else if(sim.state==='playing'&&mode==='drop')sim.drop(renderer.pointerX);}
  if(e.key.toLowerCase()==='p'&&!e.repeat)togglePause();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelHold();restoreAfterOptions=false;if(sim.state==='playing')sim.togglePause();updateUi();}});
new ResizeObserver(()=>renderer.resize()).observe($('canvas-wrap'));
function updateInfo(){
  const b=sim.bodies.find(b=>b.id===selectedId);$('body-info').hidden=!b;if(!b){selectedId=null;renderer.selectedId=null;return;}
  $('info-name').textContent=b.kind==='star'?t('typeName',{type:spectralOf(b).type,name:name(spectralOf(b).name)}):t(b.kind);$('info-mass').textContent=`${massText(b.mass)} M☉`;$('info-swatch').style.setProperty('--c',b.kind==='star'?spectralOf(b).color:{bh:'#ffcf8a',ns:'#8fe0ff',wd:'#e6eeff'}[b.kind]);
  const fixed=list=>list.map(([key,color])=>[t('layer.'+key),color]);
  const layers=b.kind==='bh'?fixed([['horizon','#6a5a86'],['photonRing','#ffe6c0'],['disk','#ffb062'],['lens','#a99cff']]):b.kind==='ns'?fixed([['crust','#a3d7f7'],['innerCrust','#7fc8f0'],['core','#c8f4ff'],['beam','#8fe0ff']]):b.kind==='wd'?fixed([['wdEnvelope','#d9e9ff'],['wdCore','#a5bad7']]):stellarLayers(b).map(layer=>[`${name(layer.name)} · ${Math.round(layer.fraction*100)}%`,layer.color]);
  $('info-layers').replaceChildren(...layers.map(([name,color])=>{const chip=document.createElement('span');chip.textContent=name;chip.style.setProperty('--color',color);return chip;}));
  const phase=b.kind==='star'?stellarPhase(b):null,stage=!phase?'':phase.late>0?t(phase.massive?'stageLateMassive':b.mass<0.35?'stageLateDwarf':'stageGiant'):t('stageMain',{p:Math.round(phase.mainSequence*100)});
  $('info-evolution').textContent=b.kind==='star'?`${stage}${b.type===O_TYPE?t('oNext'+oSubclass(b.mass)):''}${t(b.mass>=8?'toCollapse':'toDwarf',{s:Math.max(0,Math.ceil((b.mass>=8?b.collapseAt:300)-b.age))})}`:b.kind==='ns'?t(b.mergingWith?(sim.bodies.find(o=>o.id===b.mergingWith)?.kind==='bh'?'nsFalling':'nsBinary'):'nsFeeding'):b.kind==='wd'?t(b.mergingWith?'wdShredded':'wdFeeding'):t(b.mergingWith?'bhMerging':b.accretingId?'bhFeeding':'bhIdle');
}
function updateUi(){
  $('score').textContent=Math.floor(sim.score).toLocaleString('en-US');if(sim.score>best){best=Math.floor(sim.score);try{localStorage.setItem(storageKey+'-best',String(best));}catch{}}$('best').textContent=best.toLocaleString('en-US');$('timer').textContent=timeText(sim.time);
  const next=STAR_TYPES[sim.nextType];$('next-type').textContent=next.type;$('next-type').style.setProperty('--c',next.color);$('next-mass').textContent=`${massText(next.mass)} M☉`;
  const mass=sim.state==='ready'?0:Math.max(0,...sim.bodies.filter(b=>b.kind==='bh').map(b=>b.mass));$('bh-mass').textContent=massText(mass);$('mass-progress').style.width=`${clamp(mass/PHYSICS.winningMass*100,0,100)}%`;
  $('field-status').textContent=t('status.'+sim.state);$('body-count').textContent=t('bodies',{n:sim.bodies.length});
  $('ready-overlay').hidden=sim.state!=='ready';$('pause').disabled=!['playing','paused'].includes(sim.state);$('pause').innerHTML=sim.state==='paused'?icon('play',t('resume')):icon('pause',t('pause'));$('pause').setAttribute('aria-label',t(sim.state==='paused'?'resumeAria':'pauseAria'));
  $('danger').hidden=sim.state!=='playing'||sim.danger<.12;
  const cinema=sim.state==='won'&&!renderer.isCinematicDone;$('cinema-caption').hidden=!cinema;$('state-overlay').hidden=!['paused','lost'].includes(sim.state)&&!(sim.state==='won'&&!cinema);
  if(!$('state-overlay').hidden){const paused=sim.state==='paused',won=sim.state==='won';$('state-title').textContent=t(paused?'paused':won?'won':'lost');$('state-detail').textContent=t(paused?'pausedDetail':won?'wonDetail':'lostDetail');$('state-action').textContent=t(paused?'resume':'playAgain');$('end-stats').className='end-stats';$('end-stats').innerHTML=paused?'':`<div><span>${t('score')}</span><strong>${Math.floor(sim.score).toLocaleString('en-US')}</strong></div><div><span>${t('time')}</span><strong>${timeText(sim.time)}</strong></div>${won?`<div><span>${t('timeBonus')}</span><strong>+${sim.stats.timeBonus}</strong></div>`:''}`;}
  if(sim.state==='won'&&!wonBefore){selectedId=null;$('body-info').hidden=true;wonBefore=true;}updateInfo();
}
let previous=performance.now(),accumulator=0,lastUi=0;
function frame(now){const dt=Math.min(.1,(now-previous)/1000);previous=now;if(sim.state==='playing'&&mode==='drop')hold.update(dt);else hold.cancel();if(sim.state==='playing'||sim.state==='won'){accumulator+=dt;while(accumulator>=1/60){sim.update(1/60);accumulator-=1/60;}}else accumulator=0;renderer.render(sim.state==='paused'?0:dt);if(now-lastUi>150){lastUi=now;updateUi();}requestAnimationFrame(frame);}
applySettings();updateUi();requestAnimationFrame(frame);



