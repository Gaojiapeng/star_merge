import { STAR_TYPES, PHYSICS, gravityAt } from './simulation.js?v=2.0.1';
const W=700,H=820,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const palettes=[['#481d24','#8d2e30','#de4938','#ff7950','#ffc18c'],['#583322','#a7552b','#e9923d','#ffc36c','#ffe2a3'],['#655125','#af8537','#e6b952','#ffe194','#fff4ce'],['#59534b','#a7987b','#dbcfad','#fff0cc','#fff9e9'],['#313f66','#6078ab','#a2bddd','#d7edff','#f5fbff'],['#26345f','#435e9e','#799bdd','#accbff','#e5eeff'],['#332754','#655095','#9385cf','#c5b9ff','#f0e8ff']];
const cooling=['#fffbe0','#ffe6a6','#ffc26e','#f39148','#c3573e','#74424c','#3c3543','#20242c'],cyan=['#f0ffff','#bbf7ff','#6cd5fa','#489ac5','#39668c','#2c3d5d'];
function random(seed){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=n+Math.imul(n^n>>>7,61|n)^n;return((n^n>>>14)>>>0)/4294967296;};}
function massLabel(m){return m<1?m.toFixed(2).replace(/0$/,''):m<10?m.toFixed(1).replace(/\.0$/,''):Math.round(m).toLocaleString('en-US');}
/** Point-mass thin lens, with the secondary image's reversed parity.
 * Pixel angular coordinates and a schematic source/lens distance.
 * No framebuffer readback or full-screen relativistic ray marching.
 */
