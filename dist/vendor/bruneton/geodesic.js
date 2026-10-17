/**
 * Copyright (c) 2020 Eric Bruneton. All rights reserved.
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * JS adaptation of black_hole/preprocess/functions.cc's deflection integration,
 * commit e72b3f293409893a6fa25528b29572c96fc57f57, BSD-3-Clause.
 * Changes: normalized r_s=1; escaped-ray half orbit only; RK4 instead of Euler;
 * logarithmic impact-parameter table for a distant, screen-plane source.
 */
export const CRITICAL_B=Math.sqrt(27)/2;
export const LUT_SIZE=2048,MAX_B=120,MIN_OFFSET=1e-6,ANGLE_RANGE=32;
export function traceDeflection(b,step=.001){
  if(b<=CRITICAL_B)return{captured:true,alpha:0,apsis:1.5};
  let u=0,v=1/b,phi=0;
  const acceleration=x=>1.5*x*x-x;
  for(let i=0;i<40000;i++){
    const k1u=v,k1v=acceleration(u),k2u=v+step*k1v/2,k2v=acceleration(u+step*k1u/2),k3u=v+step*k2v/2,k3v=acceleration(u+step*k2u/2),k4u=v+step*k3v,k4v=acceleration(u+step*k3u);
    const nextU=u+step*(k1u+2*k2u+2*k3u+k4u)/6,nextV=v+step*(k1v+2*k2v+2*k3v+k4v)/6;
    if(nextV<=0){const f=v/(v-nextV);return{captured:false,alpha:2*(phi+step*f)-Math.PI,apsis:1/(u+(nextU-u)*f)};}
    u=nextU;v=nextV;phi+=step;
    if(u>=1)return{captured:true,alpha:0,apsis:1};
  }
  throw new Error('Schwarzschild geodesic did not converge');
}
export function impactAtTexel(i){return CRITICAL_B+MIN_OFFSET*Math.exp(i/(LUT_SIZE-1)*Math.log((MAX_B-CRITICAL_B)/MIN_OFFSET));}
export function lensSourceRadius(radius,rs,alpha,sourceDistance=12){
  const b=radius/rs,c=Math.cos(alpha);
  if(b<=CRITICAL_B||c<=0)return{visible:false,radius:0};
  // Intersect the outgoing Schwarzschild asymptote with the source plane.
  return{visible:true,radius:rs*(b-sourceDistance*Math.sin(alpha))/c};
}
