// Procedural, original texture assets. `node tools/generate-assets.mjs`
// deep-field.png  tileable 1024×1200 starfield + emission nebula (lensing source)
// star-0..6.png   limb-darkened photospheres M…O with 3-D granulation and spots
// star-7.png      white dwarf, star-8.png neutron star (polar hot spots)
// star-9/10.png   O6V and O3V — hotter, brighter O subclasses
import{mkdir,writeFile}from'node:fs/promises';import{deflateSync}from'node:zlib';
const dir=new URL('../dist/assets/',import.meta.url);await mkdir(dir,{recursive:true});
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(buffer){let c=0xffffffff;for(const b of buffer)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),check=Buffer.alloc(4);length.writeUInt32BE(data.length);check.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,check]);}
async function png(name,w,h,rgba,channels=4){const raw=Buffer.alloc((w*channels+1)*h);for(let y=0;y<h;y++){raw[y*(w*channels+1)]=0;for(let x=0;x<w*channels;x++)raw[y*(w*channels+1)+1+x]=Math.max(0,Math.min(255,Math.round(rgba[y*w*channels+x])));}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=channels===4?6:2;await writeFile(new URL(name,dir),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}
function hash(x,y,s=0){let a=Math.imul(x^Math.imul(y,374761393)^Math.imul(s,668265263),1274126177);a^=a>>>13;a=Math.imul(a,1103515245);return((a^a>>>16)>>>0)/4294967295;}
function hash3(x,y,z,s){return hash(x^Math.imul(z,2246822519),y,s);}
function rng(seed){return()=>{seed=seed+0x6d2b79f5|0;let n=Math.imul(seed^seed>>>15,1|seed);n=n+Math.imul(n^n>>>7,61|n)^n;return((n^n>>>14)>>>0)/4294967296;};}
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
// Periodic value noise: lattice wraps every `p` cells so the deep field tiles.
function pnoise(x,y,p,seed){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy),m=n=>((n%p)+p)%p,h=(a,b)=>hash(m(a),m(b),seed);return mix(mix(h(ix,iy),h(ix+1,iy),u),mix(h(ix,iy+1),h(ix+1,iy+1),u),v);}
function pfbm(u,v,base,oct,seed,gain=.5){let out=0,a=.5,norm=0;for(let i=0;i<oct;i++){const p=base<<i;out+=a*pnoise(u*p,v*p,p,seed+i*131);norm+=a;a*=gain;}return out/norm;}
function noise3(x,y,z,seed){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),u=smooth(x-ix),v=smooth(y-iy),w=smooth(z-iz),h=(a,b,c)=>hash3(a,b,c,seed);
  return mix(mix(mix(h(ix,iy,iz),h(ix+1,iy,iz),u),mix(h(ix,iy+1,iz),h(ix+1,iy+1,iz),u),v),mix(mix(h(ix,iy,iz+1),h(ix+1,iy,iz+1),u),mix(h(ix,iy+1,iz+1),h(ix+1,iy+1,iz+1),u),v),w);}
function fbm3(x,y,z,oct,seed){let out=0,a=.5,n=0;for(let i=0;i<oct;i++){out+=a*noise3(x,y,z,seed+i*71);n+=a;a*=.5;x*=2.02;y*=2.02;z*=2.02;}return out/n;}
// Granulation: cellular (F2−F1) noise on the sphere — bright convective cells, dark lanes.
function cells3(x,y,z,seed){const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let f1=9,f2=9;
  for(let k=-1;k<=1;k++)for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=ix+i,cy=iy+j,cz=iz+k,px=cx+hash3(cx,cy,cz,seed),py=cy+hash3(cx,cy,cz,seed+1),pz=cz+hash3(cx,cy,cz,seed+2),d=(px-x)**2+(py-y)**2+(pz-z)**2;if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;}
  return Math.sqrt(f2)-Math.sqrt(f1);}
// Blackbody colour (Helland fit), linear-ish 0..1.
function blackbody(k){const t=k/100;let r,g,b;if(t<=66){r=255;g=99.4708025861*Math.log(t)-161.1195681661;b=t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307;}else{r=329.698727446*Math.pow(t-60,-.1332047592);g=288.1221695283*Math.pow(t-60,-.0755148492);b=255;}return[clamp(r/255),clamp(g/255),clamp(b/255)];}

