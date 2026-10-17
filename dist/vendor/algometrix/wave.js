/** Adapted from algometrix/blackhole-sim gravitationalWave.ts and grid.vert,
 * commit 0ee5541ec4ffcd9ca708f37c080bf00b7f3ef6d1. MIT License.
 * Copyright (c) 2026 algometrix. Full license in ./LICENSE.
 * Changes: outgoing ringdown packet and transverse-traceless image-plane
 * displacement instead of vertical displacement of a Flamm grid.
 */
export function waveDisplacement(x,y,wave){
  const dx=x-wave.x,dy=y-wave.y,r=Math.hypot(dx,dy),tau=wave.age-r/180;
  if(tau<0||tau>3)return{x:0,y:0};
  const phi=Math.atan2(dy,dx),phase=8*tau;
  const amplitude=.14*wave.power*(80/Math.max(80,r))*Math.sin(Math.PI*tau/3)**2*Math.exp(-tau*.6);
  const plus=amplitude*Math.cos(2*phi-phase),cross=amplitude*Math.sin(2*phi-phase);
  return{x:.5*(plus*dx+cross*dy),y:.5*(cross*dx-plus*dy)};
}
