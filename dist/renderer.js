import { STAR_TYPES, PHYSICS, gravityAt, spectralOf, oSubclass, O_TYPE, stellarLayers } from './simulation.js?v=3.1.0';
import { LensingPass } from './optics.js?v=3.1.0';
import { t } from './i18n.js?v=3.1.0';
import { CRITICAL_B } from './vendor/bruneton/geodesic.js';
const W=700,H=820,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=t=>1-Math.pow(1-clamp(t,0,1),3);
export const FONT='"Segoe UI Variable Display","Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
/* One visual language: every hot thing follows a blackbody ramp, nebular gas
 * glows in Hα (rose) and [O III] (teal), compact-object light is cyan/gold.
 * Ramps run bright → dark; with additive blending darker means fainter. */
const RAMPS=[
  ['#ffffff','#fff6e2','#ffe4b0','#ffc878','#ffa04c','#f47232','#cf4a22','#8e2c18','#4a160c','#1c0804'], // 0 heat
  ['#ffffff','#e4fbff','#b0eeff','#74d6ff','#40a6f0','#2a70c4','#1c4a8c','#123060','#0a1c3a','#040c1a'], // 1 jet / x-ray
  ['#ffd6de','#ffa4b6','#ff7090','#ea4a72','#bb3258','#8a2244','#5c1630','#380c1e','#1e0610','#0c0206'], // 2 Hα
  ['#dcfff8','#a6f6ea','#6ce6d8','#3ccabe','#26a0a0','#1a7478','#124e54','#0c3236','#061c1e','#020a0c'], // 3 [O III]
  ['#ffffff','#eef2ff','#ccd8ff','#a6b8ff','#8a92ff','#6c6ae8','#4e48b8','#322c80','#1c184a','#0a0820'], // 4 hot-star blue
];
const NS_COLOR='#8fe0ff',WD_COLOR='#e6eeff',BH_LIGHT='#ffc982';
function random(seed){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=n+Math.imul(n^n>>>7,61|n)^n;return((n^n>>>14)>>>0)/4294967296;};}
function massLabel(m){return m<1?m.toFixed(2).replace(/0$/,''):m<10?m.toFixed(1).replace(/\.0$/,''):Math.round(m).toLocaleString('en-US');}
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
const sparkRamp=type=>type>=4?4:0;
// Young-remnant emission colours each ejected element shifts toward as it cools.
const EMISSION={H:'#ff5c7a','H→He':'#ff5c7a','He/H':'#ff8fa6',He:'#ffd9a8','C/O':'#ffb06a','O/Ne':'#5fe3d2',Si:'#ff8a5a','Si/S':'#ff8a5a',Fe:'#c08cff','Ni/Fe':'#c08cff'};
// Particle ramp per element so sparks match their shell: Hα, heat, [O III], violet, x-ray blue.
const ELEMENT_RAMP={H:2,'H→He':2,'He/H':2,He:0,'C/O':0,'O/Ne':3,Si:4,'Si/S':4,Fe:1,'Ni/Fe':1};
function mixHex(a,b,t){const p=parseInt(a.slice(1),16),q=parseInt(b.slice(1),16),k=clamp(t,0,1),ch=s=>Math.round(((p>>s)&255)+((((q>>s)&255)-((p>>s)&255))*k));return'#'+((ch(16)<<16)|(ch(8)<<8)|ch(0)).toString(16).padStart(6,'0');}
// O subclasses (O9V/O6V/O3V) get their own hotter photospheres after the WD/NS slots.
const texIndex=b=>b.kind==='wd'?7:b.type===O_TYPE?[6,9,10][oSubclass(b.mass)]:b.type;
const oRank=b=>b.kind==='star'&&b.type===O_TYPE?oSubclass(b.mass):0;
export class Renderer{
  constructor(canvas,simulation){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.sim=simulation;
    this.optics=new LensingPass();this.images={};this.headless=typeof Image==='undefined';
    if(!this.headless)for(let i=0;i<11;i++){const img=new Image();img.src=new URL('./assets/star-'+i+'.png',import.meta.url).href;this.images['star-'+i]=img;}
    canvas.setAttribute?.('data-optics-mode',this.optics.mode);
    this.quality='high';this.reducedMotion=false;this.showLayers=true;this.showLensing=true;this.pointerX=350;this.selectedId=null;this.inspectMode=false;
    this.time=0;this.particles=[];this.effects=[];this.emitters=[];this.popups=[];this.flowCarry=new Map();this.diskLevel=new Map();this.pops=new Map();this.trails=new Map();this.chirps=new Map();
    this.cinematicTime=0;this.isCinematicDone=false;this.lastState=simulation.state;this.rng=random(171019);this.shake=0;this.flash=0;this.flashColor='#fff1dc';
    this.sprites=new Map();this.buckets=RAMPS.flatMap(()=>Array.from({length:10},()=>[]));
    this.galaxy=Array.from({length:1800},(_,i)=>{const r=Math.pow(this.rng(),.7),arm=i%2,core=r<.16;return{r,angle:arm*Math.PI+Math.log(r+.05)*2.6+(this.rng()-.5)*(.35+r*.5),z:(this.rng()-.5)*.08*(1-r),a:.25+this.rng()*.75,tone:core?0:this.rng()<.08?2:this.rng()<.55?1:3,size:this.rng()<.06?2:1};});
    this.resize();
  }
  get particleLimit(){return this.quality==='low'?1100:2600;}
  resize(){const r=this.canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,this.quality==='low'?1.5:2);this.canvas.width=Math.max(1,Math.round((r.width||W)*d));this.canvas.height=Math.max(1,Math.round((r.height||H)*d));this.scale=Math.min(this.canvas.width/W,this.canvas.height/H);this.offsetX=(this.canvas.width-W*this.scale)/2;this.offsetY=(this.canvas.height-H*this.scale)/2;this.ctx.imageSmoothingEnabled=true;this.ctx.imageSmoothingQuality='high';}
  setQuality(value){this.quality=value==='low'?'low':'high';this.resize();}
  setReducedMotion(value){this.reducedMotion=!!value;this.shake=0;this.flash=0;}
  reset(){this.particles.length=0;this.effects.length=0;this.emitters.length=0;this.popups.length=0;this.flowCarry.clear();this.pops.clear();this.trails.clear();this.chirps.clear();this.cinematicTime=0;this.isCinematicDone=false;this.shake=0;this.flash=0;this.lastState=null;}

  /* ---------- cached light sprites ---------- */
  _canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  _cached(key,make){if(this.headless)return null;let s=this.sprites.get(key);if(!s){try{s=make();}catch{s=null;}this.sprites.set(key,s);}return s;}
  _glowSprite(color){return this._cached('g'+color,()=>{const s=this._canvas(128,128),g=s.getContext('2d'),grad=g.createRadialGradient(64,64,0,64,64,64);
    // Approximates a 1/(1+r²) point-spread halo — the same glow as the background stars.
    for(const [t,a] of [[0,1],[.06,.82],[.14,.5],[.26,.24],[.42,.1],[.62,.035],[1,0]])grad.addColorStop(t,rgba(color,a));g.fillStyle=grad;g.fillRect(0,0,128,128);return s;});}
  _spikeSprite(color){return this._cached('s'+color,()=>{const s=this._canvas(256,256),g=s.getContext('2d');g.globalCompositeOperation='lighter';
    for(const [w,len,a] of [[1.4,128,.55],[4,90,.12]])for(const rot of [0,Math.PI/2]){g.save();g.translate(128,128);g.rotate(rot+Math.PI/4);const grad=g.createLinearGradient(-len,0,len,0);grad.addColorStop(0,rgba(color,0));grad.addColorStop(.5,rgba(color,a));grad.addColorStop(1,rgba(color,0));g.fillStyle=grad;g.beginPath();g.moveTo(-len,0);g.lineTo(0,-w);g.lineTo(len,0);g.lineTo(0,w);g.closePath();g.fill();g.restore();}return s;});}
  _dotAtlas(){return this._cached('dots',()=>{const s=this._canvas(240,RAMPS.length*24),g=s.getContext('2d');RAMPS.forEach((ramp,r)=>ramp.forEach((color,i)=>{const x=i*24+12,y=r*24+12,grad=g.createRadialGradient(x,y,0,x,y,12);grad.addColorStop(0,rgba(color,1));grad.addColorStop(.25,rgba(color,.7));grad.addColorStop(.6,rgba(color,.16));grad.addColorStop(1,rgba(color,0));g.fillStyle=grad;g.fillRect(i*24,r*24,24,24);}));return s;});}
  _glow(x,y,radius,color,alpha){if(alpha<=.003||radius<=0)return;const s=this._glowSprite(color);if(!s)return;const c=this.ctx;c.globalAlpha=Math.min(1,alpha);c.drawImage(s,x-radius,y-radius,radius*2,radius*2);c.globalAlpha=1;}
  _spikes(x,y,size,color,alpha,angle=0){const s=this._spikeSprite(color);if(!s||alpha<=.003)return;const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha=Math.min(1,alpha);c.drawImage(s,-size,-size,size*2,size*2);c.restore();}

  /* ---------- events ---------- */
  event(ev){
    if(!ev||ev.silent)return;const x=ev.x??350,y=ev.y??410,power=ev.power||1,body=this.sim.bodies.find(b=>b.id===ev.bodyId);
    if(ev.kind==='supernova'){
      const ia=ev.variant==='Ia',color=ia?'#ffe2a8':'#a9b8ff';
      const r0=ev.ejectaRadius||30;
      this.effects.push({kind:'shock',x,y,age:0,duration:14,radius:ev.radius||320,power,color,ia,r0});
      if(ev.layers?.length)this._layeredEjecta(x,y,r0,ev.layers,ia);
      else{this.emitters.push({kind:'ejecta',x,y,age:0,duration:3.2,carry:0,rate:this.quality==='low'?70:160,radius:r0,power});this._burst(x,y,this.quality==='low'?110:260,r0,power,'ejecta');}
      for(const m of ev.ejecta||[])this._burst(m.x,m.y,Math.min(150,m.radius*2),m.radius,power,'ejecta');
      if(!ia)this.effects.push({kind:'bounce',x,y,age:0,duration:1.6,r:r0});
      if(ev.layers?.length)this.effects.push({kind:'shells',x,y,age:0,duration:7.5,r:r0,layers:ev.layers,seed:this.rng()*100,ia});
      if(body?.kind==='bh')this.diskLevel.set(body.id,0);else if(body?.kind==='ns'){this.effects.push({kind:'pulse',x,y,age:0,duration:1.6,power,radius:140});this.effects.push({kind:'pwn',x,y,age:0,duration:14,bodyId:body.id});}
      if(!this.reducedMotion){this.shake=5;this.flash=.16;this.flashColor=ia?'#fff0d0':'#e4e8ff';}
    }else if(ev.kind==='wave'){
      // Coalescence: final strain burst, a white-hot flash and a ringdown on the remnant.
      const src=ev.source,r=body?.radius||30;
      this.effects.push({kind:'wave',x,y,age:0,duration:6,power});this.effects.push({kind:'flash',x,y,age:0,duration:1.6,power,color:src==='ns'?'#d8f6ff':'#fff0d8',size:260});
      this.effects.push({kind:'ringdown',x,y,age:0,duration:2.2,power,r,color:src==='ns'?NS_COLOR:BH_LIGHT,bodyId:ev.bodyId});
      if(src==='ns'||(src==='bhns'&&ev.disrupted)){this.effects.push({kind:'kilonova',x,y,age:0,duration:5,power});this._burst(x,y,this.quality==='low'?60:140,12,.9,'ejecta');}
      else if(src==='wd')this._burst(x,y,this.quality==='low'?50:120,16,.7,'plasma',4);
      if(src==='wd'||(src==='bhns'&&ev.disrupted)){const tilt=body?this._diskOf(body).tilt:0;this.effects.push({kind:'tde',x,y,age:0,duration:3.5,power,color:src==='wd'?'#dce8ff':NS_COLOR,r});this.effects.push({kind:'jetburst',x,y,age:0,duration:2.6,power,r,tilt,bodyId:ev.bodyId});}
      else this._burst(x,y,80,10,.4,'plasma',0);
      if(body)this.pops.set(body.id,this.time);
      if(ev.points)this._popup(x,y-r-14,`+${ev.points}`,'#ffd9a0',t(src==='ns'?'popup.ns':src==='wd'?'popup.wd':src==='bhns'?(ev.disrupted?'popup.nsShred':'popup.nsPlunge'):'popup.bh'));
      if(!this.reducedMotion){this.shake=Math.max(this.shake,src==='bh'?6:4);this.flash=Math.max(this.flash,.12);this.flashColor=src==='ns'?'#e0f6ff':'#fff2dc';}
    }else if(ev.kind==='inspiral'){
      this.effects.push({kind:'flash',x,y,age:0,duration:.9,power,color:'#fff0d8',size:120});
    }else if(ev.kind==='burst'){
      const angle=(body?.rotation||0)+.4,count=this.quality==='low'?30:70;
      for(let i=0;i<count;i++){const a=angle+(i%2?Math.PI:0)+(this.rng()-.5)*.14,speed=90+this.rng()*150;this._particle({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:2.7+this.rng(),kind:'jet',owner:ev.bodyId,ramp:1});}
      this.effects.push({kind:'pulse',x,y,age:0,duration:1.6,power,radius:ev.radius||190});
    }else if(ev.kind==='merge'){
      const type=body?.type??0,color=ev.color||STAR_TYPES[type].color,r=body?.radius||30;
      this._burst(x,y,this.quality==='low'?28:70,r*.5,.6,'plasma',sparkRamp(type));
      this.effects.push({kind:'fusion',x,y,age:0,duration:1,power,color,r});
      if(body)this.pops.set(body.id,this.time);
      if(ev.points)this._popup(x,y-r-6,`+${ev.points}`,color,type===O_TYPE&&ev.toClass?t('born',{c:ev.toClass}):ev.combo>1?t('combo',{n:ev.combo}):'');
    }else if(ev.kind==='evolve'){if(ev.variant==='planetary-nebula'){this._burst(x,y,90,20,.3,'smoke');this.effects.push({kind:'nebula',x,y,age:0,duration:7,power});}
    }else if(ev.kind==='accretion'&&ev.phase==='complete'){this.effects.push({kind:'flash',x,y,age:0,duration:.8,power,color:BH_LIGHT,size:90});
    }else if(ev.kind==='win'){this.cinematicTime=0;this.isCinematicDone=false;}
    if(this.effects.length>40)this.effects.shift();
  }
  // Sparks drawn from each shell, launched homologously (speed ∝ radius) in its own colour.
  _layeredEjecta(x,y,r0,layers,ia){
    const total=this.quality==='low'?110:260;let area=0;
    for(const l of layers){const a0=Math.sqrt(area);area+=l.fraction;const a1=Math.sqrt(Math.min(1,area));if(!ia&&l.el==='Fe')continue;const n=Math.round(total*l.fraction*1.2)+4,ramp=ELEMENT_RAMP[l.el]??0;
      for(let i=0;i<n;i++){const a=this.rng()*TAU,rel=a0+(a1-a0)*this.rng(),R=r0*.7*rel,sp=((ia?270:235)*rel+15)*(.85+.3*this.rng());
        this._particle({x:x+Math.cos(a)*R,y:y+Math.sin(a)*R,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:6+this.rng()*6,kind:'ejecta',ramp,layered:true,size:1+this.rng()*1.6});}}
  }
  _popup(x,y,text,color,sub=''){this.popups.push({x,y,text,sub,color,age:0,life:1.35});if(this.popups.length>8)this.popups.shift();}
  _particle(p){if(this.particles.length>=this.particleLimit)return;this.particles.push({x:p.x,y:p.y,vx:p.vx||0,vy:p.vy||0,age:0,life:p.life||4,kind:p.kind||'plasma',owner:p.owner??null,target:p.target??null,free:!!p.free,size:p.size||(1.2+this.rng()*1.6),hot:p.hot??1,ramp:p.ramp??0,layered:!!p.layered,neb:this.rng()<.58?2:3});}
  _burst(x,y,count,radius,power,kind,ramp=0){for(let i=0;i<count;i++){const a=this.rng()*TAU,r=Math.sqrt(this.rng())*radius,speed=(15+this.rng()*95)*Math.sqrt(power);this._particle({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:kind==='ejecta'?8+this.rng()*6:kind==='smoke'?9:1.2+this.rng()*1.6,kind,hot:this.rng()*.25+.75,ramp,size:kind==='smoke'?5+this.rng()*7:undefined});}}

  /* ---------- frame ---------- */
  render(dt=1/60){
    dt=Number.isFinite(dt)?clamp(dt,0,.06):0;if(this.sim.state==='paused')dt=0;if(this.lastState==='won'&&this.sim.state!=='won')this.reset();this.lastState=this.sim.state;this.time+=dt;
    this.compact=this.sim.bodies.filter(b=>b.kind!=='star');this.bodyMap=new Map(this.sim.bodies.map(b=>[b.id,b]));
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle='#03040a';c.fillRect(0,0,this.canvas.width,this.canvas.height);c.setTransform(this.scale,0,0,this.scale,this.offsetX,this.offsetY);
    this._advance(dt);this._advanceInspirals(dt);this._updateDisks(dt);this._background();
    if(this.sim.state==='won'){this.cinematicTime+=dt;this._cinematic();this.isCinematicDone=this.cinematicTime>=12;return;}
    c.save();if(!this.reducedMotion&&this.shake>.05)c.translate(Math.sin(this.time*71)*this.shake,Math.sin(this.time*103)*this.shake*.5);
    this._arena();
    c.globalCompositeOperation='lighter';this._particles(false);this._effects(false);this._halos();this._inspiralLight();c.globalCompositeOperation='source-over';
    for(const b of this.sim.bodies)if(b.kind==='star'||b.kind==='wd')this._star(b);
    for(const b of this.compact)if(b.kind==='ns')this._neutronStar(b);else if(b.kind==='bh')this._blackHole(b);
    c.globalCompositeOperation='lighter';this._particles(true);this._effects(true);this._sparkles();this._accretionLight();c.globalCompositeOperation='source-over';
    this._markers();this._inspiralMarkers();this._labels();this._popups(dt);
    if(!this.inspectMode&&['ready','playing'].includes(this.sim.state))this._dropGuide();
    c.restore();this._danger();
    if(this.flash>.002&&!this.reducedMotion){c.globalCompositeOperation='lighter';c.fillStyle=rgba(this.flashColor,this.flash);c.fillRect(0,0,W,H);c.globalCompositeOperation='source-over';}
    this.shake*=Math.exp(-dt*5);this.flash*=Math.exp(-dt*3.2);
  }
  _advance(dt){
    if(dt<=0)return;
    for(const e of this.effects)e.age+=dt;this.effects=this.effects.filter(e=>e.age<e.duration);
    for(const p of this.popups)p.age+=dt;this.popups=this.popups.filter(p=>p.age<p.life);
    for(const e of this.emitters){e.age+=dt;e.carry+=dt*e.rate*(1-e.age/e.duration);while(e.carry>=1){e.carry--;this._burst(e.x,e.y,1,e.radius,e.power,'ejecta');}}this.emitters=this.emitters.filter(e=>e.age<e.duration);
    // Final second before core collapse: the envelope streams inward onto the core.
    for(const b of this.sim.bodies){const k=this._collapse(b);if(k<=0)continue;let carry=(this.flowCarry.get('in'+b.id)||0)+dt*(this.quality==='low'?60:150)*(.3+k);
      while(carry>=1){carry--;const a=this.rng()*TAU,R=b.radius*this._visScale(b)*(.92+this.rng()*.22),sp=b.radius*(1.4+3.2*k);this._particle({x:b.x+Math.cos(a)*R,y:b.y+Math.sin(a)*R,vx:-Math.cos(a)*sp,vy:-Math.sin(a)*sp,life:1.2,kind:'infall',target:b.id,free:true,ramp:sparkRamp(b.type),size:1.2+this.rng()});}
      this.flowCarry.set('in'+b.id,carry);}
    for(const source of this.compact)for(const id of source.accretingIds||[source.accretingId]){
      const donor=this.bodyMap.get(id);if(!donor||donor.kind!=='star')continue;const key=source.id+':'+id,rate=(this.quality==='low'?26:56)*Math.min(2,1+(source.accretionRate||.1));let carry=(this.flowCarry.get(key)||0)+dt*rate;
      while(carry>=1){carry--;const dx=source.x-donor.x,dy=source.y-donor.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,edge=donor.radius*(.6+this.rng()*.35),spread=(this.rng()-.5)*donor.radius*.45,orbit=Math.sqrt(PHYSICS.gravityConstant*source.mass/Math.max(30,d))*.4;
        this._particle({x:donor.x+ux*edge-uy*spread,y:donor.y+uy*edge+ux*spread,vx:source.vx*.2+ux*20-uy*orbit,vy:source.vy*.2+uy*20+ux*orbit,life:12+this.rng()*6,kind:'stream',owner:source.id,hot:.55,ramp:source.kind==='ns'?1:0});}
      this.flowCarry.set(key,carry);
    }
    if(this.flowCarry.size>160)this.flowCarry.clear();let write=0;
    for(const p of this.particles){
      p.age+=dt;if(p.age>=p.life)continue;
      if(p.kind==='infall'){const t=this.bodyMap.get(p.target);if(!t||t.kind!=='star'||Math.hypot(p.x-t.x,p.y-t.y)<t.radius*.12)continue;}
      let nearest=p.free?null:this.bodyMap.get(p.owner),nearestD=Infinity;
      if(!nearest&&!p.free)for(const b of this.compact){const d=(p.x-b.x)**2+(p.y-b.y)**2;if(d<nearestD){nearest=b;nearestD=d;}}
      if(nearest){const dx=nearest.x-p.x,dy=nearest.y-p.y,d=Math.hypot(dx,dy);if(d<nearest.radius*.9&&nearest.kind==='bh')continue;const f=gravityAt(dx,dy,nearest.mass,Math.max(20,nearest.radius*.55));p.vx+=f.x*dt;p.vy+=f.y*dt;if(p.kind==='stream'&&d<nearest.radius*3.2){const drag=Math.exp(-dt*.65);p.vx*=drag;p.vy*=drag;p.hot=Math.min(1,p.hot+dt*.8);}}
      if(p.kind==='ejecta'||p.kind==='smoke'){const drag=Math.exp(-dt*(p.age>4?.23:.055));p.vx*=drag;p.vy=p.vy*drag-(p.age>5?2:0)*dt;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.kind!=='jet'){const L=this.sim.wallLeft+1,Rt=this.sim.wallRight-1,F=this.sim.floor-2;if(p.x<L||p.x>Rt){p.x=clamp(p.x,L,Rt);p.vx*=-.25;}if(p.y>F){p.y=F;p.vy*=-.18;p.vx*=.985;}if(p.y<14){p.y=14;p.vy*=-.25;}}
      if(p.x< -100||p.x>800||p.y< -250||p.y>1000)continue;this.particles[write++]=p;
    }
    this.particles.length=Math.min(write,this.particleLimit);
  }
  _updateDisks(dt){
    const won=this.sim.state==='won';
    for(const b of this.compact){if(b.kind!=='bh')continue;const target=won||b.mergingWith?1:b.accretingId?1.35:.5,prev=this.diskLevel.get(b.id)??target;this.diskLevel.set(b.id,prev+(target-prev)*(1-Math.exp(-dt*1.6)));}
    if(this.diskLevel.size>this.compact.length+8)for(const id of this.diskLevel.keys())if(!this.bodyMap.has(id))this.diskLevel.delete(id);
  }
  _diskOf(b){const s=b.seed||.5;return{level:this.diskLevel.get(b.id)??.4,tilt:(s-.5)*.42,inc:1.36+((s*7.31)%1)*.1,spin:s>.5?1:-1,seed:s};}
  get gpuDisks(){return this.optics.mode==='webgl';}
  _background(){
    const lenses=this.compact.filter(b=>b.kind==='bh'||b.kind==='ns').map(b=>({x:b.x,y:b.y,radius:b.radius,kind:b.kind,rs:b.radius/(b.kind==='bh'?CRITICAL_B:2.9/Math.sqrt(1-1/2.9)),disk:b.kind==='bh'?this._diskOf(b):null}));
    const px=W*this.scale,width=this.quality==='low'?clamp(Math.round(px*.62),300,520):clamp(Math.round(px),420,1100),drift=this.reducedMotion?[0,0]:[(this.time*1.4)%W,(this.time*.5)%H];
    const image=this.optics.render(lenses,this.effects,this.quality,this.time,{width,bending:this.showLensing,drift,exposure:.92});
    const c=this.ctx;
    if(image)c.drawImage(image,0,0,W,H);else{c.fillStyle='#070912';c.fillRect(0,0,W,H);}
    if(!this.gpuDisks){const g=c.createRadialGradient(350,410,120,350,410,560);g.addColorStop(0,'rgba(3,4,10,0)');g.addColorStop(1,'rgba(3,4,10,.62)');c.fillStyle=g;c.fillRect(0,0,W,H);}
  }

  /* ---------- bodies ---------- */
  // The last seconds of a massive star: it shivers, then the core collapse drags it inward.
  _collapse(b){if(b.kind!=='star'||b.mass<PHYSICS.coreCollapseMass)return 0;const left=b.collapseAt-b.age;return left<1.1?clamp(1-left/1.1,0,1):0;}
  _shiver(b){if(b.kind!=='star'||b.mass<PHYSICS.coreCollapseMass)return 0;const left=b.collapseAt-b.age;return left<4?clamp(1-left/4,0,1):0;}
  _visScale(b){const k=this._collapse(b),s=this._shiver(b);return this._popScale(b)*(1-.3*k*k*k)*(1+(this.reducedMotion?0:.03*s*Math.sin(this.time*(10+40*s))));}
  // With the cutaway open the type label moves onto the intact side, so even a small Fe core can be labelled.
  _typeAnchor(b,r){if(!this.showLayers||b.kind!=='star'||r<28)return[b.x,b.y];const a=Math.PI*.2+(b.rotation||0);return[b.x-Math.cos(a)*r*.32,b.y-Math.sin(a)*r*.32];}
  _popScale(b){const t0=this.pops.get(b.id);if(t0===undefined)return 1;const t=this.time-t0;if(t>.9){this.pops.delete(b.id);return 1;}return 1+.16*Math.exp(-t*6)*Math.cos(t*20)-.04*Math.exp(-t*30);}
  _tex(index,x,y,r,angle){const img=this.images['star-'+index];if(!img?.complete||!img.naturalWidth)return false;const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.drawImage(img,-r,-r,r*2,r*2);c.restore();return true;}
  _halos(){
    for(const b of this.sim.bodies){
      if(b.mergingWith&&(b.kind==='wd'||b.kind==='ns')){const partner=this.bodyMap.get(b.mergingWith);if(partner&&this._victim(b,partner)===b){const q=b.mergerProgress||0;this._glow(b.x,b.y,b.radius*(3+4*q),this._lightOf(b),(.25+.45*q)*(.75+.25*Math.sin(this.time*31)));}}
      if(b.kind==='bh'){const k=this.diskLevel.get(b.id)??.4,c=this.ctx,g=c.createRadialGradient(b.x,b.y,b.radius*1.05,b.x,b.y,b.radius*4.8);g.addColorStop(0,rgba(BH_LIGHT,0));g.addColorStop(.12,rgba(BH_LIGHT,.05+k*.14));g.addColorStop(.4,rgba(BH_LIGHT,.02+k*.05));g.addColorStop(1,rgba(BH_LIGHT,0));c.fillStyle=g;c.beginPath();c.arc(b.x,b.y,b.radius*4.8,0,TAU);c.fill();continue;}
      const color=b.kind==='ns'?NS_COLOR:b.kind==='wd'?WD_COLOR:spectralOf(b).color,hot=b.kind==='star'?b.type/6+oRank(b)*.35:1,r=b.radius*this._visScale(b);
      if(oRank(b))this._glow(b.x,b.y,r*(2.6+oRank(b)*.6),oRank(b)===2?'#f0ecff':color,.14+oRank(b)*.08);
      this._glow(b.x,b.y,r*(b.kind==='star'?2.3+hot*.7:b.kind==='ns'?5.5:4),color,b.kind==='star'?.30+hot*.12:.55);
      if(b.kind==='star'&&b.evolution==='pre-supernova'){const left=Math.max(0,b.collapseAt-b.age),beat=.5+.5*Math.sin(this.time*(3+18/(1+left)));this._glow(b.x,b.y,r*3.2,'#ff6a88',.1+.25*beat*(1-left/25));}
    }
  }
  _star(b){
    const c=this.ctx,r=b.radius*this._visScale(b),idx=texIndex(b),color=b.kind==='wd'?WD_COLOR:spectralOf(b).color;
    // A white dwarf spiralling into a hole is stretched along the tidal axis.
    const partner=b.kind==='wd'&&b.mergingWith?this.bodyMap.get(b.mergingWith):null;
    if(partner){const q=b.mergerProgress||0,stretch=1+1.6*q*q;c.save();c.translate(b.x,b.y);c.rotate(Math.atan2(partner.y-b.y,partner.x-b.x));c.scale(stretch,1/Math.sqrt(stretch));c.translate(-b.x,-b.y);}
    if(!this._tex(idx,b.x,b.y,r,b.rotation||0)){const g=c.createRadialGradient(b.x-r*.2,b.y-r*.2,r*.1,b.x,b.y,r);g.addColorStop(0,'#ffffff');g.addColorStop(.35,color);g.addColorStop(1,rgba(color,.55));c.fillStyle=g;c.beginPath();c.arc(b.x,b.y,r,0,TAU);c.fill();}
    if(this.showLayers&&b.kind==='star')this._cutaway(b,r);
    // Chromospheric rim: a hair-thin bright edge keeps touching stars legible.
    c.strokeStyle=rgba(color,.35);c.lineWidth=1;c.beginPath();c.arc(b.x,b.y,r-.5,0,TAU);c.stroke();
    if(partner)c.restore();
    const k=this._collapse(b),s=this._shiver(b);
    if(k>0||s>0){c.save();c.globalCompositeOperation='lighter';this._glow(b.x,b.y,r*(.3+.9*k),'#ffffff',.2*s+.9*k*k);this._glow(b.x,b.y,r*1.08,color,.16*s*(.5+.5*Math.sin(this.time*37)));c.restore();}
  }
  _cutaway(b,r){
    // Interior from the evolving composition model: one radial gradient so the
    // composition blends across a thin band at each boundary, as real
    // abundance profiles do, plus element labels where a shell is wide enough.
    const c=this.ctx,layers=stellarLayers(b),a0=-Math.PI*.05,a1=Math.PI*.45;if(!layers.length)return;
    const edges=[];let area=0;for(const l of layers){area+=l.fraction;edges.push(r*Math.sqrt(Math.min(1,area)));}
    c.save();c.translate(b.x,b.y);c.rotate(b.rotation||0);c.beginPath();c.moveTo(0,0);c.arc(0,0,r-.6,a0,a1);c.closePath();c.clip();
    const g=c.createRadialGradient(0,0,0,0,0,r),blend=Math.min(.04,2.4/r);let inner=0;
    layers.forEach((l,i)=>{const outer=edges[i]/r;g.addColorStop(clamp(i?inner+blend:0,0,1),l.color);g.addColorStop(clamp(i<layers.length-1?outer-blend:1,0,1),l.color);inner=outer;});
    c.fillStyle=g;c.fillRect(-r,-r,r*2,r*2);
    // Burning zones glow: brightest where fusion is happening right now.
    layers.forEach((l,i)=>{if(!l.el.includes('→')&&l.el!=='Si')return;const ri=i?edges[i-1]:0,ro=edges[i],gl=c.createRadialGradient(0,0,ri,0,0,ro);gl.addColorStop(0,'rgba(255,255,255,0)');gl.addColorStop(.5,'rgba(255,250,235,.38)');gl.addColorStop(1,'rgba(255,255,255,0)');c.globalCompositeOperation='lighter';c.fillStyle=gl;c.beginPath();c.arc(0,0,ro,0,TAU);c.arc(0,0,ri,0,TAU,true);c.fill();c.globalCompositeOperation='source-over';});
    c.strokeStyle='rgba(255,255,255,.2)';c.lineWidth=.7;for(let i=0;i<edges.length-1;i++){c.beginPath();c.arc(0,0,edges[i],a0,a1);c.stroke();}
    // Cut faces catch a little shade along the wedge edges.
    c.globalCompositeOperation='multiply';c.lineWidth=r*.16;c.strokeStyle='rgba(60,40,70,.35)';c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(a0)*r,Math.sin(a0)*r);c.moveTo(0,0);c.lineTo(Math.cos(a1)*r,Math.sin(a1)*r);c.stroke();
    c.restore();
    c.save();c.translate(b.x,b.y);c.rotate(b.rotation||0);c.strokeStyle='rgba(255,246,226,.55)';c.lineWidth=1;c.beginPath();c.moveTo(Math.cos(a0)*r,Math.sin(a0)*r);c.lineTo(0,0);c.lineTo(Math.cos(a1)*r,Math.sin(a1)*r);c.stroke();c.restore();
    if(r<28)return;
    // Labels stay upright while the wedge turns with the star. Each tries a few
    // angles inside the wedge and is dropped rather than overlap another label
    // or the spectral-type label at the centre.
    const spin=b.rotation||0,size0=clamp(r*.62,13,34),type=spectralOf(b).type;c.font=`700 ${type.length>1?size0*.78:size0}px ${FONT}`;
    const tw=c.measureText(type).width/2+3,[ax,ay]=this._typeAnchor(b,r),boxes=[[ax-tw,ay-size0*.62,ax+tw,ay+size0*.82]],hit=q=>boxes.some(o=>q[0]<o[2]&&q[2]>o[0]&&q[1]<o[3]&&q[3]>o[1]);
    c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
    layers.forEach((l,i)=>{const ri=i?edges[i-1]:0,ro=edges[i],t=ro-ri;if(t<(i?9:7))return;
      const size=clamp(t*.6,8,12);c.font=`700 ${size}px ${FONT}`;const w=c.measureText(l.el).width;
      // The core may sit under the type label: also try further out inside it.
      placing:for(const mid of i?[(ri+ro)/2]:[ro*.6,ro-size*.75])for(const da of [0,-.3,.3,-.55,.55]){const a=(a0+a1)/2+da+spin;if(w/2>mid*Math.min(.78-Math.abs(da),.5)*1.6&&i)continue;const x=b.x+Math.cos(a)*mid,y=b.y+Math.sin(a)*mid,q=[x-w/2-1.5,y-size*.55,x+w/2+1.5,y+size*.55];if(hit(q))continue;
        boxes.push(q);c.lineWidth=2.6;c.strokeStyle='rgba(20,14,34,.55)';c.strokeText(l.el,x,y);c.fillStyle='rgba(255,255,255,.96)';c.fillText(l.el,x,y);break placing;}});
    c.textBaseline='alphabetic';
  }

  _neutronStar(b){
    const partner=b.mergingWith?this.bodyMap.get(b.mergingWith):null;
    if(partner&&this._victim(b,partner)===b){const c=this.ctx,q=b.mergerProgress||0,stretch=1+1.4*q*q;c.save();c.translate(b.x,b.y);c.rotate(Math.atan2(partner.y-b.y,partner.x-b.x));c.scale(stretch,1/Math.sqrt(stretch));c.translate(-b.x,-b.y);this._neutronStarBody(b);c.restore();return;}
    this._neutronStarBody(b);
  }
  _neutronStarBody(b){
    const c=this.ctx,r=b.radius,axis=(this.reducedMotion?.6:this.time*2.4)+(b.seed||0)*TAU;
    // Pulsar beams sweep from the magnetic poles; dipole loops trace the field.
    c.save();c.globalCompositeOperation='lighter';c.translate(b.x,b.y);c.rotate(axis);
    for(const dir of [1,-1]){const len=170,g=c.createLinearGradient(0,0,dir*len,0);g.addColorStop(0,'rgba(170,236,255,.42)');g.addColorStop(.35,'rgba(110,200,255,.14)');g.addColorStop(1,'rgba(80,160,255,0)');c.fillStyle=g;c.beginPath();c.moveTo(dir*r*.6,-r*.25);c.lineTo(dir*len,-24);c.lineTo(dir*len,24);c.lineTo(dir*r*.6,r*.25);c.closePath();c.fill();}
    c.strokeStyle='rgba(143,224,255,.16)';c.lineWidth=1;
    for(const L of [2.1,3.2])for(const side of [1,-1]){c.beginPath();for(let i=0;i<=40;i++){const th=.18+i/40*(Math.PI-.36),rr=r*L*Math.sin(th)**2*1.4;const px=Math.cos(th)*rr,py=side*Math.sin(th)*rr;i?c.lineTo(px,py):c.moveTo(px,py);}c.stroke();}
    c.restore();
    if(!this._tex(8,b.x,b.y,r,b.rotation||0)){c.fillStyle='#d8f6ff';c.beginPath();c.arc(b.x,b.y,r,0,TAU);c.fill();}
  }
  _blackHole(b){
    const r=b.radius,disk=this._diskOf(b);
    if(!this.gpuDisks)this._cpuBlackHole(b,disk);
    // Feeding near the Eddington limit launches bipolar jets along the disk axis.
    if(b.accretingId&&disk.level>.6)this._jets(b.x,b.y,r,disk.tilt,clamp((disk.level-.6)/.7,0,1),b.seed||0);
  }
  _jets(x,y,r,tilt,strength,seed){
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';c.translate(x,y);c.rotate(tilt-Math.PI/2);
    for(const dir of [1,-1]){const len=r+(150+r*1.8)*strength,g=c.createLinearGradient(dir*r,0,dir*len,0);g.addColorStop(0,'rgba(226,238,255,.8)');g.addColorStop(.35,'rgba(160,196,255,.32)');g.addColorStop(1,'rgba(120,150,255,0)');
      c.fillStyle=g;c.beginPath();c.moveTo(dir*r*1.02,-4);c.lineTo(dir*len,-13);c.lineTo(dir*len,13);c.lineTo(dir*r*1.02,4);c.closePath();c.fill();
      this._glow(dir*r*1.05,0,10+r*.25,'#e6f0ff',.55*strength);
      for(let q=0;q<4;q++){const f=(this.time*1.5+q/4+seed)%1;this._glow(dir*(r*1.1+f*(len-r)),0,6+f*10,'#dce8ff',.6*(1-f)*strength);}}
    c.restore();
  }
  _cpuBlackHole(b,disk){
    // Illustrative stand-in for the ray-traced disk when WebGL is unavailable.
    const c=this.ctx,r=b.radius,out=r*2.6,k=disk.level,band=(front)=>{c.save();c.scale(1,.18);if(front){c.beginPath();c.rect(-out*1.2,0,out*2.4,out*6);c.clip();}const g=c.createRadialGradient(0,0,r*1.12,0,0,out);g.addColorStop(0,`rgba(255,240,214,${.95*k})`);g.addColorStop(.25,`rgba(255,184,104,${.75*k})`);g.addColorStop(1,'rgba(160,60,20,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,out,0,TAU);c.arc(0,0,r*1.12,0,TAU,true);c.fill();c.restore();};
    c.save();c.translate(b.x,b.y);c.rotate(disk.tilt);c.globalCompositeOperation='lighter';band(false);
    c.strokeStyle=`rgba(255,196,128,${.55*k})`;c.lineWidth=r*.32;c.beginPath();c.ellipse(0,-r*.08,r*1.5,r*1.32,0,Math.PI*1.04,Math.PI*1.96);c.stroke();
    c.globalCompositeOperation='source-over';c.fillStyle='#000';c.beginPath();c.arc(0,0,r,0,TAU);c.fill();
    c.globalCompositeOperation='lighter';band(true);c.strokeStyle=`rgba(255,226,180,${.7*k+.15})`;c.lineWidth=1.4;c.beginPath();c.arc(0,0,r*1.03,0,TAU);c.stroke();c.restore();
  }
  /* ---------- accretion light ---------- */
  // Matter leaves the donor at its inner Lagrange point as a bright stream that
  // spirals into the accretor, striking a flickering hot spot.
  _accretionLight(){
    const c=this.ctx;
    for(const s of this.compact){
      if(!s.accretingId||s.mergingWith)continue;const d=this.bodyMap.get(s.accretingId);if(!d||d.kind!=='star')continue;
      const bh=s.kind==='bh',k=bh?clamp((this.diskLevel.get(s.id)??0)/1.35,0,1):.8,light=bh?BH_LIGHT:this._lightOf(s),spin=bh?this._diskOf(s).spin:1;
      // The stream spirals in from the donor's inner Lagrange point, winding round
      // the accretor and flattening into its disk plane (black holes) as it falls.
      const dx=d.x-s.x,dy=d.y-s.y,dist=Math.hypot(dx,dy)||1,tilt=bh?this._diskOf(s).tilt:0,flat=bh?.28:.7,a0=Math.atan2(dy,dx),r0=dist-d.radius*.96,r1=s.radius*1.18;
      const at=t=>{const a=a0+spin*t*2.6,rr=r0+(r1-r0)*Math.pow(t,.7),ux=Math.cos(a)*rr,uy=Math.sin(a)*rr,pc=Math.cos(-tilt),ps=Math.sin(-tilt),qx=ux*pc-uy*ps,qy=(ux*ps+uy*pc)*(1-(1-flat)*Math.pow(t,.6)),bc=Math.cos(tilt),bs=Math.sin(tilt);return[s.x+qx*bc-qy*bs,s.y+qx*bs+qy*bc];};
      const pts=Array.from({length:29},(_,i)=>at(i/28)),path=(from=0)=>{c.beginPath();for(let i=from;i<pts.length;i++)i>from?c.lineTo(pts[i][0],pts[i][1]):c.moveTo(pts[i][0],pts[i][1]);};
      const [x0,y0]=pts[0],[x2,y2]=pts[pts.length-1];
      c.lineCap='round';c.lineJoin='round';
      path();c.strokeStyle=rgba(light,.15*k);c.lineWidth=Math.max(7,d.radius*.4);c.stroke();
      path(4);c.strokeStyle=rgba(light,.32*k);c.lineWidth=7;c.stroke();
      path();c.strokeStyle=rgba(light,.6*k);c.lineWidth=3;c.stroke();
      path(2);c.strokeStyle=rgba('#ffffff',.85*k);c.lineWidth=1.3;c.stroke();
      for(let i=0;i<9;i++){const t=(this.time*.7+i/9)%1,[px,py]=at(t);this._glow(px,py,3+8*t,'#fff6e8',.6*k*(.3+.7*t));}
      this._glow(x0,y0,d.radius*.75,light,.22*k);
      this._glow(x2,y2,s.radius*(.55+.12*Math.sin(this.time*23)),'#ffffff',.7*k);this._glow(x2,y2,s.radius*1.3,light,.35*k);
    }
  }

  /* ---------- compact-binary inspiral ---------- */
  _pairOf(m){return[this.bodyMap.get(m.aId),this.bodyMap.get(m.bId)];}
  // The body torn apart by tides: any white dwarf, or a neutron star meeting a light (< 10 M☉) hole.
  _victim(a,b){for(const [v,h] of [[a,b],[b,a]])if(h.kind==='bh'&&(v.kind==='wd'||(v.kind==='ns'&&h.mass<10)))return v;return null;}
  _lightOf(b){return b.kind==='ns'?NS_COLOR:b.kind==='wd'?WD_COLOR:BH_LIGHT;}
  _centre(a,b){const M=a.mass+b.mass;return[(a.x*a.mass+b.x*b.mass)/M,(a.y*a.mass+b.y*b.mass)/M];}
  _advanceInspirals(dt){
    const live=new Set();
    for(const m of this.sim.mergers||[]){
      const [a,b]=this._pairOf(m);if(!a||!b)continue;const p=clamp(m.age/m.duration,0,1),[cx,cy]=this._centre(a,b);live.add(m.aId);
      for(const body of [a,b]){let t=this.trails.get(body.id);if(!t){t=[];this.trails.set(body.id,t);}if(dt>0){t.push(body.x,body.y);if(t.length>2*(26+Math.round(p*20)))t.splice(0,2);}}
      if(dt<=0)continue;
      // Chirp: strain packets come faster and stronger as the orbit shrinks.
      const bh=a.kind==='bh'&&b.kind==='bh',next=(this.chirps.get(m.aId)??0)-dt;
      if(next<=0){this.effects.push({kind:'wave',x:cx,y:cy,age:0,duration:6,power:(bh?.2:.1)+(bh?.55:.25)*p*p});this.chirps.set(m.aId,1.15-.8*p);if(this.effects.length>24)this.effects.shift();}else this.chirps.set(m.aId,next);
      // A white dwarf is tidally shredded: its debris streams onto the hole.
      const wd=this._victim(a,b),hole=wd===a?b:a;
      // Tidal disruption: about half the debris is bound and spirals onto the hole;
      // the rest leaves the far side as an unbound tidal tail along the orbit.
      if(wd&&p>.22){const rate=(this.quality==='low'?45:110)*(.25+p*p),dx=hole.x-wd.x,dy=hole.y-wd.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,ramp=wd.kind==='ns'?1:4;let carry=(this.flowCarry.get('wd'+wd.id)||0)+dt*rate;
        while(carry>=1){carry--;const side=(this.rng()-.5)*wd.radius,sw=m.spin*(90+170*p);
          if(this.rng()<.55){const sp=40+this.rng()*60;this._particle({x:wd.x+ux*wd.radius*.6-uy*side,y:wd.y+uy*wd.radius*.6+ux*side,vx:ux*sp-uy*sw,vy:uy*sp+ux*sw,life:3+this.rng()*2,kind:'stream',owner:hole.id,hot:.8,ramp});}
          else{const out=50+this.rng()*70;this._particle({x:wd.x-ux*wd.radius*.7-uy*side,y:wd.y-uy*wd.radius*.7+ux*side,vx:-ux*out-uy*sw*1.3,vy:-uy*out+ux*sw*1.3,life:1.8+this.rng()*1.4,kind:'plasma',free:true,ramp,size:1.4+this.rng()*1.4});}}
        this.flowCarry.set('wd'+wd.id,carry);}
    }
    for(const id of this.chirps.keys())if(!live.has(id))this.chirps.delete(id);
    for(const [id,t] of this.trails){const body=this.bodyMap.get(id);if(body?.mergingWith)continue;if(dt>0)t.splice(0,4);if(!t.length||!body)this.trails.delete(id);}
  }
  _inspiralLight(){
    const c=this.ctx;c.lineCap='round';c.lineJoin='round';
    for(const [id,t] of this.trails){const body=this.bodyMap.get(id);if(!body||t.length<4)continue;const color=this._lightOf(body),n=t.length/2,partner=body.mergingWith?this.bodyMap.get(body.mergingWith):null;
      if(partner&&this._victim(body,partner)===body){
        // Spaghettification: the victim's trail is a thick, hot ribbon of its own matter.
        const q=body.mergerProgress||0,w=body.radius*(.35+1.5*q);
        for(const [scale,alpha,tint] of [[1,.3,color],[.38,.8,'#ffffff']])for(let i=1;i<n;i++){const f=i/n;c.strokeStyle=rgba(tint,alpha*f*(.4+.6*q));c.lineWidth=Math.max(1,w*scale*f);c.beginPath();c.moveTo(t[i*2-2],t[i*2-1]);c.lineTo(t[i*2],t[i*2+1]);c.stroke();}
        continue;}
      for(let i=1;i<n;i++){const f=i/n;c.strokeStyle=rgba(color,.55*f*f);c.lineWidth=1+f*Math.min(6,body.radius*.18);c.beginPath();c.moveTo(t[i*2-2],t[i*2-1]);c.lineTo(t[i*2],t[i*2+1]);c.stroke();}}
    for(const m of this.sim.mergers||[]){
      const [a,b]=this._pairOf(m);if(!a||!b)continue;const p=clamp(m.age/m.duration,0,1),[cx,cy]=this._centre(a,b),beat=.5+.5*Math.sin(m.phase*2);
      // Shared envelope brightens with the gravitational-wave luminosity.
      this._glow(cx,cy,(m.current||m.separation)*.6+Math.max(a.radius,b.radius)*2.4,a.kind==='ns'?NS_COLOR:BH_LIGHT,.08+.42*p*p*(.7+.3*beat));
      if(p>.82)this._glow(cx,cy,60+120*(p-.82)/.18,'#ffffff',.6*((p-.82)/.18)**2);
      const victim=this._victim(a,b);
      if(victim){const hole=victim===a?b:a,light=this._lightOf(victim),disk=this._diskOf(hole),q=clamp((p-.35)/.65,0,1);
        // Debris circularises into a hot torus around the hole and the flare builds.
        this._glow(hole.x,hole.y,hole.radius*(2+3.5*p),light,.12+.45*p*p);
        if(q>0){c.save();c.translate(hole.x,hole.y);c.rotate(disk.tilt);c.scale(1,.32);c.lineCap='butt';const R=hole.radius*1.85;
          c.strokeStyle=rgba(light,.28*q);c.lineWidth=hole.radius*(.5+.5*q)/.6;c.beginPath();c.arc(0,0,R,0,TAU);c.stroke();
          // Bright strands streaming round the torus.
          c.setLineDash([R*.5,R*.35,R*.2,R*.45]);c.lineDashOffset=-this.time*R*1.6*m.spin;
          for(const [k,w,a] of [[.9,2.4,.75],[1.12,1.6,.5]]){c.strokeStyle=rgba('#ffffff',a*q);c.lineWidth=w/.6;c.beginPath();c.arc(0,0,R*k,0,TAU);c.stroke();}
          c.setLineDash([]);c.restore();}
      }
    }
  }
  _inspiralMarkers(){
    const c=this.ctx;
    for(const m of this.sim.mergers||[]){
      const [a,b]=this._pairOf(m);if(!a||!b)continue;const p=clamp(m.age/m.duration,0,1),[cx,cy]=this._centre(a,b);
      const R=Math.max(Math.hypot(a.x-cx,a.y-cy)+a.radius,Math.hypot(b.x-cx,b.y-cy)+b.radius)+12,color=a.kind==='ns'&&b.kind==='ns'?NS_COLOR:BH_LIGHT;
      c.save();c.lineCap='round';c.strokeStyle=rgba(color,.16);c.lineWidth=2;c.beginPath();c.arc(cx,cy,R,0,TAU);c.stroke();
      c.strokeStyle=rgba(color,.9);c.beginPath();c.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+TAU*p);c.stroke();
      c.globalCompositeOperation='lighter';c.globalAlpha=.35;c.lineWidth=6;c.stroke();c.restore();
      const left=Math.max(0,m.duration-m.age),label=t('mergeIn',{s:left.toFixed(1)}),ly=Math.max(18,cy-R-12);
      c.textAlign='center';c.textBaseline='middle';c.font=`700 13px ${FONT}`;c.lineWidth=3;c.lineJoin='round';c.strokeStyle='rgba(6,4,16,.6)';c.strokeText(label,cx,ly);c.fillStyle=rgba(color,.95);c.fillText(label,cx,ly);c.textBaseline='alphabetic';
    }
  }
  _sparkles(){
    for(const b of this.sim.bodies){
      const t=this.time+(b.seed||0)*10;
      if(b.kind==='ns')this._spikes(b.x,b.y,b.radius*4.2,NS_COLOR,.5+.1*Math.sin(t*9),0);
      else if(b.kind==='wd')this._spikes(b.x,b.y,b.radius*3.4,WD_COLOR,.32,0);
      else if(b.kind==='star'&&b.type>=5){const k=oRank(b);this._spikes(b.x,b.y,b.radius*(b.type===O_TYPE?2.4+k*.25:2.1),k===2?'#f4f0ff':spectralOf(b).color,b.type===O_TYPE?.26+k*.05:.2,k*.2);}
    }
  }
  _markers(){
    const c=this.ctx;
    for(const b of this.sim.bodies){
      if(b.kind==='star'&&b.mass>=PHYSICS.coreCollapseMass){const left=b.collapseAt-b.age;if(left<25){const r=b.radius+5,f=clamp(left/25,0,1),beat=.5+.5*Math.sin(this.time*(4+20*(1-f)));c.save();c.lineCap='round';c.strokeStyle=rgba('#ffd2dc',.18);c.lineWidth=2;c.beginPath();c.arc(b.x,b.y,r,0,TAU);c.stroke();c.strokeStyle=rgba('#ff8aa6',.55+.4*beat);c.beginPath();c.arc(b.x,b.y,r,-Math.PI/2,-Math.PI/2+TAU*f);c.stroke();c.restore();}}
      if(b.dangerTime>.05&&this.sim.state==='playing'){const a=clamp(b.dangerTime/3,0,1)*(.55+.45*Math.sin(this.time*14));c.strokeStyle=rgba('#ff5a6e',a);c.lineWidth=2;c.beginPath();c.arc(b.x,b.y,b.radius+3,0,TAU);c.stroke();}
      if(this.selectedId===b.id){const r=b.radius+9,spin=this.reducedMotion?0:this.time*.6;c.save();c.translate(b.x,b.y);c.rotate(spin);c.strokeStyle='rgba(255,226,186,.9)';c.lineWidth=1.5;c.lineCap='round';for(let i=0;i<4;i++){c.beginPath();c.arc(0,0,r,i*Math.PI/2+.18,i*Math.PI/2+Math.PI/2-.18);c.stroke();}c.globalAlpha=.25;c.lineWidth=5;c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.restore();}
    }
  }
  _labels(){
    const c=this.ctx;c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
    const text=(s,x,y,font,fill,stroke=3)=>{c.font=font;c.lineWidth=stroke;c.strokeStyle='rgba(8,6,20,.42)';c.strokeText(s,x,y);c.fillStyle=fill;c.fillText(s,x,y);};
    for(const b of this.sim.bodies){
      const r=b.radius*this._visScale(b);c.globalAlpha=b.mergingWith?clamp(1-(b.mergerProgress||0)*1.6,0,1):1;if(c.globalAlpha<=0)continue;
      if(b.kind==='bh'){text(massLabel(b.mass),b.x,b.y-1,`600 ${clamp(r*.42,11,20)}px ${FONT}`,'rgba(255,236,214,.92)',0);if(r>22)text('M☉',b.x,b.y+r*.36,`500 ${clamp(r*.22,8,11)}px ${FONT}`,'rgba(255,220,190,.55)',0);continue;}
      if(b.kind==='ns'||b.kind==='wd'){text(b.kind==='ns'?'NS':'WD',b.x,b.y,`700 ${b.kind==='ns'?10:11}px ${FONT}`,b.kind==='ns'?'rgba(6,40,64,.85)':'rgba(30,40,70,.8)',0);if(this.inspectMode)text(massLabel(b.mass),b.x,b.y+r+10,`500 10px ${FONT}`,'rgba(220,236,255,.8)');continue;}
      const size=clamp(r*.62,13,34),light=b.type>=2;
      const label=spectralOf(b).type,[lx,ly]=this._typeAnchor(b,r);text(label,lx,ly-(r>=26?size*.16:0),`700 ${label.length>1?size*.78:size}px ${FONT}`,light?'rgba(40,36,70,.78)':'rgba(255,250,240,.95)',light?0:3);
      if(r>=26||this.inspectMode)text(massLabel(b.mass),lx,ly+size*.5,`600 ${clamp(size*.38,11,14)}px ${FONT}`,light?'rgba(40,36,70,.6)':'rgba(255,246,230,.8)',light?0:2.5);
    }
    c.textBaseline='alphabetic';c.globalAlpha=1;
  }
  _popups(){
    const c=this.ctx;c.textAlign='center';c.textBaseline='middle';
    for(const p of this.popups){const t=p.age/p.life,y=p.y-ease(t)*38,a=t<.15?t/.15:1-Math.pow((t-.15)/.85,2),s=1+.25*Math.exp(-p.age*10);c.save();c.globalAlpha=clamp(a,0,1);c.translate(p.x,y);c.scale(s,s);c.font=`800 20px ${FONT}`;c.lineWidth=4;c.lineJoin='round';c.strokeStyle='rgba(6,4,16,.55)';c.strokeText(p.text,0,0);c.fillStyle='#fffaf0';c.fillText(p.text,0,0);if(p.sub){c.font=`700 11px ${FONT}`;c.lineWidth=3;c.strokeText(p.sub,0,17);c.fillStyle=p.color;c.fillText(p.sub,0,17);}c.restore();}
    c.textBaseline='alphabetic';
  }

  /* ---------- particles ---------- */
  _shade(p){
    const f=clamp(p.age/p.life,0,1),fade=Math.max(0,Math.floor((f-.55)*14));
    if(p.kind==='stream')return[p.ramp,clamp(Math.round((1-p.hot)*6)+fade,0,9)];
    // Layered sparks start white-hot, cool into their element's colour, then glow as nebula.
    if(p.kind==='ejecta'){const neb=p.layered&&(p.ramp===2||p.ramp===3)?p.ramp:p.neb;if(p.layered&&p.age<.7)return[0,clamp(Math.floor(p.age/.7*3),0,9)];return p.age<2.6?[p.layered?p.ramp:0,clamp(1+Math.floor(p.age/2.6*5)+fade,0,9)]:[neb,clamp(1+Math.floor(f*7),0,9)];}
    if(p.kind==='smoke')return[p.neb,clamp(2+Math.floor(f*6),0,9)];
    if(p.kind==='infall')return[p.ramp,clamp(1+Math.floor(f*4),0,9)];
    return[p.ramp,clamp(1+Math.floor(f*7),0,9)];
  }
  _particles(front){
    const c=this.ctx,atlas=this._dotAtlas(),buckets=this.buckets;for(const b of buckets)b.length=0;
    for(const p of this.particles){
      const nebular=p.kind==='smoke'||(p.kind==='ejecta'&&p.age>=2.6);if(front===nebular)continue;
      const [ramp,idx]=this._shade(p);
      if(nebular){if(!atlas)continue;const s=(p.kind==='smoke'?p.size:6+p.size*3.5)*(1+.8*p.age/p.life);c.globalAlpha=p.kind==='smoke'?.36:.38;c.drawImage(atlas,idx*24,ramp*24,24,24,p.x-s,p.y-s,s*2,s*2);continue;}
      const speed=Math.hypot(p.vx,p.vy),len=this.reducedMotion?0:Math.min(11,speed*.028)/Math.max(1,speed);
      buckets[ramp*10+idx].push(p.x-p.vx*len,p.y-p.vy*len,p.x,p.y);
      if(atlas){const s=p.size*(p.kind==='stream'?4:3);c.globalAlpha=p.kind==='stream'?1:.85;c.drawImage(atlas,idx*24,ramp*24,24,24,p.x-s,p.y-s,s*2,s*2);}
    }
    c.globalAlpha=front?.75:.6;c.lineWidth=1.1;c.lineCap='round';
    for(let k=0;k<buckets.length;k++){const b=buckets[k];if(!b.length)continue;c.strokeStyle=RAMPS[Math.floor(k/10)][k%10];c.beginPath();for(let i=0;i<b.length;i+=4){c.moveTo(b[i],b[i+1]);c.lineTo(b[i+2]+.01,b[i+3]+.01);}c.stroke();}
    c.globalAlpha=1;
  }

  /* ---------- effects ---------- */
  _ring(x,y,R,width,color,alpha){if(R<=1||alpha<=.003)return;const c=this.ctx,inner=Math.max(0,R-width),g=c.createRadialGradient(x,y,inner,x,y,R+width*.25);g.addColorStop(0,rgba(color,0));g.addColorStop(.72,rgba(color,alpha*.35));g.addColorStop(.92,rgba(color,alpha));g.addColorStop(1,rgba(color,0));c.fillStyle=g;c.beginPath();c.arc(x,y,R+width*.25,0,TAU);c.fill();}
  _effects(front){
    for(const e of this.effects){
      const t=e.age/e.duration;
      if(e.kind==='shock'){
        // The forward (blast-wave) shock always leads the fastest ejecta; the reverse
        // shock falls back through them and lights them up from inside.
        const R=e.r0?this._ejectaScale(e.r0,e.ia,e.age)*1.12+6:e.radius*(1-Math.exp(-e.age/3.2)),a=Math.pow(1-t,1.3)*clamp(e.age/.25,0,1),rev=R*(.8-.22*ease(clamp((e.age-1)/6,0,1)));
        if(!front){this._ring(e.x,e.y,R,30+R*.12,e.color,.36*a);this._ring(e.x,e.y,R,4,'#eef2ff',.3*a);this._ring(e.x,e.y,rev,22,e.ia?'#ffb070':'#ff6a8c',.2*a*clamp((e.age-.6)/1.5,0,1));this._glow(e.x,e.y,R*.95,e.ia?'#ffb070':'#7f6cff',.14*a);}
        else{const f=Math.max(0,1-e.age/1.4);this._glow(e.x,e.y,90+e.age*420,e.ia?'#fff2d6':'#e8ecff',.95*f*f);this._glow(e.x,e.y,40+e.age*60,'#ffffff',Math.max(0,1-e.age/3)*.6);if(e.age<2)this._spikes(e.x,e.y,160+e.age*120,'#ffffff',.8*Math.max(0,1-e.age/2),.3);}
      }else if(e.kind==='nebula'&&!front){const R=10+ease(t)*90,a=(1-t)*.5;this._ring(e.x,e.y,R,18,'#4fd8c8',a*.6);this._ring(e.x,e.y,R*.8,14,'#ff6a90',a*.5);}
      else if(!front)continue;
      else if(e.kind==='fusion'){const k=ease(e.age/.7);this._glow(e.x,e.y,e.r*(2+k*1.6),e.color,.75*Math.max(0,1-e.age/.6));if(e.age<.7)this._ring(e.x,e.y,e.r*(1+k*1.3),10*(1-k)+2,e.color,.9*(1-k));this._glow(e.x,e.y,e.r*.9,'#ffffff',.6*Math.max(0,1-e.age/.25));}
      else if(e.kind==='pulse'){const k=ease(t);this._ring(e.x,e.y,20+k*e.radius,22,NS_COLOR,.5*(1-k));this._glow(e.x,e.y,70+k*50,'#c8f4ff',.7*Math.max(0,1-e.age/.5));}
      else if(e.kind==='bounce'){const a=e.age;
        // Core bounce: the infalling envelope slams into the stiff proto-neutron star and rebounds.
        if(a<.14)this._ring(e.x,e.y,e.r*(.7-.55*a/.14),6,'#ffd7a8',.75);
        this._glow(e.x,e.y,e.r*(.3+a*2.4),'#ffffff',Math.max(0,1-Math.abs(a-.14)/.45)*.95);
        const k=ease(clamp((a-.1)/1.2,0,1));if(a>.1)this._ring(e.x,e.y,e.r*(.2+k*2.8),4+e.r*.3*(1-k),'#e2eaff',.9*(1-k));
        // Neutrinos leave first: a faint front that outruns everything.
        if(a<.4)this._ring(e.x,e.y,e.r*.3+a*2000,3,'#ffffff',.28*(1-a/.4));
        // Shock breakout: a brief UV flash as the bounce shock reaches the surface.
        const b=(a-.12)/.4;if(b>0&&b<1){this._ring(e.x,e.y,e.r*(.75+.35*b),9*(1-b)+2,'#cfe0ff',.95*(1-b));this._glow(e.x,e.y,e.r*(1.4+b),'#bcd2ff',.5*(1-b));}}
      else if(e.kind==='shells')this._shells(e);
      else if(e.kind==='pwn')this._pulsarWind(e);
      else if(e.kind==='tde'){const k=ease(t);this._glow(e.x,e.y,e.r*2+k*220,e.color,.75*Math.pow(1-t,1.5));this._ring(e.x,e.y,e.r*(1.2+k*4),10*(1-k)+2,'#ffffff',.6*(1-k));}
      else if(e.kind==='jetburst'){const b=this.bodyMap.get(e.bodyId);this._jets(b?.x??e.x,b?.y??e.y,b?.radius??e.r,e.tilt,Math.sin(Math.PI*clamp(t,0,1))*1.2,0);}
      else if(e.kind==='ringdown'){const b=this.bodyMap.get(e.bodyId),x=b?.x??e.x,y=b?.y??e.y,r=b?.radius??e.r;for(let i=0;i<3;i++){const k=ease(clamp((e.age-i*.28)/1.2,0,1));if(k>0&&k<1)this._ring(x,y,r*(1.05+k*2.2),8*(1-k)+2,e.color,.7*(1-k)*Math.exp(-i*.5));}}
      else if(e.kind==='kilonova'){const k=ease(t);this._glow(e.x,e.y,60+k*160,'#ff8a5a',.55*(1-t));this._glow(e.x,e.y,30+k*60,'#ffd2a8',.5*Math.max(0,1-e.age/1.5));}
      else if(e.kind==='flash'){this._glow(e.x,e.y,e.size*(.6+ease(t)*.8),e.color,.8*(1-t)*(1-t));}
      else if(e.kind==='wave'&&!this.gpuDisks){for(let i=0;i<3;i++){const R=(e.age-i*.25)*180;if(R>0)this._ring(e.x,e.y,R,14,'#bcd4ff',.12*(1-t));}}
    }
  }

  // Supernova ejecta keep their onion order. Each element shell expands
  // homologously (outer layers fastest) and is shredded by Rayleigh–Taylor
  // instabilities into knots and broken filaments; heavy inner material punches
  // outward in irregular fingers. Over a few seconds the hot ejecta cool and
  // the shells shift to the colours of their emission lines (Hα, [O III],
  // [S II], Fe), turning the blast into a young remnant. In a core collapse the
  // iron core becomes the remnant and is not ejected.
  _ejectaScale(r0,ia,t){return r0*(.7+.3*clamp(t/.3,0,1))+(ia?270:235)*(1-Math.exp(-t/1.5))*1.5;}
  _shells(e){
    const c=this.ctx,t=e.age,appear=clamp((t-.08)/.32,0,1),fade=Math.pow(clamp(1-t/e.duration,0,1),1.2)*appear;if(fade<=0)return;
    const scale=this._ejectaScale(e.r,e.ia,t),grow=Math.min(1,t*.9),emit=ease(clamp((t-1.2)/3.5,0,1)),N=72,h=(k)=>{const v=Math.sin(k*127.1+e.seed*311.7)*43758.5453;return v-Math.floor(v);};
    let area=0;c.save();c.lineCap='butt';c.lineJoin='round';
    e.layers.forEach((l,i)=>{const r0=Math.sqrt(area);area+=l.fraction;const r1=Math.sqrt(Math.min(1,area));if(!e.ia&&l.el==='Fe')return;
      const mid=(r0+r1)/2*scale,thick=Math.max(2,(r1-r0)*scale*.9),col=mixHex(l.color,EMISSION[l.el]||l.color,emit*.9),outer=i===e.layers.length-1,base=(outer?.16:.26)*fade;
      // Irregular wobble (incommensurate frequencies, per-layer phases) and clumping along the shell.
      const ph=[0,1,2,3,4].map(k=>h(i*9+k)*TAU),wob=u=>(Math.sin(2*u+ph[0])*.35+Math.sin(5*u+ph[1])*.3+Math.sin(9*u+ph[2])*.2+Math.sin(15*u+ph[3])*.15)*(.05+.11*grow),
        clump=u=>{const q=Math.max(0,.5+.55*Math.sin(7*u+ph[4])+.35*Math.sin(17*u+ph[2]*1.3)+.2*Math.sin(29*u+ph[1])-.35*grow);return q*Math.sqrt(q);},
        at=(u,k=1)=>{const R=mid*k*(1+wob(u));return[e.x+Math.cos(u)*R,e.y+Math.sin(u)*R];};
      // One smooth closed path per strand; brightness varies round the ring through a
      // conic gradient, so filaments break into clumps without any seams.
      const ring=k=>{c.beginPath();for(let j=0;j<=N;j++){const [x,y]=at(j/N*TAU,k);j?c.lineTo(x,y):c.moveTo(x,y);}c.closePath();},
        paint=a=>{if(!c.createConicGradient)return rgba(col,base*a*.6);const g=c.createConicGradient(0,e.x,e.y);for(let j=0;j<=36;j++)g.addColorStop(j/36,rgba(col,Math.min(1,base*a*clump(j/36*TAU))));return g;};
      // Widths are capped so thick shells (Type Ia, outer envelopes) stay filamentary.
      ring(1);c.strokeStyle=paint(.45);c.lineWidth=Math.min(34,thick*.95);c.stroke();
      c.strokeStyle=paint(1.9);c.lineWidth=clamp(thick*.22,1,6);c.stroke();
      ring(1.05);c.strokeStyle=paint(1.2);c.lineWidth=clamp(thick*.09,.8,2.4);c.stroke();
      if(thick>40){ring(.9);c.strokeStyle=paint(1.1);c.lineWidth=2;c.stroke();}
      // Dense knots ride on the brightest stretches.
      for(let j=0;j<6;j++){const u=h(i*31+j)*TAU,[x,y]=at(u);this._glow(x,y,thick*.7+3,col,.4*fade*clump(u));}
      // Rayleigh–Taylor plumes: chains of knots on a gently curving path, densest at the head.
      if(['Si','O/Ne','Ni/Fe','Si/S'].includes(l.el))for(let j=0;j<6;j++){const a=h(i*17+j)*TAU,len=Math.max(mid*1.08,scale*(.62+.5*h(i*23+j))*grow),w=Math.max(1.5,thick*(.2+.25*h(i*29+j))),bend=(h(i*37+j)-.5)*.6;
        const ww=Math.min(w,6);for(let k=1;k<=11;k++){const f=k/11,R=mid+(len-mid)*f,aa=a+bend*f*f+Math.sin(k*1.7+j)*.015,x=e.x+Math.cos(aa)*R,y=e.y+Math.sin(aa)*R;this._glow(x,y,ww*(.9+1.6*f),col,(.1+.32*f)*fade);}}
    });
    c.restore();
  }
  // A newborn pulsar inflates a synchrotron wind nebula inside the remnant (Crab-like).
  _pulsarWind(e){
    const b=this.bodyMap.get(e.bodyId);if(!b||b.kind!=='ns')return;const c=this.ctx,t=e.age,k=ease(clamp(t/3,0,1)),f=clamp(1-(t-e.duration+3)/3,0,1)*k,R=26+70*k;if(f<=0)return;
    this._glow(b.x,b.y,R*1.6,'#9fd8ff',.22*f);this._glow(b.x,b.y,R*.7,'#e0f4ff',.18*f);
    c.save();c.translate(b.x,b.y);c.rotate((b.seed||0)*TAU+t*.12);c.lineCap='round';
    for(let j=0;j<7;j++){const r=R*(.45+.08*j),a0=j*1.9+t*(.3+.05*j),len=1.2+.5*Math.sin(j*2.3);c.strokeStyle=rgba(j%2?'#b8e6ff':'#d6c8ff',.22*f);c.lineWidth=2.2-j*.15;c.beginPath();c.ellipse(0,0,r,r*.62,j*.4,a0,a0+len);c.stroke();}
    c.strokeStyle=rgba('#e8f6ff',.35*f);c.lineWidth=1.6;c.beginPath();c.ellipse(0,0,R*.32,R*.12,0,0,TAU);c.stroke();
    c.restore();
  }

  /* ---------- arena & guidance ---------- */
  _arena(){
    const c=this.ctx,S=this.sim,danger=S.danger||0,red=danger>.05,top=S.ceiling??12,L=S.wallLeft??20,Rt=S.wallRight??680,F=S.floor??798;
    // A closed chamber: walls, floor and ceiling all bound the bodies.
    const wall=c.createLinearGradient(0,top,0,F);wall.addColorStop(0,'rgba(170,186,255,.2)');wall.addColorStop(.3,'rgba(150,170,255,.1)');wall.addColorStop(1,'rgba(170,190,255,.32)');
    c.strokeStyle=wall;c.lineWidth=1;c.beginPath();c.moveTo(L+.5,top);c.lineTo(L+.5,F+.5);c.moveTo(Rt-.5,top);c.lineTo(Rt-.5,F+.5);c.stroke();
    const roof=c.createLinearGradient(0,top,0,top+22);roof.addColorStop(0,'rgba(130,150,255,.07)');roof.addColorStop(1,'rgba(130,150,255,0)');c.fillStyle=roof;c.fillRect(L+1,top,Rt-L-2,22);
    const lid=c.createLinearGradient(L,0,Rt,0);lid.addColorStop(0,'rgba(180,196,255,.1)');lid.addColorStop(.5,'rgba(210,220,255,.32)');lid.addColorStop(1,'rgba(180,196,255,.1)');c.strokeStyle=lid;c.beginPath();c.moveTo(L,top-.5);c.lineTo(Rt,top-.5);c.stroke();
    const floor=c.createLinearGradient(0,F-28,0,F+2);floor.addColorStop(0,'rgba(120,140,255,0)');floor.addColorStop(1,'rgba(130,150,255,.1)');c.fillStyle=floor;c.fillRect(L+1,F-28,Rt-L-2,28);
    const line=c.createLinearGradient(L,0,Rt,0);line.addColorStop(0,'rgba(180,196,255,.15)');line.addColorStop(.5,'rgba(210,220,255,.55)');line.addColorStop(1,'rgba(180,196,255,.15)');c.strokeStyle=line;c.beginPath();c.moveTo(L,F+.5);c.lineTo(Rt,F+.5);c.stroke();
    for(let x=40;x<680;x+=20){if(x<=L||x>=Rt)continue;c.fillStyle=x%100===0?'rgba(200,210,255,.32)':'rgba(200,210,255,.12)';c.fillRect(x-.5,F+3,1,x%100===0?6:3);}
    // Danger line: hairline, warming to red as material piles up.
    const pulse=red?.55+.45*Math.sin(this.time*(5+danger*10)):1;
    if(red){const g=c.createLinearGradient(0,100,0,150);g.addColorStop(0,rgba('#ff4a64',.18*danger*pulse));g.addColorStop(1,'rgba(255,74,100,0)');c.fillStyle=g;c.fillRect(L+1,100,Rt-L-2,50);}
    c.strokeStyle=red?rgba('#ff6a7c',.45+.45*pulse*danger):'rgba(220,226,255,.2)';c.setLineDash([2,6]);c.beginPath();c.moveTo(L+4,100.5);c.lineTo(Rt-4,100.5);c.stroke();c.setLineDash([]);
    c.fillStyle=red?rgba('#ff8a98',.9):'rgba(210,218,255,.38)';c.font=`600 15px ${FONT}`;c.textAlign='right';c.fillText(t('dangerLine'),Rt-8,90);
    c.strokeStyle='rgba(200,214,255,.4)';c.lineWidth=1.5;for(const [x,dd] of [[L+.5,1],[Rt-.5,-1]])for(const [y,e] of [[top-.5,1],[F+.5,-1]]){c.beginPath();c.moveTo(x+dd*14,y);c.lineTo(x,y);c.lineTo(x,y+e*14);c.stroke();}
  }

  _dropGuide(){
    const c=this.ctx,type=STAR_TYPES[this.sim.nextType]||STAR_TYPES[0],r=type.radius,x=clamp(this.pointerX,this.sim.wallLeft+2+r,this.sim.wallRight-2-r),y0=this.sim.dropHeight?.(this.sim.nextType)??62,ready=this.sim.state!=='playing'||this.sim.canDrop;
    let land=this.sim.floor-r;for(const b of this.sim.bodies){const dx=Math.abs(b.x-x),R=b.radius+r;if(dx<R&&b.y>y0){const hit=b.y-Math.sqrt(R*R-dx*dx);if(hit>y0+r&&hit<land)land=hit;}}
    const beam=c.createLinearGradient(0,y0+r,0,land);beam.addColorStop(0,rgba(type.color,.38));beam.addColorStop(1,rgba(type.color,.04));c.fillStyle=beam;c.fillRect(x-.75,y0+r+4,1.5,Math.max(0,land-y0-r-4));
    c.save();c.setLineDash([3,5]);c.strokeStyle=rgba(type.color,.42);c.lineWidth=1.2;c.beginPath();c.arc(x,land,r,0,TAU);c.stroke();c.restore();
    c.globalAlpha=ready?1:.45;c.globalCompositeOperation='lighter';this._glow(x,y0,r*2.6,type.color,.4+.08*Math.sin(this.time*3));c.globalCompositeOperation='source-over';
    c.globalAlpha=ready?1:.45;if(!this._tex(this.sim.nextType,x,y0,r,this.time*.15)){c.fillStyle=type.color;c.beginPath();c.arc(x,y0,r,0,TAU);c.fill();}
    c.globalAlpha=1;c.textAlign='center';c.textBaseline='middle';c.font=`700 ${clamp(r*.62,13,34)}px ${FONT}`;c.fillStyle=this.sim.nextType>=2?'rgba(40,36,70,.75)':'rgba(255,250,240,.95)';c.fillText(type.type,x,y0+1);c.textBaseline='alphabetic';
  }
  _danger(){const d=this.sim.state==='playing'?this.sim.danger||0:0;if(d<.05)return;const c=this.ctx,a=d*(.55+.45*Math.sin(this.time*(5+d*10))),g=c.createLinearGradient(0,0,0,240);g.addColorStop(0,rgba('#ff3a58',.3*a));g.addColorStop(1,'rgba(255,58,88,0)');c.fillStyle=g;c.fillRect(0,0,W,240);}

  /* ---------- finale ---------- */
  _cinematic(){
    const c=this.ctx,t=this.cinematicTime,fade=clamp((t-1)/5,0,1),zoom=1-clamp(t/6,0,1)*.55,atlas=this._dotAtlas();
    if(t<5){c.save();c.translate(350,410);c.scale(zoom,zoom);c.translate(-350,-410);c.globalAlpha=1-clamp((t-2)/3,0,1);c.globalCompositeOperation='lighter';this._halos();this._particles(true);c.globalCompositeOperation='source-over';for(const b of this.sim.bodies){if(b.kind==='bh')this._blackHole(b);else if(b.kind==='star')this._star(b);}c.restore();c.globalAlpha=1;}
    const count=this.quality==='low'?900:1800,rotation=this.reducedMotion?0:this.time*.02;c.globalCompositeOperation='lighter';
    // The seed black hole (lensed by the optics pass) stays the galaxy's dark heart.
    const seed=this.sim.bodies.find(b=>b.id===this.sim.winnerId),hole=this.gpuDisks&&seed?seed:null,cx=hole?hole.x:350,cy=hole?hole.y:410,shadow=hole?hole.radius*1.08:0;
    if(hole){const g=c.createRadialGradient(cx,cy,shadow,cx,cy,300);g.addColorStop(0,'rgba(255,207,150,0)');g.addColorStop(.08,rgba('#ffcf96',.22*fade));g.addColorStop(.45,rgba('#ffcf96',.06*fade));g.addColorStop(1,'rgba(255,207,150,0)');c.fillStyle=g;c.beginPath();c.arc(cx,cy,300,0,TAU);c.fill();}
    else{this._glow(350,410,260*fade,'#ffcf96',.35*fade);this._glow(350,410,120*fade,'#fff0d8',.4*fade);}
    const tones=[[0,2],[4,2],[2,1],[1,3]];
    for(let i=0;i<count;i++){const p=this.galaxy[i],a=p.angle+rotation*(1.6-p.r),r=p.r*350,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.44+p.z*140,[ramp,idx]=tones[p.tone],s=(p.size+1)*(p.tone===2?2.4:1.5);
      if(hole&&(x-cx)**2+(y-cy)**2<shadow*shadow)continue;
      if(atlas){c.globalAlpha=p.a*fade*.9;c.drawImage(atlas,idx*24,ramp*24,24,24,x-s,y-s,s*2,s*2);}else{c.globalAlpha=p.a*fade;c.fillStyle=RAMPS[ramp][idx];c.fillRect(x,y,1.5,1.5);}}
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
    if(fade>0&&!this.gpuDisks){c.globalAlpha=fade;this._cpuBlackHole({x:350,y:410,radius:22},{level:1,tilt:0});c.globalAlpha=1;}
    if(t>4){c.globalAlpha=clamp((t-4)/1.5,0,1);c.font=`600 15px ${FONT}`;c.textAlign='center';c.fillStyle='rgba(255,228,200,.8)';c.fillText('10⁶ M☉',cx,cy+Math.max(130,shadow*2.4));c.globalAlpha=1;}
  }
}