/* ---------- deep field ---------- */
{
  const W=1024,H=1200,buf=new Float32Array(W*H*3);
  const add=(x,y,r,g,b)=>{x=((x%W)+W)%W;y=((y%H)+H)%H;const i=(y*W+x)*3;buf[i]+=r;buf[i+1]+=g;buf[i+2]+=b;};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const u=x/W,v=y/H,i=(y*W+x)*3;
    // Diagonal galactic band, periodic on the torus.
    const band=Math.pow(.5+.5*Math.cos(2*Math.PI*(u+v*.5)-1.2),3);
    const n1=pfbm(u,v,3,6,11),n2=pfbm(u+.31,v+.17,4,6,29),n3=pfbm(u,v,6,5,47);
    const ridge=1-Math.abs(pfbm(u,v,5,5,83)*2-1),dust=clamp((pfbm(u,v,4,6,97)-.42)*3.2);
    const ha=Math.pow(clamp((n1-.38)*2.2),2.2)*(.55+.9*ridge*ridge),oiii=Math.pow(clamp((n2-.4)*2.3),2.4)*(.5+.6*n3);
    const glow=band*(.35+.65*n3);
    let r=.010+.020*glow+.20*ha+.030*oiii,g=.012+.020*glow+.050*ha+.120*oiii,b=.026+.034*glow+.110*ha+.170*oiii;
    // Hα wisps red-magenta, [O III] teal; dust lanes absorb, reddening what survives.
    const ext=1-.78*dust*(.4+.6*ridge);r*=ext+.08*dust;g*=ext;b*=ext*.92;
    buf[i]=r;buf[i+1]=g;buf[i+2]=b;
  }
  const R=rng(9091);
  const temps=()=>{const q=R();return q<.12?3200+R()*800:q<.38?4300+R()*1200:q<.7?5600+R()*1500:q<.92?7500+R()*4000:12000+R()*16000;};
  function star(x,y,flux,k,spikes=0){
    const [cr,cg,cb]=blackbody(k),sigma=.55+Math.min(2.2,Math.sqrt(flux)*.55),rad=Math.ceil(sigma*3.4+spikes);
    const ix=Math.floor(x),iy=Math.floor(y);
    for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++){
      const px=ix+dx+.5-x,py=iy+dy+.5-y,d2=px*px+py*py;
      let e=Math.exp(-d2/(2*sigma*sigma))*flux/(sigma*sigma)+flux*.018/(1+d2*.6);
      if(spikes){const ax=Math.abs(px),ay=Math.abs(py);e+=flux*.07*(Math.exp(-ay*ay*1.6)*Math.max(0,1-ax/spikes)**2+Math.exp(-ax*ax*1.6)*Math.max(0,1-ay/spikes)**2);}
      add(ix+dx,iy+dy,e*cr,e*cg,e*cb);
    }
  }
  for(let n=0;n<9000;n++){const x=R()*W,y=R()*H,band=Math.pow(.5+.5*Math.cos(2*Math.PI*(x/W+y/H*.5)-1.2),3);if(R()>.32+.68*band)continue;star(x,y,.03+Math.pow(R(),6)*.5,temps());}
  for(let n=0;n<260;n++)star(R()*W,R()*H,.5+Math.pow(R(),3)*2.4,temps());
  for(let n=0;n<16;n++)star(R()*W,R()*H,3+R()*4,temps(),9+R()*16);
  // A few faint background galaxies for the lens to smear into arcs.
  for(let n=0;n<26;n++){const gx=R()*W,gy=R()*H,a=R()*Math.PI,len=2.5+R()*6,wid=len*(.25+R()*.5),f=.05+R()*.08,[cr,cg,cb]=blackbody(4200+R()*2500);
    for(let dy=-14;dy<=14;dy++)for(let dx=-14;dx<=14;dx++){const px=dx*Math.cos(a)+dy*Math.sin(a),py=-dx*Math.sin(a)+dy*Math.cos(a),e=f*Math.exp(-(px*px)/(2*len*len)-(py*py)/(2*wid*wid));add(Math.round(gx)+dx,Math.round(gy)+dy,e*cr,e*cg,e*cb);}}
  const out=new Float32Array(W*H*3);
  for(let i=0;i<W*H*3;i++){const v=buf[i];out[i]=255*Math.pow(1-Math.exp(-v*1.35),1/1.25);}
  await png('deep-field.png',W,H,out,3);
}