export function lensImages(x,y,einsteinRadius){
  const beta=Math.hypot(x,y),b=Math.max(.001,beta),e=Math.max(0,einsteinRadius),root=Math.sqrt(b*b+4*e*e),outer=(b+root)*.5,inner=(b-root)*.5;
  const ux=beta>.001?x/b:1,uy=beta>.001?y/b:0,u=b/Math.max(.001,e),total=(u*u+2)/(Math.max(.001,u)*Math.sqrt(u*u+4));
  return{outerX:ux*outer,outerY:uy*outer,innerX:ux*inner,innerY:uy*inner,outerGain:Math.min(6,(total+1)*.5),innerGain:Math.min(5,Math.max(0,(total-1)*.5)),u};
}
export class Renderer{
  constructor(canvas,simulation){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.sim=simulation;
    this.quality='high';this.reducedMotion=false;this.showLayers=true;this.showLensing=true;this.pointerX=350;this.selectedId=null;this.inspectMode=false;
    this.time=0;this.particles=[];this.effects=[];this.emitters=[];this.materials=new Map();this.flowCarry=new Map();this.cinematicTime=0;this.isCinematicDone=false;this.lastState=simulation.state;this.rng=random(171019);this.shake=0;this.flash=0;
    this.stars=Array.from({length:240},()=>({x:this.rng()*W,y:this.rng()*H,a:.18+this.rng()*.65,size:this.rng()>.94?2:1,phase:this.rng()*TAU}));
    this.stars.unshift({x:548,y:750,a:.8,size:2,phase:0},{x:556,y:723,a:.7,size:1,phase:1});
    this.galaxy=Array.from({length:1600},(_,i)=>{const r=Math.pow(this.rng(),.65);return{r,angle:i%4*Math.PI/2+r*9+(this.rng()-.5)*(.1+r*.6),z:(this.rng()-.5)*r*.13,a:.25+this.rng()*.75};});this.resize();
  }
  get particleLimit(){return this.quality==='low'?1100:2600;}
  get materialLimit(){return this.quality==='low'?10000:22000;}
  resize(){const r=this.canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,this.quality==='low'?1:1.5);this.canvas.width=Math.max(1,Math.round((r.width||W)*d));this.canvas.height=Math.max(1,Math.round((r.height||H)*d));this.scale=Math.min(this.canvas.width/W,this.canvas.height/H);this.offsetX=(this.canvas.width-W*this.scale)/2;this.offsetY=(this.canvas.height-H*this.scale)/2;this.ctx.imageSmoothingEnabled=false;}
  setQuality(value){this.quality=value==='low'?'low':'high';this.materials.clear();this.resize();}
  setReducedMotion(value){this.reducedMotion=!!value;this.shake=0;this.flash=0;}
  reset(){this.particles.length=0;this.effects.length=0;this.emitters.length=0;this.materials.clear();this.flowCarry.clear();this.cinematicTime=0;this.isCinematicDone=false;this.shake=0;this.flash=0;this.lastState=null;}
  event(ev){
    if(!ev||ev.silent)return;const x=ev.x??350,y=ev.y??410,power=ev.power||1;
    if(ev.kind==='supernova'){
      this.effects.push({kind:'shock',x,y,age:0,duration:14,radius:ev.radius||320,power});
      this.emitters.push({kind:'ejecta',x,y,age:0,duration:3.2,carry:0,rate:this.quality==='low'?80:180,radius:ev.ejectaRadius||30,power});
      this._burstPixels(x,y,this.quality==='low'?110:260,ev.ejectaRadius||30,power,'ejecta');
      for(const m of ev.ejecta||[])this._burstPixels(m.x,m.y,Math.min(150,m.radius*2),m.radius,power,'ejecta');
      if(!this.reducedMotion){this.shake=4;this.flash=.07;}
    }else if(ev.kind==='wave'){this.effects.push({kind:'wave',x,y,age:0,duration:6,power});this._burstPixels(x,y,ev.source==='ns'?36:65,8,.3,'plasma');
    }else if(ev.kind==='burst'){
      const b=this.sim.bodies.find(b=>b.id===ev.bodyId),angle=(b?.rotation||0)+.4,count=this.quality==='low'?30:70;
      for(let i=0;i<count;i++){const a=angle+(i%2?Math.PI:0)+(this.rng()-.5)*.14,speed=90+this.rng()*150;this._particle({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:2.7+this.rng(),kind:'jet',owner:ev.bodyId});}
      this.effects.push({kind:'pulse',x,y,age:0,duration:1.6,power});
    }else if(ev.kind==='merge'){this._burstPixels(x,y,this.quality==='low'?25:65,8,.6,'plasma');this.effects.push({kind:'fusion',x,y,age:0,duration:1.4,power});
    }else if(ev.kind==='evolve'){if(ev.variant==='planetary-nebula')this._burstPixels(x,y,90,20,.3,'smoke');this.materials.delete(ev.bodyId);
    }else if(ev.kind==='win'){this.cinematicTime=0;this.isCinematicDone=false;}
    if(this.effects.length>18)this.effects.shift();
  }
  _particle(p){if(this.particles.length>=this.particleLimit)return;this.particles.push({x:p.x,y:p.y,px:p.x,py:p.y,vx:p.vx||0,vy:p.vy||0,age:0,life:p.life||4,kind:p.kind||'plasma',owner:p.owner??null,size:p.size||(this.rng()>.8?3:2),hot:p.hot??1});}
  _burstPixels(x,y,count,radius,power,kind){for(let i=0;i<count;i++){const a=this.rng()*TAU,r=Math.sqrt(this.rng())*radius,speed=(15+this.rng()*95)*Math.sqrt(power);this._particle({x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:kind==='ejecta'?8+this.rng()*6:kind==='smoke'?9:1.5+this.rng()*2,kind,hot:this.rng()*.25+.75});}}
  render(dt=1/60){
    dt=Number.isFinite(dt)?clamp(dt,0,.06):0;if(this.sim.state==='paused')dt=0;if(this.lastState==='won'&&this.sim.state!=='won')this.reset();this.lastState=this.sim.state;this.time+=dt;
    this.compact=this.sim.bodies.filter(b=>b.kind!=='star');this.bodyMap=new Map(this.sim.bodies.map(b=>[b.id,b]));
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle='#07080d';c.fillRect(0,0,this.canvas.width,this.canvas.height);c.setTransform(this.scale,0,0,this.scale,this.offsetX,this.offsetY);
    this._advance(dt);this._background();
    if(this.sim.state==='won'){this.cinematicTime+=dt;this._cinematic();this.isCinematicDone=this.cinematicTime>=12;return;}
    c.save();if(!this.reducedMotion&&this.shake>.05)c.translate(Math.sin(this.time*71)*this.shake,Math.sin(this.time*103)*this.shake*.5);
    this._arena();this._particles(false);
    for(const b of this.sim.bodies)if(b.kind!=='bh'&&b.kind!=='ns')this._star(b);
    for(const b of this.compact)if(b.kind==='bh'||b.kind==='ns')this._remnant(b);
    this._particles(true);this._effects();if(!this.inspectMode&&['ready','playing'].includes(this.sim.state))this._dropGuide();c.restore();
    if(this.flash>.001&&!this.reducedMotion){c.fillStyle=`rgba(255,236,205,${this.flash})`;c.fillRect(0,0,W,H);}this.shake*=Math.exp(-dt*5);this.flash*=Math.exp(-dt*3);
  }
  _advance(dt){
    if(dt<=0)return;const alive=new Set(this.sim.bodies.map(b=>b.id));for(const id of this.materials.keys())if(!alive.has(id))this.materials.delete(id);
    for(const e of this.effects)e.age+=dt;this.effects=this.effects.filter(e=>e.age<e.duration);
    for(const e of this.emitters){e.age+=dt;e.carry+=dt*e.rate*(1-e.age/e.duration);while(e.carry>=1){e.carry--;this._burstPixels(e.x,e.y,1,e.radius,e.power,'ejecta');}}this.emitters=this.emitters.filter(e=>e.age<e.duration);
    for(const source of this.compact)for(const id of source.accretingIds||[source.accretingId]){
      const donor=this.bodyMap.get(id);if(!donor||donor.kind!=='star')continue;const key=source.id+':'+id,rate=(this.quality==='low'?24:50)*Math.min(2,1+(source.accretionRate||.1));let carry=(this.flowCarry.get(key)||0)+dt*rate;
      while(carry>=1){carry--;const dx=source.x-donor.x,dy=source.y-donor.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,edge=donor.radius*(.6+this.rng()*.35),spread=(this.rng()-.5)*donor.radius*.45,orbit=Math.sqrt(PHYSICS.gravityConstant*source.mass/Math.max(30,d))*.4;
        this._particle({x:donor.x+ux*edge-uy*spread,y:donor.y+uy*edge+ux*spread,vx:source.vx*.2+ux*20-uy*orbit,vy:source.vy*.2+uy*20+ux*orbit,life:12+this.rng()*6,kind:'stream',owner:source.id,hot:.7});}
      this.flowCarry.set(key,carry);
    }
    if(this.flowCarry.size>160)this.flowCarry.clear();let write=0;
    for(const p of this.particles){
      p.age+=dt;if(p.age>=p.life)continue;p.px=p.x;p.py=p.y;let nearest=this.bodyMap.get(p.owner),nearestD=Infinity;
      if(!nearest)for(const b of this.compact){const d=(p.x-b.x)**2+(p.y-b.y)**2;if(d<nearestD){nearest=b;nearestD=d;}}
      if(nearest){const dx=nearest.x-p.x,dy=nearest.y-p.y,d=Math.hypot(dx,dy);if(d<nearest.radius*.58&&nearest.kind==='bh')continue;const f=gravityAt(dx,dy,nearest.mass,Math.max(20,nearest.radius*.55));p.vx+=f.x*dt;p.vy+=f.y*dt;if(p.kind==='stream'&&d<nearest.radius*3.2){const drag=Math.exp(-dt*.65);p.vx*=drag;p.vy*=drag;p.hot=1;}}
      if(p.kind==='ejecta'||p.kind==='smoke'){const drag=Math.exp(-dt*(p.age>4?.23:.055));p.vx*=drag;p.vy=p.vy*drag-(p.age>5?2:0)*dt;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.kind!=='jet'){if(p.x<21||p.x>679){p.x=clamp(p.x,21,679);p.vx*=-.25;}if(p.y>796){p.y=796;p.vy*=-.18;p.vx*=.985;}}
      if(p.x< -100||p.x>800||p.y< -250||p.y>1000)continue;this.particles[write++]=p;
    }
    this.particles.length=Math.min(write,this.particleLimit);
  }
  _warp(x,y){if(this.reducedMotion)return{x,y};for(const e of this.effects){if(e.kind!=='wave')continue;const dx=x-e.x,dy=y-e.y,d=Math.hypot(dx,dy),front=e.age*160,band=Math.exp(-Math.pow((d-front)/70,2)),h=.09*e.power*band*Math.sin((d-front)*.055)*Math.exp(-e.age*.23);x+=dx*h;y-=dy*h;}return{x,y};}
  _background(){
    const c=this.ctx;c.fillStyle='#0a0b13';c.fillRect(0,0,W,H);
    for(let i=0;i<28;i++){c.fillStyle=i%2?'#10101b':'#0c121b';c.fillRect(i*173%W,i*251%H,2+i%3,2);}
    const count=this.quality==='low'?145:this.stars.length;
    for(let i=0;i<count;i++){
      const s=this.stars[i];let lens=null,strength=0,eRadius=0;
      if(this.showLensing)for(const b of this.compact){if(b.kind!=='bh'&&b.kind!=='ns')continue;const e=b.kind==='bh'?Math.min(140,b.radius*1.75):b.radius*.65,d2=(s.x-b.x)**2+(s.y-b.y)**2,weight=e*e/(d2+1);if(d2<e*e*25&&weight>strength){strength=weight;lens=b;eRadius=e;}}
      const a=s.a*(this.reducedMotion?1:.9+.1*Math.sin(this.time*.35+s.phase));
      if(lens){const image=lensImages(s.x-lens.x,s.y-lens.y,eRadius);this._lightPoint(lens.x+image.outerX,lens.y+image.outerY,a*Math.min(1.5,image.outerGain),s.size);if(image.innerGain>.025){this._lightPoint(lens.x+image.innerX,lens.y+image.innerY,a*Math.min(.9,image.innerGain),s.size);if(image.u<.4)this._einsteinArc(lens,image,eRadius,a);}}
      else this._lightPoint(s.x,s.y,a,s.size);
    }
  }
  _lightPoint(x,y,a,size){const p=this._warp(x,y),c=this.ctx;c.globalAlpha=clamp(a,0,1);c.fillStyle='#bbbfdb';c.fillRect(Math.round(p.x/2)*2,Math.round(p.y/2)*2,size+1,size+1);c.globalAlpha=1;}
  _einsteinArc(lens,image,r,a){const c=this.ctx,theta=Math.atan2(image.outerY,image.outerX),span=clamp(.08/image.u,.1,TAU),steps=this.quality==='low'?12:24;c.fillStyle='#c9c4e5';for(let side=0;side<(image.u<.04?1:2);side++){const radius=side?Math.hypot(image.innerX,image.innerY):Math.hypot(image.outerX,image.outerY);c.globalAlpha=Math.min(side?.3:.55,a);for(let i=0;i<steps;i++){const angle=theta+side*Math.PI-span/2+span*i/(steps-1);c.fillRect(Math.round((lens.x+Math.cos(angle)*radius)/2)*2,Math.round((lens.y+Math.sin(angle)*radius)/2)*2,2,2);}}c.globalAlpha=1;}
  _arena(){const c=this.ctx;c.strokeStyle='#252436';c.lineWidth=1;c.beginPath();c.moveTo(20,104);c.lineTo(20,798);c.lineTo(680,798);c.lineTo(680,104);c.stroke();c.strokeStyle=this.sim.danger>.1?'#b66a5a':'#3c3544';c.setLineDash([4,10]);c.beginPath();c.moveTo(20,100);c.lineTo(680,100);c.stroke();c.setLineDash([]);c.fillStyle='#706375';c.font='15px monospace';c.textAlign='right';c.fillText('警戒线',674,89);for(let x=40;x<680;x+=20){c.fillStyle=x%100===0?'#60516b':'#302b3d';c.fillRect(x,800,2,x%100===0?7:3);}}
  _material(body){
    let m=this.materials.get(body.id);const cell=this.quality==='low'?5:4,size=Math.ceil(body.radius*2/cell)+4;
    const stellarCount=this.sim.bodies.reduce((n,b)=>n+(b.kind==='star'||b.kind==='wd'?1:0),0);
    const count=Math.min(Math.max(12,Math.floor(Math.PI*(body.radius/cell)**2*.98)),Math.floor(this.materialLimit/Math.max(1,stellarCount)));
    if(m&&(m.size!==size||m.type!==body.type||m.kind!==body.kind||m.points.length!==count)){this.materials.delete(body.id);m=null;}
    if(!m){const sprite=document.createElement('canvas');sprite.width=size;sprite.height=size;const context=sprite.getContext('2d'),rng=random(body.id*7123+Math.round(body.seed*1e5));
      const points=Array.from({length:count},()=>({r:Math.sqrt(rng())*.985,theta:rng()*TAU,spin:(rng()>.5?1:-1)*(.03+rng()*.1),jitter:rng()*TAU,shade:rng()}));m={sprite,context,points,size,type:body.type,kind:body.kind,last:-1,cell};this.materials.set(body.id,m);}
    return m;
  }
  _star(body){
    const c=this.ctx,m=this._material(body),frame=Math.floor(this.time*(this.reducedMotion?0:12)),terminal=body.evolution==='pre-supernova',layerKey=`${this.showLayers}-${terminal}`;
    if(m.last!==frame||m.layerKey!==layerKey){
      m.last=frame;m.layerKey=layerKey;const ctx=m.context;ctx.clearRect(0,0,m.size,m.size);const pal=body.kind==='wd'?['#515367','#858ca7','#b8c4df','#e2edff','#ffffff']:palettes[body.type],r=body.radius/m.cell,mid=m.size/2,t=this.reducedMotion?0:frame/12;
      // Constrained material pixels advect through a convective envelope.
      // Stripped/ejected material switches to ballistic gravitational tracers.
      for(const p of m.points){const a=p.theta+p.spin*t,rad=p.r*(1+.023*Math.sin(t*1.8+p.jitter)),x=Math.cos(a)*rad,y=Math.sin(a)*rad;let color=pal[clamp(Math.floor((1-p.r)*3+p.shade*2),0,4)];if(this.showLayers&&x>0&&y>-.15*x)color=terminal?(rad<.18?'#f1e3ce':rad<.32?'#bc9fcd':rad<.48?'#74a7c9':rad<.65?'#df9e55':rad<.82?'#d8c084':pal[2]):rad<.25?'#fff1c4':rad<.63?pal[2]:pal[1];ctx.fillStyle=color;ctx.globalAlpha=.67+p.shade*.33;ctx.fillRect(Math.round(mid+x*r),Math.round(mid+y*r),1,1);}ctx.globalAlpha=1;
    }
    const size=m.size*m.cell;c.drawImage(m.sprite,Math.round((body.x-size/2)/2)*2,Math.round((body.y-size/2)/2)*2,size,size);
    const r=body.radius,pal=palettes[body.type];c.globalCompositeOperation='lighter';for(let i=0;i<(this.quality==='low'?7:13);i++){const a=i*2.39996+body.seed*TAU+this.time*.1,rr=r+3+i%3*2;c.globalAlpha=.16+.12*Math.sin(this.time*.7+i);c.fillStyle=pal[2];c.fillRect(Math.round((body.x+Math.cos(a)*rr)/2)*2,Math.round((body.y+Math.sin(a)*rr)/2)*2,2,2);}c.globalAlpha=1;c.globalCompositeOperation='source-over';this._label(body,body.kind==='wd'?'WD':STAR_TYPES[body.type].type);
    if(terminal){const left=Math.max(0,body.collapseAt-body.age),f=clamp(left/25,0,1);c.fillStyle='#36232f';c.fillRect(body.x-r,body.y+r+23,r*2,3);c.fillStyle='#db9f87';c.fillRect(body.x-r,body.y+r+23,r*2*f,3);c.font='16px monospace';c.textAlign='center';c.fillStyle='#ecc7af';c.fillText(`${Math.ceil(left)}s`,body.x,body.y+r+44);}this._selection(body);
  }
  _label(body,type){const c=this.ctx,r=body.radius;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${r<24?18:22}px monospace`;c.strokeStyle='#09090ee0';c.lineWidth=4;c.strokeText(type,body.x,body.y-3);c.fillStyle='#fff6e5';c.fillText(type,body.x,body.y-3);c.font=`${r<24?14:16}px monospace`;c.strokeText(massLabel(body.mass),body.x,body.y+16);c.fillStyle='#e6d4ca';c.fillText(massLabel(body.mass),body.x,body.y+16);c.textBaseline='alphabetic';}
  _selection(body){if(this.selectedId!==body.id)return;const c=this.ctx,r=body.radius+8;c.strokeStyle='#eed0a5';c.lineWidth=2;c.setLineDash([5,8]);c.strokeRect(body.x-r,body.y-r,r*2,r*2);c.setLineDash([]);}
  _remnant(b){
    const c=this.ctx,r=b.radius;
    if(b.kind==='ns'){
      const a=(b.rotation||0)+this.time*(this.reducedMotion?0:.12),count=this.quality==='low'?36:72;c.globalCompositeOperation='lighter';
      for(let i=0;i<count;i++){const angle=i*2.39996,rr=Math.sqrt((i+.5)/count)*r;c.fillStyle=cyan[i%3];c.globalAlpha=.6+i%3*.15;c.fillRect(Math.round((b.x+Math.cos(angle)*rr)/2)*2,Math.round((b.y+Math.sin(angle)*rr)/2)*2,3,3);}
      if(b.accretingId)for(let side=-1;side<=1;side+=2)for(let i=0;i<17;i++){const d=r+5+i*3;c.globalAlpha=(1-i/17)*.35;c.fillStyle='#9fe7ff';c.fillRect(Math.round((b.x+Math.cos(a)*d*side)/2)*2,Math.round((b.y+Math.sin(a)*d*side)/2)*2,2+i%2,2);}
      c.globalAlpha=1;c.globalCompositeOperation='source-over';c.font='16px monospace';c.textAlign='center';c.fillStyle='#bce7f9';c.fillText(`NS ${massLabel(b.mass)}`,b.x,b.y+r+22);
    }else{
      this._disk(b,false);c.fillStyle='#010104';for(let y=-r;y<=r;y+=2){const x=Math.sqrt(Math.max(0,r*r-y*y));c.fillRect(Math.floor((b.x-x)/2)*2,Math.floor((b.y+y)/2)*2,Math.ceil(x)*2,2);}
      if(this.showLensing){c.fillStyle='#bda98f';c.globalAlpha=.34;for(let i=0;i<70;i++){const a=i/70*TAU;c.fillRect(Math.round((b.x+Math.cos(a)*r*1.035)/2)*2,Math.round((b.y+Math.sin(a)*r*1.035)/2)*2,2,2);}c.globalAlpha=1;}
      this._disk(b,true);c.font='16px monospace';c.textAlign='center';c.fillStyle='#d5b5b6';c.fillText(`BH ${massLabel(b.mass)}`,b.x,b.y+r*1.7+18);
    }this._selection(b);
  }
  _disk(b,front){
    const c=this.ctx,r=b.radius,count=this.quality==='low'?130:300;c.globalCompositeOperation='lighter';
    for(let i=0;i<count;i++){const spread=i*.61803398875%1,rr=r*(1.35+spread*1.6),omega=Math.sqrt(PHYSICS.gravityConstant*b.mass/rr**3),a=i*2.39996+(this.reducedMotion?0:this.time*omega*.16),sin=Math.sin(a);if(front?sin<0:sin>=0)continue;const x=Math.cos(a)*rr;let y=sin*rr*.24;
      // Analytic backside image bent above/below the Schwarzschild shadow.
      if(!front&&this.showLensing)y-=Math.sqrt(Math.max(0,1-(x/(r*3))**2))*r*.95;
      const near=1-spread,doppler=.55+.45*(1+Math.cos(a))*.5;c.globalAlpha=(.25+near*.5)*doppler;c.fillStyle=near>.72?'#ffefc1':near>.35?'#f2b66c':'#a25a56';c.fillRect(Math.round((b.x+x)/2)*2,Math.round((b.y+y)/2)*2,2+i%2,2);
      if(!front&&this.showLensing&&i%3===0){c.globalAlpha*=.3;c.fillRect(Math.round((b.x+x)/2)*2,Math.round((b.y-y*.8)/2)*2,2,2);}
    }c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }
  _particles(front){
    const c=this.ctx;c.globalCompositeOperation=front?'lighter':'source-over';
    for(const p of this.particles){if(front?p.kind==='smoke':p.kind!=='smoke')continue;const fraction=clamp(p.age/p.life,0,1),pal=p.kind==='jet'?cyan:cooling,shade=p.kind==='stream'?clamp(Math.floor(4-p.hot*3),0,4):Math.min(pal.length-1,Math.floor(fraction*pal.length));c.fillStyle=pal[shade];c.globalAlpha=Math.min(1,(1-fraction)*1.5)*(p.kind==='smoke'?.2:.85);const x=Math.round(p.x/2)*2,y=Math.round(p.y/2)*2;if(!this.reducedMotion&&p.kind!=='smoke'){c.globalAlpha*=.32;c.fillRect(Math.round(p.px/2)*2,Math.round(p.py/2)*2,p.size+1,p.size+1);c.globalAlpha*=2.5;}c.fillRect(x,y,p.size,p.size);if(front&&p.age<.7&&this.quality==='high'){c.globalAlpha*=.08;c.fillRect(x-3,y-3,p.size+6,p.size+6);}}
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }
  _effects(){
    const c=this.ctx;for(const e of this.effects){
      if(e.kind==='shock'){const t=e.age/e.duration,r=e.radius*Math.min(1,e.age/2.4),alpha=e.age<2.4?.28*(1-e.age/3):0;if(alpha>0){c.fillStyle='#e3aa9a';c.globalAlpha=this.reducedMotion?alpha*.35:alpha;for(let i=0;i<100;i++){const a=i/100*TAU;c.fillRect(Math.round((e.x+Math.cos(a)*r)/3)*3,Math.round((e.y+Math.sin(a)*r)/3)*3,3,3);}}if(t>.2){c.globalAlpha=(1-t)*.1;c.fillStyle='#713d53';for(let i=0;i<18;i++){const a=i*2.39996,rr=e.radius*(.2+.7*(i*.37%1));c.fillRect(e.x+Math.cos(a)*rr,e.y+Math.sin(a)*rr,4,4);}}
      }else if(e.kind==='wave'){const front=e.age*160,samples=this.quality==='low'?42:72;c.fillStyle='#8775ab';for(let ring=0;ring<2;ring++)for(let i=0;i<samples;i++){const a=i/samples*TAU,rr=front-ring*20;if(rr<0)continue;const strain=Math.cos(a*2)*Math.sin(e.age*5)*7*e.power*Math.exp(-e.age*.4);c.globalAlpha=.18*(1-e.age/e.duration);c.fillRect(Math.round((e.x+Math.cos(a)*(rr+strain))/3)*3,Math.round((e.y+Math.sin(a)*(rr-strain))/3)*3,2,2);}
      }else if(e.kind==='pulse'||e.kind==='fusion'){c.globalAlpha=.22*(1-e.age/e.duration);c.fillStyle=e.kind==='pulse'?'#8acbeb':'#e4b89a';const r=5+e.age*(e.kind==='pulse'?80:36);for(let i=0;i<24;i++){const a=i/24*TAU;c.fillRect(Math.round((e.x+Math.cos(a)*r)/2)*2,Math.round((e.y+Math.sin(a)*r)/2)*2,2,2);}}
    }c.globalAlpha=1;
  }
  _dropGuide(){const c=this.ctx,type=STAR_TYPES[this.sim.nextType]||STAR_TYPES[0],x=clamp(this.pointerX,22+type.radius,678-type.radius);c.setLineDash([3,9]);c.lineWidth=1;c.strokeStyle='#6c556a';c.beginPath();c.moveTo(x,62+type.radius);c.lineTo(x,450);c.stroke();c.setLineDash([]);c.fillStyle=type.color;c.globalAlpha=.6;for(let i=0;i<20;i++){const a=i*2.39996,r=Math.sqrt((i+.5)/20)*type.radius*.8;c.fillRect(Math.round((x+Math.cos(a)*r)/3)*3,Math.round((58+Math.sin(a)*r)/3)*3,3,3);}c.globalAlpha=1;c.font='600 22px monospace';c.textAlign='center';c.fillStyle='#f4dfd1';c.fillText(type.type,x,65);}
  _cinematic(){
    const c=this.ctx,t=this.cinematicTime,fade=clamp((t-1)/5,0,1),zoom=1-clamp(t/6,0,1)*.55;
    if(t<5){c.save();c.translate(350,410);c.scale(zoom,zoom);c.translate(-350,-410);c.globalAlpha=1-clamp((t-2)/3,0,1);for(const b of this.sim.bodies){if(b.kind==='bh')this._remnant(b);else if(b.kind==='star')this._star(b);}c.restore();c.globalAlpha=1;}
    const count=this.quality==='low'?850:1600,rotation=this.reducedMotion?0:this.time*.018;c.globalCompositeOperation='lighter';
    for(let i=0;i<count;i++){const p=this.galaxy[i],a=p.angle+rotation,r=p.r*340,x=350+Math.cos(a)*r,y=410+Math.sin(a)*r*.47+p.z*150;c.globalAlpha=p.a*fade*(p.r<.18?.7:1);c.fillStyle=i%11===0?'#efbe83':i%3===0?'#a3abd3':'#7a6d9d';c.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,i%13===0?3:2,2);}
    c.globalAlpha=fade;c.globalCompositeOperation='source-over';if(fade>0)this._remnant({id:-1,kind:'bh',x:350,y:410,radius:22,mass:1000000});c.globalAlpha=1;if(t>4){c.font='18px monospace';c.textAlign='center';c.fillStyle='#c5acbf';c.fillText('10⁶ M☉',350,510);}
  }
}
