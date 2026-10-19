import{LUT_BYTES}from'./vendor/bruneton/deflection-lut.js';
import{CRITICAL_B,LUT_SIZE,MAX_B,MIN_OFFSET,ANGLE_RANGE,lensSourceRadius}from'./vendor/bruneton/geodesic.js';
import{waveDisplacement}from'./vendor/algometrix/wave.js';
const LOG_RANGE=Math.log((MAX_B-CRITICAL_B)/MIN_OFFSET),W=700,H=820;
export const DISK_INNER=3,DISK_OUTER=7.5;
export function deflectionAt(b){
  if(b<=CRITICAL_B)return 0;
  if(b>=MAX_B)return 2/b+15*Math.PI/(16*b*b);
  const t=Math.max(0,Math.min(LUT_SIZE-1,Math.log((b-CRITICAL_B)/MIN_OFFSET)/LOG_RANGE*(LUT_SIZE-1))),i=Math.floor(t),f=t-i;
  const value=k=>(LUT_BYTES[k*4]*65536+LUT_BYTES[k*4+1]*256+LUT_BYTES[k*4+2])/16777215*ANGLE_RANGE;
  return value(i)*(1-f)+value(Math.min(LUT_SIZE-1,i+1))*f;
}
export function mapBackground(x,y,lenses,waves=[]){
  let sx=x,sy=y;
  for(const wave of waves){const displacement=waveDisplacement(x,y,wave);sx+=displacement.x;sy+=displacement.y;}
  let dominant=null,weight=0;
  for(const lens of lenses){const r2=(sx-lens.x)**2+(sy-lens.y)**2,candidate=lens.rs*lens.rs/Math.max(1,r2);if(candidate>weight){weight=candidate;dominant=lens;}}
  if(!dominant)return{x:sx,y:sy,visible:true};
  const dx=sx-dominant.x,dy=sy-dominant.y,r=Math.hypot(dx,dy);
  if(r<dominant.radius)return{x:sx,y:sy,visible:dominant.kind!=='bh'};
  const mapped=lensSourceRadius(r,dominant.rs,deflectionAt(r/dominant.rs));
  if(!mapped.visible)return{x:sx,y:sy,visible:false};
  return{x:dominant.x+dx/r*mapped.radius,y:dominant.y+dy/r*mapped.radius,visible:true};
}
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
/* Per pixel: TT-strain displacement → dominant Schwarzschild lens → background
 * resample. Black holes additionally get a thin Shakura–Sunyaev disk whose
 * primary image is found from Beloborodov's (2002) light-bending relation
 * 1−cosα=(1−cosψ)(1−rs/r), b=r·sinα/√(1−rs/r), solved for r by bisection;
 * Doppler + gravitational shift g sets the blackbody colour and beaming. A
 * photon ring hugs the critical curve b=√27/2 where higher-order images pile up. */
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D background;uniform sampler2D deflections;
uniform vec4 lenses[8];uniform vec4 disks[8];uniform int lensCount;uniform vec4 waves[3];uniform int waveCount;
uniform float time;uniform float bending;uniform float pixel;uniform vec2 drift;uniform float exposure;
const float BC=2.598076211353316;const float MAX_B=120.;const float LOG_RANGE=18.581104;
const float RIN=${DISK_INNER.toFixed(1)};const float ROUT=${DISK_OUTER.toFixed(1)};const float TAU=6.28318530718;
float alphaAt(float b){if(b>=MAX_B)return 2./b+2.9452431127/(b*b);float t=clamp(log(max(.000001,b-BC)/.000001)/LOG_RANGE,0.,1.);vec3 q=texture2D(deflections,vec2((.5+t*2047.)/2048.,.5)).rgb;return dot(q,vec3(65536.,256.,1.))*255./16777215.*32.;}
vec3 blackbody(float k){float t=k/100.;vec3 c;
 if(t<=66.){c.r=1.;c.g=(99.4708025861*log(t)-161.1195681661)/255.;c.b=t<=19.?0.:(138.5177312231*log(t-10.)-305.0447927307)/255.;}
 else{c.r=329.698727446*pow(t-60.,-.1332047592)/255.;c.g=288.1221695283*pow(t-60.,-.0755148492)/255.;c.b=1.;}
 return clamp(c,0.,1.);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float pnoise(vec2 p,float period){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float a=hash(vec2(mod(i.x,period),i.y)),b=hash(vec2(mod(i.x+1.,period),i.y)),c=hash(vec2(mod(i.x,period),i.y+1.)),d=hash(vec2(mod(i.x+1.,period),i.y+1.));
 return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float bOf(float r,float c){float u=1./r,ca=1.-(1.-c)*(1.-u);return r*sqrt(max(0.,1.-ca*ca))/sqrt(1.-u);}
float gas(float phi,float r,float t,float seed){
 float a=phi/TAU,lr=log(r)*3.4+seed*13.;
 return .5*pnoise(vec2(a*9.,lr),9.)+.32*pnoise(vec2(a*21.,lr*2.6+5.),21.)+.18*pnoise(vec2(a*46.,lr*6.+9.),46.);}
vec4 disk(vec2 d,float rs,vec4 info){
 float level=info.x;if(level<.002)return vec4(0.);
 float ct=cos(info.y),st=sin(info.y);vec2 q=vec2(ct*d.x+st*d.y,st*d.x-ct*d.y)/rs;
 float bp=length(q),inc=abs(info.z),spin=info.z<0.?-1.:1.,ci=cos(inc),si=sin(inc);
 float th=atan(q.y,q.x),phi=atan(sin(th),cos(th)*ci),cpsi=-sin(phi)*si,r;
 float rmax=ROUT*1.12;
 if(bending>.5){
  if(bp<bOf(RIN,cpsi)||bp>bOf(rmax,cpsi))return vec4(0.);
  float lo=RIN,hi=rmax;for(int k=0;k<14;k++){float m=.5*(lo+hi);if(bOf(m,cpsi)<bp)lo=m;else hi=m;}r=.5*(lo+hi);
 }else{r=bp/max(.0001,length(vec2(cos(phi),sin(phi)*ci)));if(r<RIN||r>rmax)return vec4(0.);}
 float x=r/RIN,flux=pow(x,-3.)*(1.-sqrt(1./x))/.0567;
 float beta=sqrt(.5/(r-1.)),vlos=spin*beta*(-cos(phi))*si,g=sqrt(max(.01,1.-1.5/r))/(1.-vlos);
 // Differential (Keplerian) rotation with a two-phase flow cycle to avoid infinite shear.
 float om=spin*1.9*pow(x,-1.5),cyc=7.,t0=time+info.w*20.,t1=mod(t0,cyc),t2=mod(t0+cyc*.5,cyc),w=abs(t1/cyc*2.-1.);
 float n=mix(gas(phi-om*t1,r,t1,info.w+floor(t0/cyc)*.37),gas(phi-om*t2,r,t2,info.w+.5+floor((t0+cyc*.5)/cyc)*.37),w);
 float temp=4500.*pow(max(flux,.0001),.25)*g;
 float I=level*pow(g,3.)*pow(max(flux,0.),.6)*(.25+1.5*n*n);
 vec3 c=blackbody(temp)*vec3(1.,.86,.66)*I*2.2;c=1.-exp(-c);
 float a=smoothstep(RIN,RIN*1.06,r)*(1.-smoothstep(ROUT*.62,rmax,r))*clamp(.55+.75*n,0.,1.)*clamp(level*2.2,0.,1.);
 return vec4(c,a);}
void main(){
 vec2 p=vec2(uv.x*700.,(1.-uv.y)*820.),s=p;float strain=0.;
 for(int i=0;i<3;i++){if(i>=waveCount)break;vec2 d=p-waves[i].xy;float r=length(d),tau=waves[i].z-r/180.;if(tau<0.||tau>3.)continue;float phi=atan(d.y,d.x),phase=8.*tau;float a=.14*waves[i].w*(80./max(80.,r))*pow(sin(3.14159265359*tau/3.),2.)*exp(-tau*.6);float hp=a*cos(2.*phi-phase),hc=a*sin(2.*phi-phase);s+=.5*vec2(hp*d.x+hc*d.y,hc*d.x-hp*d.y);strain+=hp;}
 float strongest=0.;vec4 lens=vec4(0.),info=vec4(0.);
 for(int i=0;i<8;i++){if(i>=lensCount)break;vec2 d=s-lenses[i].xy;float strength=lenses[i].z*lenses[i].z/max(1.,dot(d,d));if(strength>strongest){strongest=strength;lens=lenses[i];info=disks[i];}}
 vec3 col;vec4 dk=vec4(0.);float shadow=1.;vec3 glow=vec3(0.);
 vec2 src=s;
 if(lensCount>0){
  vec2 d=s-lens.xy;float r=length(d),b=r/lens.z,aa=max(.02,pixel/lens.z);
  if(lens.w>0.){
   shadow=smoothstep(BC-aa,BC+aa,b);
   if(b>BC&&bending>.5){float a=alphaAt(b),c=cos(a);if(c<=0.)shadow=0.;else src=lens.xy+d/r*(lens.z*(b-12.*sin(a))/c);}
   dk=disk(d,lens.z,info);
   if(info.x>.002){
    float ct=cos(info.y),st=sin(info.y);vec2 q=vec2(ct*d.x+st*d.y,st*d.x-ct*d.y);float side=-q.x/max(r,.001)*(info.z<0.?-1.:1.);
    float ringW=max(.035,1.4*aa),ring=exp(-max(0.,b-BC)/ringW)*smoothstep(BC-aa*1.5,BC,b);
    float beam=pow(clamp(1.+.55*side,.2,2.),2.);
    glow=blackbody(4200.+1400.*side)*vec3(1.,.86,.68)*(info.x*(ring*1.3*beam+.10*beam*exp(-max(0.,b-BC)/.7)*shadow));
   }
  }else if(r>=-lens.w&&bending>.5){float b2=max(b,BC+.001),a=alphaAt(b2),c=cos(a);if(c>0.)src=lens.xy+d/r*(lens.z*(b2-12.*sin(a))/c);}
 }
 vec2 tex=fract(vec2((src.x+drift.x)/700.,1.-(src.y+drift.y)/820.));
 col=texture2D(background,tex).rgb*shadow;
 col*=1.+5.*strain;col+=vec3(.22,.3,.55)*smoothstep(.004,.05,abs(strain))*abs(strain)*7.*shadow;
 col=col*exposure+glow;
 col=mix(col,dk.rgb,dk.a);
 vec2 v=(uv-.5)*vec2(1.,1.17);col*=mix(.42,1.,smoothstep(.95,.2,length(v)));
 gl_FragColor=vec4(col,1.);
}`.replace('18.581104',String(LOG_RANGE));

/** Relativistic background image remap plus ray-traced thin accretion disks.
 * Single Schwarzschild source at each pixel; simultaneous sources use the
 * dominant local lens. Finite distant source-plane projection is documented. */
export class LensingPass{
  constructor(){
    this.canvas=document.createElement('canvas');this.mode='cpu';this.image=null;this.ready=false;this.lastCpu=-1;
    if(typeof Image==='undefined')return;
    this.image=new Image();this.image.onload=()=>{this.ready=true;};this.image.src=new URL('./assets/deep-field.png',import.meta.url).href;
    try{
      const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,preserveDrawingBuffer:false});
      if(!gl||typeof gl.getParameter(gl.VERSION)!=='string')return;
      const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
      const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
      const texture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
      this.backgroundTexture=texture();this.lutTexture=texture();gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.lutTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,LUT_SIZE,1,0,gl.RGBA,gl.UNSIGNED_BYTE,LUT_BYTES);
      this.uniforms=Object.fromEntries(['background','deflections','lenses[0]','disks[0]','waves[0]','lensCount','waveCount','time','bending','pixel','drift','exposure'].map(name=>[name,gl.getUniformLocation(program,name)]));gl.uniform1i(this.uniforms.background,0);gl.uniform1i(this.uniforms.deflections,1);
      this.gl=gl;this.program=program;this.mode='webgl';
    }catch(error){this.error=String(error);this.canvas=document.createElement('canvas');}
  }
  /** options: {width, bending=true, drift=[x,y], exposure} ; lens.disk={level,tilt,inc,spin,seed} */
  render(lenses,waves,quality,time,options={}){
    if(!this.ready)return null;
    const width=Math.round(options.width||(quality==='low'?420:700)),height=Math.round(width*H/W),bending=options.bending!==false;
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const selected=[...lenses].sort((a,b)=>b.radius-a.radius).slice(0,8),packets=waves.filter(w=>w.kind==='wave').slice(-3);
    if(this.gl){const gl=this.gl,u=this.uniforms;gl.viewport(0,0,width,height);gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.backgroundTexture);
      if(!this.uploaded){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);this.uploaded=true;}
      const l=new Float32Array(32),d=new Float32Array(32),w=new Float32Array(12);
      selected.forEach((b,i)=>{l.set([b.x,b.y,b.rs,b.kind==='bh'?b.radius:-b.radius],i*4);const k=b.disk;if(k)d.set([k.level,k.tilt,(k.spin<0?-1:1)*k.inc,k.seed],i*4);});
      packets.forEach((b,i)=>w.set([b.x,b.y,b.age,b.power],i*4));
      gl.uniform1i(u.lensCount,selected.length);gl.uniform1i(u.waveCount,packets.length);gl.uniform4fv(u['lenses[0]'],l);gl.uniform4fv(u['disks[0]'],d);gl.uniform4fv(u['waves[0]'],w);
      gl.uniform1f(u.time,time);gl.uniform1f(u.bending,bending?1:0);gl.uniform1f(u.pixel,W/width);const drift=options.drift||[0,0];gl.uniform2f(u.drift,drift[0],drift[1]);gl.uniform1f(u.exposure,options.exposure??.9);
      gl.drawArrays(gl.TRIANGLES,0,6);return this.canvas;
    }
    // Identical numerical lens equation on a reduced raster; 10 Hz fallback.
    if(time-this.lastCpu<.1)return this.canvas;this.lastCpu=time;
    const cw=Math.min(width,350),ch=Math.round(cw*H/W);if(this.canvas.width!==cw){this.canvas.width=cw;this.canvas.height=ch;}
    const ctx=this.canvas.getContext('2d');
    if(!this.source){const raster=document.createElement('canvas');raster.width=512;raster.height=600;const rc=raster.getContext('2d');rc.drawImage(this.image,0,0,512,600);this.source=rc.getImageData(0,0,512,600).data;}
    const frame=ctx.createImageData(cw,ch),data=frame.data,use=bending?selected:[];
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const p=mapBackground((x+.5)/cw*W,(y+.5)/ch*H,use,packets),i=(y*cw+x)*4;if(p.visible){const sx=(Math.floor(p.x/W*512)%512+512)%512,sy=(Math.floor(p.y/H*600)%600+600)%600,j=(sy*512+sx)*4;data[i]=this.source[j]*.9;data[i+1]=this.source[j+1]*.9;data[i+2]=this.source[j+2]*.9;}data[i+3]=255;}ctx.putImageData(frame,0,0);return this.canvas;
  }
}