/* ---------- photospheres ---------- */
// Stylised spectral ramps (limb → core). Saturated enough that every class
// reads at a glance, ordered red → violet like the in-game ladder.
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const SPECS=[
  {ramp:['#3a0a06','#8e2414','#e2502c','#ff8a5c','#ffd0b4'],g:15,c:.20,spots:5,a:.66,b:.16}, // M
  {ramp:['#451a06','#a24d16','#f08a34','#ffb866','#ffe6c4'],g:16,c:.18,spots:4,a:.62,b:.15}, // K
  {ramp:['#4a2c08','#b07a22','#f1bc4a','#ffdc84','#fff6dc'],g:17,c:.17,spots:3,a:.58,b:.14}, // G
  {ramp:['#4c3e26','#a8916a','#e8d6aa','#fff0cc','#fffcf2'],g:18,c:.14,spots:1,a:.54,b:.12}, // F
  {ramp:['#26324e','#6f88b4','#bcd2f4','#e6f0ff','#ffffff'],g:20,c:.10,spots:0,a:.48,b:.10}, // A
  {ramp:['#0e1c4a','#3156b0','#6f9cf0','#acd0ff','#eef6ff'],g:22,c:.09,spots:0,a:.44,b:.08}, // B
  {ramp:['#170f4a','#3f35a8','#7c74ee','#b4b0ff','#f0eeff'],g:24,c:.08,spots:0,a:.40,b:.07}, // O
  {ramp:['#2a3450','#8494b8','#d0dcf4','#f2f6ff','#ffffff'],g:28,c:.05,spots:0,a:.34,b:.06}, // WD
  {ramp:['#0a2a48','#2f86c2','#7fd4f8','#c8f4ff','#ffffff'],g:26,c:.05,spots:0,a:.26,b:.05}, // NS
  {ramp:['#12084e','#3524b0','#6c58f4','#a698ff','#f2eeff'],g:26,c:.10,spots:0,a:.36,b:.06}, // O6V
  {ramp:['#1a0e62','#4636cc','#8c7eff','#d2caff','#ffffff'],g:30,c:.12,spots:0,a:.30,b:.05}, // O3V
];
function ramp(stops,t){t=clamp(t)*(stops.length-1);const i=Math.min(stops.length-2,Math.floor(t)),f=t-i,a=stops[i],b=stops[i+1];return[0,1,2].map(c=>mix(a[c],b[c],smooth(f)));}
for(let type=0;type<SPECS.length;type++){
  const S=SPECS[type],stops=S.ramp.map(hex),N=256,data=new Float32Array(N*N*4),R=rng(4400+type*977);
  const spots=Array.from({length:S.spots},()=>{const z=R()*2-1,t=R()*Math.PI*2,s=Math.sqrt(1-z*z);return{x:s*Math.cos(t)*.9,y:z*.6,z:Math.abs(s*Math.sin(t))*.8+.2,r:.06+R()*.09};});
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const u=(x+.5-N/2)/(N/2-1.5),v=(y+.5-N/2)/(N/2-1.5),r2=u*u+v*v,i=(y*N+x)*4;
    if(r2>1.02){data[i+3]=0;continue;}
    const rr=Math.sqrt(r2),mu=Math.sqrt(Math.max(0,1-r2)),z=mu;
    const gran=cells3(u*S.g,v*S.g,z*S.g,type*31),fine=fbm3(u*S.g*1.8,v*S.g*1.8,z*S.g*1.8,3,type*53),large=fbm3(u*2.4,v*2.4,z*2.4,5,type*17);
    let I=.80+S.c*(smooth(clamp(gran*1.5))-.5)*.8+S.c*(fine-.5)*.9+.22*(large-.5);
    for(const s of spots){const d=Math.hypot(u-s.x,v-s.y,z-s.z)/s.r;if(d<1.8)I-=.42*Math.exp(-d*d*3)+.12*Math.exp(-((d-1.05)**2)*10);}
    if(S.spots)I+=.10*Math.pow(1-mu,2)*clamp((fine-.48)*4);
    if(type===8)for(const pole of [[.36,-.5],[-.36,.5]]){const d=Math.hypot(u-pole[0],v-pole[1]);I+=.5*Math.exp(-d*d*30);}
    // Quadratic limb darkening pushes the rim down the ramp (cooler, redder).
    const ld=1-S.a*(1-mu)-S.b*(1-mu)**2,col=ramp(stops,I*ld);
    for(let c=0;c<3;c++)data[i+c]=255*col[c];
    data[i+3]=255*clamp((1-rr)*(N/2-1.5)+.5);
  }
  await png(`star-${type}.png`,N,N,data);
}
console.log('Generated deep-field and 11 photosphere textures');
