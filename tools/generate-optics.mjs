import{writeFile}from'node:fs/promises';
import{traceDeflection,impactAtTexel,LUT_SIZE,ANGLE_RANGE}from'../dist/vendor/bruneton/geodesic.js';
const bytes=[];
for(let i=0;i<LUT_SIZE;i++){
  const alpha=traceDeflection(impactAtTexel(i)).alpha;
  const value=Math.round(Math.max(0,Math.min(1,alpha/ANGLE_RANGE))*16777215);
  bytes.push(value>>>16&255,value>>>8&255,value&255,255);
}
await writeFile(new URL('../dist/vendor/bruneton/deflection-lut.js',import.meta.url),`// Precomputed Schwarzschild null geodesics; see geodesic.js / LICENSE.\nexport const LUT_BYTES=new Uint8Array(${JSON.stringify(bytes)});\n`);
console.log(`Generated ${LUT_SIZE} Schwarzschild geodesic samples (${bytes.length} bytes)`);
