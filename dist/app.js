import { Simulation, STAR_TYPES } from './simulation.js';
import { Renderer } from './renderer.js';

const $ = id => document.getElementById(id);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const pad = n => Math.floor(n).toString().padStart(2,'0');
const timeText = n => `${pad(n / 60)}:${pad(n % 60)}`;
const massText = n => Number(n || 0).toFixed(n >= 100 ? 0 : 2);
const names = ['红矮星','橙矮星','黄矮星','黄白星','白色恒星','蓝白恒星','蓝色恒星'];
const colors = ['#ec7656','#efa256','#ead17b','#f3ebbc','#dceeff','#9ac8ff','#84a6ff'];
const temperatures = [3200,4400,5800,6800,9000,20000,36000];
let best = 0, settings = { sound:false, quality:true, layers:true, motion:matchMedia('(prefers-reduced-motion: reduce)').matches };
try { best = Number(localStorage.getItem('stellar-forge-best') || 0); settings = { ...settings, ...JSON.parse(localStorage.getItem('stellar-forge-settings') || '{}') }; } catch {}
let renderer, events=[], selectedType=2, selectedId=null, mode='drop', lastUi=0, endTime=null, currentState='ready', activePointer=null;
let audioContext, dialogPaused=false, toastTimer;
const sim = new Simulation({onEvent: handleEvent});
renderer = new Renderer($('universe'), sim);
function saveSettings(){ try{localStorage.setItem('stellar-forge-settings',JSON.stringify(settings));}catch{} }
function sound(kind){
  if(!settings.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audioContext.state==='suspended') audioContext.resume();
    const frequencies={drop:190,merge:390,supernova:45,wave:68,burst:690,evolve:180,win:520,lose:90};
    if(!(kind in frequencies))return;
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;
    const duration=kind==='supernova'?.65:kind==='wave'?.8:kind==='win'?1.2:.18;
    oscillator.type=['supernova','wave'].includes(kind)?'sawtooth':'sine';
    oscillator.frequency.setValueAtTime(frequencies[kind],t);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind]*(kind==='merge'?1.8:.4),t+duration);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(kind==='supernova'?.025:.045,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(t);oscillator.stop(t+duration);
  }catch{}
}
function handleEvent(event){
  if(event.silent)return;
  renderer?.event(event); sound(event.kind);
  if(event.kind==='drop')return;
  const defaults={merge:'新的恒星，在碰撞中诞生。',supernova:'超新星爆发，冲击波席卷星场。',wave:'致密天体合并，时空泛起涟漪。',accretion:'引力锁定目标，吸积开始。',burst:'中子星释放一次 X 射线暴。',evolve:'一颗恒星，走向生命的下一阶段。',win:'黑洞种子形成，失控吸积开始。',lose:'恒星越过警戒线，观测终止。'};
  const text=event.text || defaults[event.kind];
  if(text){events.unshift({text,time:sim?.time || 0,kind:event.kind});events=events.slice(0,4);renderLog();}
}
function renderLog(){
  $('event-log').replaceChildren(...events.map(event=>{const li=document.createElement('li'),dot=document.createElement('span'),body=document.createElement('div'),time=document.createElement('time');dot.className='event-dot';dot.style.background=event.kind==='supernova'?'#f3b27c':event.kind==='wave'?'#c4b8fc':'#b3d19a';body.textContent=event.text;time.textContent=`${timeText(event.time)} / ${event.kind.toUpperCase()}`;body.append(time);li.append(dot,body);return li;}));
}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function resetUi(){events=[];endTime=null;selectedId=null;renderer.selectedId=null;renderer.effects.length=0;renderer.particles.length=0;renderer.texts.length=0;renderer.cinematicTime=0;renderer.isCinematicDone=false;setMode('drop');handleEvent({kind:'ready',text:'新的宇宙，等待第一次碰撞。'});}
function start(){resetUi();sim.start();updateUi();$('universe').focus({preventScroll:true});}
function restart(){sim.restart();resetUi();updateUi();}
function setMode(value){mode=value;$('drop-mode').classList.toggle('active',mode==='drop');$('inspect-mode').classList.toggle('active',mode==='inspect');$('drop-mode').setAttribute('aria-pressed',mode==='drop');$('inspect-mode').setAttribute('aria-pressed',mode==='inspect');$('input-hint').textContent=mode==='drop'?'✦ 移动寻找落点 · 点击释放恒星':'◎ 点击一颗天体，查看内部结构与演化';$('universe').style.cursor=mode==='drop'?'crosshair':'help';renderer.inspectMode=mode==='inspect';}
function togglePause(){if(['playing','paused'].includes(sim.state)){sim.togglePause();updateUi();}}
function openDialog(id){
  dialogPaused=sim.state==='playing';if(dialogPaused)sim.togglePause();$(id).showModal();updateUi();
}
document.querySelectorAll('dialog').forEach(dialog=>{
  dialog.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{if(dialogPaused&&sim.state==='paused')sim.togglePause();dialogPaused=false;updateUi();});
});
$('start').onclick=start;$('pause').onclick=togglePause;
$('drop-mode').onclick=()=>setMode('drop');$('inspect-mode').onclick=()=>setMode('inspect');$('inspect-toggle').onclick=()=>{setMode('inspect');toast('点击场内天体，查看它的内部结构');};
$('guide-open').onclick=$('spectrum-guide').onclick=()=>openDialog('guide-dialog');
$('science-open').onclick=()=>{openDialog('guide-dialog');$('science-details').open=true;setTimeout(()=>$('science-details').scrollIntoView({block:'start'}),50);};
$('lab-open').onclick=()=>openDialog('lab-dialog');$('settings-open').onclick=()=>openDialog('settings-dialog');
$('state-action').onclick=()=>{if(sim.state==='paused')togglePause();else {restart();start();}};
$('lab-exit').onclick=()=>{restart();toast('已返回正式游戏，实验得分不会计入纪录');};
$('restart').onclick=()=>{dialogPaused=false;$('settings-dialog').close();restart();toast('观测已重置');};
document.querySelectorAll('[data-scenario]').forEach(button=>button.onclick=()=>{dialogPaused=false;$('lab-dialog').close();resetUi();sim.loadScenario(button.dataset.scenario);handleEvent({kind:'experiment',text:`实验已载入：${button.querySelector('h3').textContent}`});updateUi();$('universe').focus({preventScroll:true});});
function applySettings(){renderer.showLayers=settings.layers;renderer.setQuality(settings.quality?'high':'low');renderer.setReducedMotion(settings.motion);$('setting-layers').checked=settings.layers;$('setting-quality').checked=settings.quality;$('setting-motion').checked=settings.motion;$('sound').setAttribute('aria-label',settings.sound?'关闭音效':'开启音效');$('sound').title=settings.sound?'关闭音效':'开启音效';$('sound').querySelector('span').hidden=settings.sound;saveSettings();}
$('sound').onclick=()=>{settings.sound=!settings.sound;applySettings();sound('merge');toast(settings.sound?'音效已开启':'音效已关闭');};
for(const key of ['layers','quality','motion'])$('setting-'+key).onchange=event=>{settings[key]=event.target.checked;applySettings();};
function pointer(event){const rect=$('universe').getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width*sim.width,y:(event.clientY-rect.top)/rect.height*sim.height};}
$('universe').addEventListener('pointermove',event=>{renderer.pointerX=clamp(pointer(event).x,45,655);});
$('universe').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const p=pointer(event);renderer.pointerX=clamp(p.x,45,655);
  if(mode==='inspect'||event.shiftKey){const hit=[...sim.bodies].reverse().find(b=>Math.hypot(b.x-p.x,b.y-p.y)<=b.radius+9);if(hit){selectedId=hit.id;selectedType=hit.type;renderer.selectedId=hit.id;updateInspector();}else toast('点击天体本身，即可查看剖面');return;}
  if(sim.state==='playing'){activePointer=event.pointerId;$('universe').setPointerCapture?.(event.pointerId);}
});
$('universe').addEventListener('pointerup',event=>{if(activePointer===null||activePointer!==event.pointerId)return;activePointer=null;renderer.pointerX=clamp(pointer(event).x,45,655);if(sim.state==='playing'&&mode==='drop'){sim.drop(renderer.pointerX);updateUi();}});
$('universe').addEventListener('pointercancel',()=>{activePointer=null;});
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA','BUTTON','A','SUMMARY'].includes(event.target.tagName))return;
  if(['ArrowLeft','ArrowRight',' ','Spacebar'].includes(event.key))event.preventDefault();
  if(event.key==='ArrowLeft'||event.key.toLowerCase()==='a')renderer.pointerX=clamp(renderer.pointerX-26,45,655);
  if(event.key==='ArrowRight'||event.key.toLowerCase()==='d')renderer.pointerX=clamp(renderer.pointerX+26,45,655);
  if(event.code==='Space'&&!event.repeat){if(sim.state==='ready')start();else if(sim.state==='playing'&&mode==='drop')sim.drop(renderer.pointerX);}
  if(event.key.toLowerCase()==='p'&&!event.repeat)togglePause();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&sim.state==='playing'){sim.togglePause();updateUi();}});
