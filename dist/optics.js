import{LUT_BYTES}from'./vendor/bruneton/deflection-lut.js';
import{CRITICAL_B,LUT_SIZE,MAX_B,MIN_OFFSET,ANGLE_RANGE,lensSourceRadius}from'./vendor/bruneton/geodesic.js';
import{waveDisplacement}from'./vendor/algometrix/wave.js';
const LOG_RANGE=Math.log((MAX_B-CRITICAL_B)/MIN_OFFSET),W=700,H=820;
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
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D background;uniform sampler2D deflections;
uniform vec4 lenses[8];uniform int lensCount;uniform vec4 waves[3];uniform int waveCount;
const float BC=2.598076211353316;const float MAX_B=120.;const float LOG_RANGE=18.581104;
float alphaAt(float b){if(b>=MAX_B)return 2./b+2.9452431127/(b*b);float t=clamp(log(max(.000001,b-BC)/.000001)/LOG_RANGE,0.,1.);vec3 q=texture2D(deflections,vec2((.5+t*2047.)/2048.,.5)).rgb;return dot(q,vec3(65536.,256.,1.))*255./16777215.*32.;}
void main(){
 vec2 p=vec2(uv.x*700.,(1.-uv.y)*820.),s=p;
 for(int i=0;i<3;i++){if(i>=waveCount)break;vec2 d=p-waves[i].xy;float r=length(d),tau=waves[i].z-r/180.;if(tau<0.||tau>3.)continue;float phi=atan(d.y,d.x),phase=8.*tau;float a=.14*waves[i].w*(80./max(80.,r))*pow(sin(3.14159265359*tau/3.),2.)*exp(-tau*.6);float hp=a*cos(2.*phi-phase),hc=a*sin(2.*phi-phase);s+=.5*vec2(hp*d.x+hc*d.y,hc*d.x-hp*d.y);}
 float strongest=0.;vec4 lens=vec4(0.);
 for(int i=0;i<8;i++){if(i>=lensCount)break;vec2 d=s-lenses[i].xy;float strength=lenses[i].z*lenses[i].z/max(1.,dot(d,d));if(strength>strongest){strongest=strength;lens=lenses[i];}}
 if(lensCount>0){vec2 d=s-lens.xy;float r=length(d);if(r<abs(lens.w)){if(lens.w>0.){gl_FragColor=vec4(.001,.001,.004,1.);return;}}
 else{float b=r/lens.z;if(b<=BC){gl_FragColor=vec4(.001,.001,.004,1.);return;}float a=alphaAt(b),c=cos(a);if(c<=0.){gl_FragColor=vec4(.004,.005,.009,1.);return;}float sourceRadius=lens.z*(b-12.*sin(a))/c;s=lens.xy+d/r*sourceRadius;}}
 vec2 tex=fract(vec2(s.x/700.,1.-s.y/820.));gl_FragColor=vec4(texture2D(background,tex).rgb,1.);
}`.replace('18.581104',String(LOG_RANGE));

/** Relativistic background image remap, not point-star displacement.
 * Single Schwarzschild source at each pixel; simultaneous sources use the
 * dominant local lens. Finite distant source-plane projection is documented.
 * The GPU does one precomputed geodesic lookup per affected pixel. */
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
      this.uniforms=Object.fromEntries(['background','deflections','lenses[0]','waves[0]','lensCount','waveCount'].map(name=>[name,gl.getUniformLocation(program,name)]));gl.uniform1i(this.uniforms.background,0);gl.uniform1i(this.uniforms.deflections,1);
      this.gl=gl;this.program=program;this.mode='webgl';
    }catch(error){this.error=String(error);this.canvas=document.createElement('canvas');}
  }
  render(lenses,waves,quality,time){
    if(!this.ready)return null;
    const width=quality==='low'?350:560,height=Math.round(width*H/W);
    if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}
    const selected=[...lenses].sort((a,b)=>b.radius-a.radius).slice(0,8),packets=waves.filter(w=>w.kind==='wave').slice(-3);
    if(this.gl){const gl=this.gl;gl.viewport(0,0,width,height);gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.backgroundTexture);
      if(!this.uploaded){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.image);this.uploaded=true;}
      gl.uniform1i(this.uniforms.lensCount,selected.length);gl.uniform1i(this.uniforms.waveCount,packets.length);const l=new Float32Array(32),w=new Float32Array(12);selected.forEach((b,i)=>l.set([b.x,b.y,b.rs,b.kind==='bh'?b.radius:-b.radius],i*4));packets.forEach((b,i)=>w.set([b.x,b.y,b.age,b.power],i*4));gl.uniform4fv(this.uniforms['lenses[0]'],l);gl.uniform4fv(this.uniforms['waves[0]'],w);gl.drawArrays(gl.TRIANGLES,0,6);return this.canvas;
    }
    // Identical numerical lens equation on a reduced raster; 10 Hz fallback.
    if(time-this.lastCpu<.1)return this.canvas;this.lastCpu=time;
    const ctx=this.canvas.getContext('2d');
    if(!this.source){const raster=document.createElement('canvas');raster.width=512;raster.height=512;const rc=raster.getContext('2d');rc.drawImage(this.image,0,0,512,512);this.source=rc.getImageData(0,0,512,512).data;}
    const frame=ctx.createImageData(width,height),data=frame.data;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=mapBackground((x+.5)/width*W,(y+.5)/height*H,selected,packets),i=(y*width+x)*4;if(p.visible){const sx=(Math.floor(p.x/W*512)%512+512)%512,sy=(Math.floor(p.y/H*512)%512+512)%512,j=(sy*512+sx)*4;data[i]=this.source[j];data[i+1]=this.source[j+1];data[i+2]=this.source[j+2];}data[i+3]=255;}ctx.putImageData(frame,0,0);return this.canvas;
  }
}

