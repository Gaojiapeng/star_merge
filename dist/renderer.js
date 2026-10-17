import { STAR_TYPES, PHYSICS, gravityAt } from './simulation.js?v=3.0.0';
import { LensingPass } from './optics.js?v=3.0.0';
import { CRITICAL_B } from './vendor/bruneton/geodesic.js';
const W=700,H=820,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const palettes=[['#481d24','#8d2e30','#de4938','#ff7950','#ffc18c'],['#583322','#a7552b','#e9923d','#ffc36c','#ffe2a3'],['#655125','#af8537','#e6b952','#ffe194','#fff4ce'],['#59534b','#a7987b','#dbcfad','#fff0cc','#fff9e9'],['#313f66','#6078ab','#a2bddd','#d7edff','#f5fbff'],['#26345f','#435e9e','#799bdd','#accbff','#e5eeff'],['#332754','#655095','#9385cf','#c5b9ff','#f0e8ff']];
const cooling=['#fffbe0','#ffe6a6','#ffc26e','#f39148','#c3573e','#74424c','#3c3543','#20242c'],cyan=['#f0ffff','#bbf7ff','#6cd5fa','#489ac5','#39668c','#2c3d5d'];
function random(seed){return()=>{seed|=0;seed=seed+0x6d2b79f5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=n+Math.imul(n^n>>>7,61|n)^n;return((n^n>>>14)>>>0)/4294967296;};}
function massLabel(m){return m<1?m.toFixed(2).replace(/0$/,''):m<10?m.toFixed(1).replace(/\.0$/,''):Math.round(m).toLocaleString('en-US');}
export class Renderer{
  constructor(canvas,simulation){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.sim=simulation;
    this.optics=new LensingPass();this.images={};
    if(typeof Image!=='undefined')for(const name of [...Array.from({length:9},(_,i)=>'star-'+i),'disk','glow','shock']){const img=new Image();img.src=new URL('./assets/'+name+'.png',import.meta.url).href;this.images[name]=img;}
    canvas.setAttribute?.('data-optics-mode',this.optics.mode);
    this.quality='high';this.reducedMotion=false;this.showLayers=true;this.showLensing=true;this.pointerX=350;this.selectedId=null;this.inspectMode=false;
    this.time=0;this.particles=[];this.effects=[];this.emitters=[];this.flowCarry=new Map();this.cinematicTime=0;this.isCinematicDone=false;this.lastState=simulation.state;this.rng=random(171019);this.shake=0;this.flash=0;
    this.stars=Array.from({length:240},()=>({x:this.rng()*W,y:this.rng()*H,a:.18+this.rng()*.65,size:this.rng()>.94?2:1,phase:this.rng()*TAU}));
    this.stars.unshift({x:548,y:750,a:.8,size:2,phase:0},{x:556,y:723,a:.7,size:1,phase:1});
    this.galaxy=Array.from({length:1600},(_,i)=>{const r=Math.pow(this.rng(),.65);return{r,angle:i%4*Math.PI/2+r*9+(this.rng()-.5)*(.1+r*.6),z:(this.rng()-.5)*r*.13,a:.25+this.rng()*.75};});this.resize();
  }
  get particleLimit(){return this.quality==='low'?1100:2600;}
  resize(){const r=this.canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,this.quality==='low'?1:1.5);this.canvas.width=Math.max(1,Math.round((r.width||W)*d));this.canvas.height=Math.max(1,Math.round((r.height||H)*d));this.scale=Math.min(this.canvas.width/W,this.canvas.height/H);this.offsetX=(this.canvas.width-W*this.scale)/2;this.offsetY=(this.canvas.height-H*this.scale)/2;this.ctx.imageSmoothingEnabled=false;}
  setQuality(value){this.quality=value==='low'?'low':'high';this.resize();}
  setReducedMotion(value){this.reducedMotion=!!value;this.shake=0;this.flash=0;}
  reset(){this.particles.length=0;this.effects.length=0;this.emitters.length=0;this.flowCarry.clear();this.cinematicTime=0;this.isCinematicDone=false;this.shake=0;this.flash=0;this.lastState=null;}
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
    }else if(ev.kind==='evolve'){if(ev.variant==='planetary-nebula')this._burstPixels(x,y,90,20,.3,'smoke');
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
    if(dt<=0)return;
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
  _background(){
    const lenses=this.showLensing?this.compact.filter(b=>b.kind==='bh'||b.kind==='ns').map(b=>({...b,rs:b.radius/(b.kind==='bh'?CRITICAL_B:2.9/Math.sqrt(1-1/2.9))})):[];
    const image=this.optics.render(lenses,this.showLensing?this.effects:[],this.quality,this.time);
    const c=this.ctx;c.imageSmoothingEnabled=true;
    if(image)c.drawImage(image,0,0,W,H);else{c.fillStyle='#090912';c.fillRect(0,0,W,H);}
    c.fillStyle='rgba(7,8,13,.18)';c.fillRect(0,0,W,H);
  }
  _sprite(name,x,y,size,angle=0,alpha=1){
    const image=this.images[name];if(!image?.complete||!image.naturalWidth)return false;
    const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle);c.globalAlpha*=alpha;c.drawImage(image,-size/2,-size/2,size,size);c.restore();return true;
  }
  _disc(body,index){
    const c=this.ctx,r=body.radius;
    c.save();c.translate(body.x,body.y);c.rotate(body.rotation||0);
    if(!this._sprite('star-'+index,0,0,r*2)){
      c.fillStyle=body.color||'#b8d4ff';c.beginPath();c.arc(0,0,r,0,TAU);c.fill();
      c.fillStyle='#ffffff40';c.fillRect(r*.25,-r*.4,r*.2,r*.25);
    }
    if(this.showLayers&&body.kind==='star'){
      const layers=body.layers||STAR_TYPES[body.type].layers;
      c.save();c.beginPath();c.moveTo(0,0);c.arc(0,0,r,-Math.PI*.05,Math.PI*.45);c.closePath();c.clip();
      let remaining=1;
      for(let i=layers.length-1;i>=0;i--){c.fillStyle=layers[i].color;c.beginPath();c.arc(0,0,r*Math.sqrt(remaining),0,TAU);c.fill();remaining=Math.max(0,remaining-layers[i].fraction);}
      c.restore();c.strokeStyle='#fff2c85c';c.lineWidth=1;c.beginPath();c.moveTo(0,0);c.lineTo(Math.cos(-Math.PI*.05)*r,Math.sin(-Math.PI*.05)*r);c.moveTo(0,0);c.lineTo(Math.cos(Math.PI*.45)*r,Math.sin(Math.PI*.45)*r);c.stroke();
    }
    c.restore();
  }
  _star(body){
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';this._sprite('glow',body.x,body.y,body.radius*3,0,.25);c.restore();
    this._disc(body,body.kind==='wd'?7:body.type);this._label(body,body.kind==='wd'?'WD':STAR_TYPES[body.type].type);this._selection(body);
  }
  _remnant(body){
    const c=this.ctx,r=body.radius;
    if(body.kind==='ns'){
      c.save();c.globalCompositeOperation='lighter';this._sprite('glow',body.x,body.y,r*5,0,.5);c.restore();this._disc(body,8);this._label(body,'NS');
    }else{
      c.save();c.globalCompositeOperation='lighter';this._sprite('disk',body.x,body.y,r*3.5,body.rotation||0,body.accretingId?.95:.48);c.restore();
      c.fillStyle='#010104';c.beginPath();c.arc(body.x,body.y,r,0,TAU);c.fill();
      c.strokeStyle='#ffdda476';c.lineWidth=1;c.beginPath();c.arc(body.x,body.y,r*1.03,0,TAU);c.stroke();
      if(body.mergerProgress){c.strokeStyle='#bba5dc';c.beginPath();c.arc(body.x,body.y,r+5,-Math.PI/2,-Math.PI/2+TAU*body.mergerProgress);c.stroke();}
      this._label(body,'BH');
    }this._selection(body);
  }

  _arena(){const c=this.ctx;c.strokeStyle='#252436';c.lineWidth=1;c.beginPath();c.moveTo(20,104);c.lineTo(20,798);c.lineTo(680,798);c.lineTo(680,104);c.stroke();c.strokeStyle=this.sim.danger>.1?'#b66a5a':'#3c3544';c.setLineDash([4,10]);c.beginPath();c.moveTo(20,100);c.lineTo(680,100);c.stroke();c.setLineDash([]);c.fillStyle='#706375';c.font='15px monospace';c.textAlign='right';c.fillText('警戒线',674,89);for(let x=40;x<680;x+=20){c.fillStyle=x%100===0?'#60516b':'#302b3d';c.fillRect(x,800,2,x%100===0?7:3);}}
  _label(body,type){const c=this.ctx,r=body.radius;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${r<24?18:22}px monospace`;c.strokeStyle='#09090ee0';c.lineWidth=4;c.strokeText(type,body.x,body.y-3);c.fillStyle='#fff6e5';c.fillText(type,body.x,body.y-3);c.font=`${r<24?14:16}px monospace`;c.strokeText(massLabel(body.mass),body.x,body.y+16);c.fillStyle='#e6d4ca';c.fillText(massLabel(body.mass),body.x,body.y+16);c.textBaseline='alphabetic';}
  _selection(body){if(this.selectedId!==body.id)return;const c=this.ctx,r=body.radius+8;c.strokeStyle='#eed0a5';c.lineWidth=2;c.setLineDash([5,8]);c.strokeRect(body.x-r,body.y-r,r*2,r*2);c.setLineDash([]);}
  _particles(front){
    const c=this.ctx;c.globalCompositeOperation=front?'lighter':'source-over';
    for(const p of this.particles){if(front?p.kind==='smoke':p.kind!=='smoke')continue;const fraction=clamp(p.age/p.life,0,1),pal=p.kind==='jet'?cyan:cooling,shade=p.kind==='stream'?clamp(Math.floor(4-p.hot*3),0,4):Math.min(pal.length-1,Math.floor(fraction*pal.length));c.fillStyle=pal[shade];c.globalAlpha=Math.min(1,(1-fraction)*1.5)*(p.kind==='smoke'?.2:.85);const x=Math.round(p.x/2)*2,y=Math.round(p.y/2)*2;if(!this.reducedMotion&&p.kind!=='smoke'){c.globalAlpha*=.32;c.fillRect(Math.round(p.px/2)*2,Math.round(p.py/2)*2,p.size+1,p.size+1);c.globalAlpha*=2.5;}c.fillRect(x,y,p.size,p.size);if(front&&p.age<.7&&this.quality==='high'){c.globalAlpha*=.08;c.fillRect(x-3,y-3,p.size+6,p.size+6);}}
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
  }
  _effects(){
    const c=this.ctx;c.save();c.globalCompositeOperation='lighter';
    for(const e of this.effects){
      if(e.kind==='wave')continue; // Strain remaps the background in the optics pass.
      const t=e.age/e.duration;
      if(e.kind==='shock'){
        const r=e.radius*(1-Math.exp(-e.age/3.2));
        this._sprite('shock',e.x,e.y,r*2,0,Math.pow(1-t,.8)*.65);
        this._sprite('glow',e.x,e.y,80+e.age*30,0,Math.max(0,1-e.age/4)*.35);
      }else this._sprite('glow',e.x,e.y,30+e.age*110,0,(1-t)*.35);
    }c.restore();
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



