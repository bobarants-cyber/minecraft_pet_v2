import fs from 'node:fs';
const { pos } = JSON.parse(fs.readFileSync(process.env.WORK + '/simp.json'));
const n = pos.length / 3; const P = new Float32Array(pos.length);
for (let i = 0; i < n; i++) { const x = pos[3*i], y = pos[3*i+1], z = pos[3*i+2]; P[3*i] = x; P[3*i+1] = -z; P[3*i+2] = y; }
let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
for (let i=0;i<n;i++) for (let k=0;k<3;k++){mn[k]=Math.min(mn[k],P[3*i+k]);mx[k]=Math.max(mx[k],P[3*i+k]);}
const H = mx[1]-mn[1]; const cx=(mn[0]+mx[0])/2, cz=(mn[2]+mx[2])/2;
// normalize: height 1, feet y=0, centered
for (let i=0;i<n;i++){P[3*i]=(P[3*i]-cx)/H;P[3*i+1]=(P[3*i+1]-mn[1])/H;P[3*i+2]=(P[3*i+2]-cz)/H;}
console.log('W',(mx[0]-mn[0])/H,'D',(mx[2]-mn[2])/H);
const B=40; const prof=Array.from({length:B},()=>({minx:9,maxx:-9,minz:9,maxz:-9,c:0, inner:9}));
for(let i=0;i<n;i++){const b=Math.min(B-1,Math.floor(P[3*i+1]*B));const p=prof[b];p.minx=Math.min(p.minx,P[3*i]);p.maxx=Math.max(p.maxx,P[3*i]);p.minz=Math.min(p.minz,P[3*i+2]);p.maxz=Math.max(p.maxz,P[3*i+2]);p.c++; p.inner=Math.min(p.inner,Math.abs(P[3*i]));}
prof.forEach((p,i)=>console.log((i/B).toFixed(3),'x',p.minx.toFixed(3),p.maxx.toFixed(3),'z',p.minz.toFixed(3),p.maxz.toFixed(3),'minAbsX',p.inner.toFixed(3),p.c));
fs.writeFileSync(process.env.WORK + '/norm.json', JSON.stringify({ P: Array.from(P) }));