new ResizeObserver(()=>renderer.resize()).observe($('canvas-wrap'));

function typeColor(i){return STAR_TYPES[i]?.color || colors[i] || '#b3d19a';}
for(let i=0;i<7;i++){
  const type=STAR_TYPES[i];const button=document.createElement('button');button.className='spectrum-item';button.title=`${type.type} 型 ${names[i]} · 查看结构`;button.innerHTML=`<span class="spectrum-ball" style="--color:${typeColor(i)}"></span>${type.type}`;button.onclick=()=>{selectedId=null;renderer.selectedId=null;selectedType=i;updateInspector();};$('spectrum').append(button);if(i<6){const arrow=document.createElement('span');arrow.className='spectrum-chevron';arrow.textContent='›';$('spectrum').append(arrow);}
  const item=document.createElement('div');item.className='guide-star';item.innerHTML=`<span class="spectrum-ball" style="--color:${typeColor(i)}"></span><strong>${type.type}</strong><small>${type.mass} M☉</small><span>${names[i]}</span>`;$('guide-spectrum').append(item);
}
function updateInspector(){
  const body=sim.bodies.find(b=>b.id===selectedId);if(selectedId&&!body){selectedId=null;renderer.selectedId=null;}
  const type=clamp(body?.type??selectedType,0,6),kind=body?.kind || 'star',spec=STAR_TYPES[type],mass=body?.mass??spec.mass;
  const descriptors={star:['主序星',names[type],spec.type],bh:['致密遗骸','黑洞','BH'],ns:['致密遗骸','中子星','NS'],wd:['致密遗骸','白矮星','WD']};
  const [badge,name,code]=descriptors[kind];const impending=kind==='star'&&body&&mass>=8&&body.collapseAt-body.age<5;
  $('inspector-code').textContent=code;$('inspector-code').style.color=kind==='bh'?'#e9be7a':kind==='ns'?'#95e4f5':typeColor(type);$('inspector-name').textContent=name;$('inspector-badge').textContent=impending?'临终燃烧':badge;
  $('inspector-mass').innerHTML=`${massText(mass)} <small>M☉</small>`;
  $('temperature-label').textContent=kind==='star'?'表面温度 · 参考':kind==='bh'?'史瓦西半径':kind==='ns'?'中子星半径':'爆炸临界质量';
  $('inspector-temp').innerHTML=kind==='star'?`${temperatures[type].toLocaleString()} <small>K</small>`:kind==='bh'?`${(mass*2.95).toFixed(1)} <small>km</small>`:kind==='ns'?'≈ 12 <small>km</small>':'1.40 <small>M☉</small>';
  $('star-age').textContent=body?`年龄 ${timeText(body.age)}`:'示意剖面';
  const layers=kind==='bh'?[['事件视界','#070a09','rₛ ∝ M'],['吸积盘','#e4b370','等离子体'],['引力透镜','#e6ddba','弯曲光路']]:kind==='ns'?[['固态外壳','#d4edff','富中子核'],['中子内层','#7cb7ed','n'],['致密核心','#9a91df','简化模型']]:kind==='wd'?[['薄层包壳','#eff4ff','H / He'],['简并内核','#a8c7ef','C / O']]:impending?[['外层包壳','#dd8f50','H / He'],['燃烧壳层','#efc16c','C / O / Si'],['致密铁核','#e4e7e1','Fe']]:type===0?[['全对流包层','#e98755','H / He'],['聚变核心','#f5c88b','H → He']]:type>=4?[['辐射包层',typeColor(type),'H / He'],['对流核心','#f2d7a5','H → He']]:[['对流包层',typeColor(type),'H / He'],['辐射内层','#e5a653','H / He'],['聚变核心','#f4dfb3','H → He']];
  $('layers').replaceChildren(...layers.map(([name,color,element])=>{const row=document.createElement('div');row.className='layer';row.innerHTML=`<span class="swatch" style="--layer-color:${color}"></span><span>${name}</span><span class="element">${element}</span>`;return row;}));
  const descriptions={star:['低温而长寿的小恒星。内部强烈对流，让氢燃料得到充分混合。','温暖的橙色主序星。它比太阳更小，燃料消耗也更缓慢。','核心的氢聚变成氦。你熟悉的太阳，就属于这一类恒星。','更明亮的黄白色恒星。合成阶位越高，距离坍缩也越近。','炽热的白色恒星。内部主要由氢与氦构成，能量向外输运。','高质量恒星的燃料消耗很快。留意倒计时，坍缩将留下中子星。','继续合并同类 O 型星，突破 25 M☉ 门槛，孕育黑洞。'][type],bh:'单次锁定一颗恒星，将物质剥离成吸积流。与另一个黑洞相遇，会释放引力波。',ns:'吸积的氢与氦在表面积累，定期热核闪燃产生 X 射线暴。并合可形成黑洞。',wd:'恒星熄灭后的简并遗骸。吸积接近 1.4 M☉，将发生摧毁自身的 Ia 型超新星。'};
  $('inspector-description').textContent=impending?'燃料耗尽前的短暂晚期：氢、氦与更重元素形成分层，铁核即将坍缩。':descriptions[kind];
  const orb=$('inspector-orb');orb.style.background=kind==='bh'?'radial-gradient(circle,#030504 48%,#a5763b 52%,#efd197 55%,#392b1b 62%,#080d09 69%)':`radial-gradient(circle at 35% 30%,#fff7da,${kind==='ns'?'#96e5ff':kind==='wd'?'#d5e2ff':typeColor(type)} 43%,#42442e 100%)`;
  orb.style.boxShadow=`0 0 38px ${kind==='bh'?'#e5b66e22':kind==='ns'?'#90ddff44':typeColor(type)+'33'}`;
  $('cutaway').style.display=kind==='bh'?'none':'block';
  $('cutaway').style.background=`radial-gradient(circle,${layers[layers.length-1][1]} 0 24%,${layers[Math.max(0,layers.length-2)][1]} 25% 63%,${layers[0][1]} 64% 100%)`;
  $('evolution-progress').textContent=body?(kind==='star'?`距${mass>=8?'核心坍缩':'白矮星阶段'}约 ${Math.max(0,Math.ceil((mass>=8?body.collapseAt:300)-body.age))} 秒 · 游戏时间尺度`:body.accretingId?'正在吸积一颗恒星 · 单目标锁定':kind==='bh'?`距失控吸积还需 ${massText(Math.max(0,40-mass))} M☉`:'正在等待附近的恒星燃料'):'观测模式下点击场内恒星，追踪它的演化。';
}
function updateUi(){
  const state=sim.state, lab=!!sim.isLab;
  $('score').textContent=Math.floor(sim.score).toString().padStart(6,'0');
  if(!lab&&sim.score>best){best=Math.floor(sim.score);try{localStorage.setItem('stellar-forge-best',String(best));}catch{}}
  $('best').textContent=best.toString().padStart(6,'0');$('timer').textContent=timeText(sim.time);$('merges').innerHTML=`${pad(sim.stats?.merges||0)}<span> 次</span>`;$('lab-tag').hidden=!lab;
  const next=STAR_TYPES[sim.nextType] || STAR_TYPES[0];$('next-name').textContent=`${next.type} 型${names[sim.nextType]||names[0]}`;$('next-mass').textContent=`${massText(next.mass)} M☉`;$('next-orb').style.setProperty('--star',next.color);
  const blackHoles=sim.bodies.filter(b=>b.kind==='bh'),bhMass=Math.max(0,...blackHoles.map(b=>b.mass));$('bh-mass').textContent=`${massText(bhMass)} M☉`;$('mass-progress').style.width=`${Math.min(100,bhMass/40*100)}%`;
  $('body-count').textContent=`${pad(sim.bodies.length)} 个天体`;$('field-status').textContent=lab?'实验模式 · 不计纪录':{ready:'等待点火',playing:'引力场稳定运行',paused:'时间已暂停',won:'失控吸积 · 星系诞生',lost:'观测已结束'}[state];$('arena-title').textContent=lab?'天体物理实验室':'恒星孕育场';
  $('ready-overlay').hidden=state!=='ready';$('pause').textContent=state==='paused'?'▷':'Ⅱ';$('pause').setAttribute('aria-label',state==='paused'?'继续游戏':'暂停游戏');$('pause').disabled=!['playing','paused'].includes(state);
  $('danger').hidden=state!=='playing'||!sim.bodies.some(b=>(b.dangerTime||0)>.25);
  if(state!==currentState){if(state==='won'||state==='lost')endTime=performance.now();currentState=state;}
  const cinematic=state==='won'&&!renderer.isCinematicDone;
  $('cinema-caption').hidden=!cinematic;$('state-overlay').hidden=!['paused','lost'].includes(state)&&!(state==='won'&&!cinematic);
  if(!$('state-overlay').hidden){
    $('state-eyebrow').textContent=state==='paused'?'OBSERVATION PAUSED':state==='won'?'A GALAXY IS BORN':'OBSERVATION COMPLETE';
    $('state-title').textContent=state==='paused'?'宇宙，稍作停留。':state==='won'?'你，点亮了一整个星系。':'星场满了，故事还没结束。';
    $('state-detail').textContent=state==='paused'?'所有恒星的演化与运动均已暂停。':state==='won'?(lab?'实验完成。正式模式的旅程，等你开始。':'从一颗小小的恒星，到吞吐星光的宇宙心脏。'):'恒星越过警戒线超过 3 秒。试试留下更多碰撞空间。';
    $('state-action').innerHTML=state==='paused'?'继续观测 <span>→</span>':'开启新的宇宙 <span>↗</span>';
    $('end-stats').className='end-stats';$('end-stats').innerHTML=state==='paused'?'':`<div><span>最终得分${lab?' · 实验':''}</span><strong>${Math.floor(sim.score)}</strong></div><div><span>观测用时</span><strong>${timeText(sim.time)}</strong></div>${state==='won'?`<div><span>时间奖励</span><strong>+${sim.stats?.timeBonus||0}</strong></div>`:''}`;
    $('lab-exit').hidden=!lab;
  }
  updateInspector();
}
let previous=performance.now(),accumulator=0;
function frame(now){
  const elapsed=Math.min(.1,(now-previous)/1000);previous=now;
  if(sim.state==='playing'||sim.state==='won'){accumulator+=elapsed;while(accumulator>=1/60){sim.update(1/60);accumulator-=1/60;}}else accumulator=0;
  renderer.render(sim.state==='paused'?0:elapsed);
  if(now-lastUi>120){updateUi();lastUi=now;}
  requestAnimationFrame(frame);
}
applySettings();updateUi();requestAnimationFrame(frame);
