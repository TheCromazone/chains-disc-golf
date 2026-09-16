// Eleven-joint throw contract shared by Lite and Blender authoring.
export const JOINTS = ['root', 'spine', 'head', 'shR', 'elR', 'shL', 'elL', 'hipR', 'knR', 'hipL', 'knL'];
export const IDLE = { root: [0, 0, 0], spine: [0.04, 0, 0], head: [0, 0, 0], shR: [0.28, 0, 0.26], elR: [0.5, 0, 0], shL: [0.15, 0, -0.2], elL: [0.4, 0, 0], hipR: [0, 0, 0.04], knR: [-0.05, 0, 0], hipL: [0, 0, -0.04], knL: [-0.05, 0, 0], rootY: 0 };

export const K = {
  backhand: [
    { t: 0,    root: [0, 0.55, 0], spine: [0.06, 0.1, 0], head: [0, -0.5, 0], shR: [0.95, 0.15, -0.2], elR: [1.2, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, 1.55, 0], spine: [0.12, 0.35, 0.08], head: [0, -1.2, 0], shR: [0.15, -0.55, -1.45], elR: [0.25, 0, 0], shL: [0.35, 0, -1.0], elL: [0.6, 0, 0], hipR: [0.45, 0, 0.1], knR: [-0.35, 0, 0], hipL: [-0.3, 0, -0.08], knL: [-0.5, 0, 0], rootY: -0.04 },
    { t: 0.62, root: [0, 0.75, 0], spine: [0.05, -0.15, 0], head: [0, -0.6, 0], shR: [0.05, 0.82, 1.45], elR: [0.08, 0, 0], shL: [0.5, 0, -0.85], elL: [0.9, 0, 0], hipR: [-0.15, 0, 0.1], knR: [-0.25, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, -0.35, 0], spine: [0.05, -0.35, -0.08], head: [0, 0.1, 0], shR: [0.1, -0.5, -1.3], elR: [0.35, 0, 0], shL: [0.1, 0, -0.55], elL: [0.5, 0, 0], hipR: [-0.45, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.15, 0, -0.05], knL: [-0.15, 0, 0], rootY: 0 },
    { t: 1,    root: [0, -0.45, 0], spine: [0.05, 0, 0], head: [0, 0.2, 0], shR: [0.35, 0, 0.3], elR: [0.4, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  forehand: [
    { t: 0,    root: [0, 0.15, 0], spine: [0.05, 0, 0], head: [0, -0.15, 0], shR: [0.4, 0, 0.5], elR: [1.5, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.35, 0], spine: [0.1, -0.2, 0.15], head: [0, 0.3, 0], shR: [-0.7, 0.3, 0.9], elR: [1.8, 0, 0], shL: [0.7, 0, -0.6], elL: [0.9, 0, 0], hipR: [-0.3, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.45, 0, -0.05], knL: [-0.35, 0, 0], rootY: -0.1 },
    { t: 0.62, root: [0, 0.2, 0], spine: [0.05, 0.2, 0.05], head: [0, -0.2, 0], shR: [1.15, 0, 0.55], elR: [0.15, 0, 0], shL: [0.4, 0, -0.8], elL: [0.9, 0, 0], hipR: [-0.15, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.04 },
    { t: 0.8,  root: [0, 0.6, 0], spine: [0.1, 0.4, -0.1], head: [0, -0.5, 0], shR: [1.3, 0, -0.7], elR: [0.6, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.5, 0, 0.15], knR: [-0.6, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.5, 0], spine: [0.05, 0, 0], head: [0, -0.3, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  tomahawk: [
    { t: 0,    root: [0, -0.3, 0], spine: [0.05, 0, 0], head: [0, 0.3, 0], shR: [0.9, 0, 0.35], elR: [1.4, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.7, 0], spine: [-0.25, -0.2, 0.1], head: [0, 0.6, 0], shR: [3.3, 0, 0.6], elR: [1.1, 0, 0], shL: [1.4, 0, -0.5], elL: [0.4, 0, 0], hipR: [-0.2, 0, 0.1], knR: [-0.4, 0, 0], hipL: [0.7, 0, -0.05], knL: [-0.9, 0, 0], rootY: -0.06 },
    { t: 0.62, root: [0, 0.25, 0], spine: [0.25, 0.2, 0], head: [0, -0.1, 0], shR: [2.2, 0, 0.2], elR: [0.15, 0, 0], shL: [0.4, 0, -0.9], elL: [0.9, 0, 0], hipR: [-0.5, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.35, 0, -0.05], knL: [-0.25, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, 0.5, 0], spine: [0.55, 0.3, 0], head: [0.3, -0.2, 0], shR: [1.0, 0, -0.6], elR: [0.5, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.7, 0, 0.15], knR: [-0.6, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.3, 0, 0], rootY: -0.05 },
    { t: 1,    root: [0, 0.4, 0], spine: [0.1, 0, 0], head: [0, 0, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  scoober: [
    { t: 0,    root: [0, 0.1, 0], spine: [0.05, 0, 0], head: [0, -0.1, 0], shR: [0.5, 0, 0.5], elR: [1.4, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.4, 0], spine: [0.2, -0.2, 0.2], head: [0, 0.4, 0], shR: [0.45, 0.1, -0.75], elR: [0.9, 0, 0], shL: [0.6, 0, -0.6], elL: [0.9, 0, 0], hipR: [-0.2, 0, 0.12], knR: [-0.5, 0, 0], hipL: [0.4, 0, -0.05], knL: [-0.4, 0, 0], rootY: -0.1 },
    { t: 0.62, root: [0, 0.15, 0], spine: [-0.05, 0.2, -0.05], head: [0, -0.1, 0], shR: [2.4, 0, -0.3], elR: [0.15, 0, 0], shL: [0.3, 0, -0.8], elL: [0.9, 0, 0], hipR: [-0.2, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.02 },
    { t: 0.8,  root: [0, 0.5, 0], spine: [-0.15, 0.4, -0.15], head: [0, -0.4, 0], shR: [2.65, 0, -0.65], elR: [0.25, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.4, 0, 0.15], knR: [-0.5, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.4, 0], spine: [0.05, 0, 0], head: [0, -0.2, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  blade: [
    { t: 0,    root: [0, 0.15, 0], spine: [0.05, 0, 0], head: [0, -0.15, 0], shR: [0.4, 0, 0.5], elR: [1.5, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.5, 0], spine: [-0.1, -0.25, 0.15], head: [0, 0.4, 0], shR: [-1.2, 0.3, 1.5], elR: [1.7, 0, 0], shL: [0.7, 0, -0.6], elL: [0.9, 0, 0], hipR: [-0.3, 0, 0.12], knR: [-0.55, 0, 0], hipL: [0.45, 0, -0.05], knL: [-0.35, 0, 0], rootY: -0.05 },
    { t: 0.62, root: [0, 0.15, 0], spine: [0.15, 0.2, -0.05], head: [0, -0.2, 0], shR: [1.9, 0.2, 1.1], elR: [0.2, 0, 0], shL: [0.4, 0, -0.8], elL: [0.9, 0, 0], hipR: [-0.15, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.02 },
    { t: 0.8,  root: [0, 0.55, 0], spine: [0.3, 0.4, -0.2], head: [0, -0.5, 0], shR: [2.2, 0, -0.6], elR: [0.6, 0, 0], shL: [0.1, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.5, 0, 0.15], knR: [-0.6, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0.5, 0], spine: [0.05, 0, 0], head: [0, -0.3, 0], shR: [0.4, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  hammer: [   // overhead like a serve: cocked behind the head, released above and ahead, arm sweeps down across the body
    { t: 0,    root: [0, 0.2, 0], spine: [0.05, 0, 0], head: [0, -0.1, 0], shR: [0.6, 0, 0.5], elR: [1.6, 0, 0], shL: [0.3, 0, -0.3], elL: [0.5, 0, 0], hipR: [0, 0, 0.05], knR: [-0.1, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
    { t: 0.5,  root: [0, -0.55, 0], spine: [-0.30, -0.2, 0.15], head: [-0.2, 0.5, 0], shR: [2.5, 0.2, 1.05], elR: [2.1, 0, 0], shL: [1.6, 0, -0.8], elL: [0.5, 0, 0], hipR: [-0.2, 0, 0.12], knR: [-0.5, 0, 0], hipL: [0.4, 0, -0.05], knL: [-0.4, 0, 0], rootY: -0.1 },
    { t: 0.62, root: [0, 0.35, 0], spine: [0.25, 0.25, -0.05], head: [0.1, -0.1, 0], shR: [2.85, 0, 0.35], elR: [0.25, 0, 0], shL: [0.6, 0, -0.7], elL: [0.9, 0, 0], hipR: [-0.2, 0, 0.1], knR: [-0.3, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.2, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, 0.7, 0], spine: [0.55, 0.35, -0.2], head: [0.35, -0.3, 0], shR: [1.1, 0, -0.6], elR: [0.7, 0, 0], shL: [0.2, 0, -0.5], elL: [0.5, 0, 0], hipR: [-0.4, 0, 0.15], knR: [-0.5, 0, 0], hipL: [0.1, 0, -0.05], knL: [-0.1, 0, 0], rootY: -0.04 },
    { t: 1,    root: [0, 0.5, 0], spine: [0.12, 0, 0], head: [0, -0.1, 0], shR: [0.5, 0, 0.3], elR: [0.5, 0, 0], shL: [0.1, 0, -0.2], elL: [0.35, 0, 0], hipR: [-0.2, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
  putt: [
    { t: 0,    root: [0, 0, 0], spine: [0.15, 0, 0], head: [-0.1, 0, 0], shR: [0.7, 0, 0.2], elR: [1.7, 0, 0], shL: [0.3, 0, -0.6], elL: [0.4, 0, 0], hipR: [0.25, 0, 0.05], knR: [-0.5, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.5, 0, 0], rootY: -0.1 },
    { t: 0.5,  root: [0, 0, 0], spine: [0.28, 0, 0], head: [-0.2, 0, 0], shR: [0.45, 0, 0.25], elR: [2.0, 0, 0], shL: [0.35, 0, -0.8], elL: [0.4, 0, 0], hipR: [0.4, 0, 0.05], knR: [-0.8, 0, 0], hipL: [0.4, 0, -0.05], knL: [-0.8, 0, 0], rootY: -0.17 },
    { t: 0.62, root: [0, 0, 0], spine: [0.05, 0, 0], head: [-0.05, 0, 0], shR: [1.5, 0, 0.1], elR: [0.15, 0, 0], shL: [0.3, 0, -0.7], elL: [0.4, 0, 0], hipR: [-0.25, 0, 0.05], knR: [-0.35, 0, 0], hipL: [0.3, 0, -0.05], knL: [-0.25, 0, 0], rootY: -0.03 },
    { t: 0.8,  root: [0, 0, 0], spine: [-0.05, 0, 0], head: [0, 0, 0], shR: [1.95, 0, 0.1], elR: [0.1, 0, 0], shL: [0.2, 0, -0.6], elL: [0.4, 0, 0], hipR: [-0.7, 0, 0.05], knR: [-0.2, 0, 0], hipL: [0.25, 0, -0.05], knL: [-0.15, 0, 0], rootY: 0 },
    { t: 1,    root: [0, 0, 0], spine: [0.05, 0, 0], head: [0, 0, 0], shR: [1.2, 0, 0.2], elR: [0.4, 0, 0], shL: [0.15, 0, -0.3], elL: [0.4, 0, 0], hipR: [-0.35, 0, 0.05], knR: [-0.3, 0, 0], hipL: [0.15, 0, -0.05], knL: [-0.1, 0, 0], rootY: 0 },
  ],
};

K.backhand.splice(2,0,{...structuredClone(K.backhand[1]),t:.565,root:[0,1.05,0],spine:[.08,.12,.03],head:[0,-.85,0],shR:[.75,.1,-.45],elR:[1.45,0,0],rootY:-.045});

// Disc-footage loading: compress both knees, then brace the lead leg and release the trailing foot.
// Backhand/putt lead with the throwing-side foot; forehand/overheads lead with the opposite foot.
for(const [id,keys] of Object.entries(K)) {
  const lead=['backhand','putt'].includes(id)?'R':'L',rear=lead==='R'?'L':'R';
  for(const k of keys) {
    if(k.t===.5){for(const side of ['R','L']){k['hip'+side][0]=.98;k['kn'+side][0]=-1.0;}}
    if(k.t===.565){k['hip'+lead][0]=.42;k['kn'+lead][0]=-.46;k['hip'+rear][0]=.25;k['kn'+rear][0]=-.52;}
    if(k.t===.62){k['hip'+lead][0]=.12;k['kn'+lead][0]=-.14;k['hip'+rear][0]=-.18;k['kn'+rear][0]=-.35;}
    if(k.t===.8){k['hip'+lead][0]=.06;k['kn'+lead][0]=-.09;k['hip'+rear][0]=-.55;k['kn'+rear][0]=-.65;}
    if(k.t===1){k['hip'+lead][0]=.06;k['kn'+lead][0]=-.1;k['hip'+rear][0]=-.16;k['kn'+rear][0]=-.28;}
  }
}

// Authored bank variants preserve the base kinetic sequence and bank the shoulder plane.
// The disc bank itself remains authoritative in THROWS; these are distinct visual clips.
for (const base of ['backhand','forehand']) for (const [suffix,bank] of [['io',.24],['oi',-.24]]) {
  K[base+'_'+suffix] = K[base].map(k=>{const out=structuredClone(k);const weight=Math.sin(Math.PI*k.t);out.spine[2]+=bank*weight;out.shR[2]+=bank*weight*.7;return out;});
}

// Left-handers are the same motion reflected: swap sides, negate the yaw and roll of every joint.
const MIRROR = { shR: 'shL', shL: 'shR', elR: 'elL', elL: 'elR', hipR: 'hipL', hipL: 'hipR', knR: 'knL', knL: 'knR' };
export const mirrorPose = t => { const m = { rootY: t.rootY }; for (const j of JOINTS) { const v = t[MIRROR[j] || j]; m[j] = [v[0], -v[1], -v[2]]; } return m; };
export const keysFor = t => K[t] || K[t.split('_')[0]] || K.backhand;
// Monotone cubic Hermite interpolation preserves momentum through release (.62).
// Local extrema may settle, but every key no longer forces the entire body to stop.
export function poseAt(keys, phase) {
  phase=Math.max(0,Math.min(1,phase));let n=0;
  while(n<keys.length-2&&phase>keys[n+1].t)n++;
  const a=keys[n],b=keys[n+1],h=b.t-a.t,u=(phase-a.t)/h;
  const value=(k,j,c)=>j==='rootY'?(keys[k].rootY||0):(keys[k][j]||IDLE[j])[c];
  const tangent=(k,j,c)=>{
    if(k===0||k===keys.length-1)return 0;
    const h0=keys[k].t-keys[k-1].t,h1=keys[k+1].t-keys[k].t;
    const d0=(value(k,j,c)-value(k-1,j,c))/h0,d1=(value(k+1,j,c)-value(k,j,c))/h1;
    if(d0*d1<=0)return 0;const w1=2*h1+h0,w2=h1+2*h0;
    return (w1+w2)/(w1/d0+w2/d1);
  };
  const interpolate=(j,c)=> (2*u*u*u-3*u*u+1)*value(n,j,c)+(u*u*u-2*u*u+u)*h*tangent(n,j,c)+(-2*u*u*u+3*u*u)*value(n+1,j,c)+(u*u*u-u*u)*h*tangent(n+1,j,c);
  const out={};for(const j of JOINTS)out[j]=[0,1,2].map(c=>interpolate(j,c));out.rootY=interpolate('rootY',0);out.rootY=-Math.min(...soleHeights(out,false));return out;
}

// Sole support for the visual rig only. No X/Z root travel and no change to the player's lie.
function rotate(v,r){let[x,y,z]=v;const[rx,ry,rz]=r;let c=Math.cos(rz),s=Math.sin(rz);[x,y]=[x*c-y*s,x*s+y*c];c=Math.cos(ry);s=Math.sin(ry);[x,z]=[x*c+z*s,-x*s+z*c];c=Math.cos(rx);s=Math.sin(rx);return[x,y*c-z*s,y*s+z*c];}
export function soleHeights(p,includeRootY=true){return ['R','L'].map(side=>{
 const hip=p['hip'+side],kn=p['kn'+side],root=p.root;const foot=v=>rotate(rotate(rotate(v,kn),hip),root);
 const knee=rotate([0,-.26,0],hip),sole=rotate(rotate([0,-.333,-.052],kn),hip);
 const center=rotate([(side==='R'?1:-1)*.115+knee[0]+sole[0],-.02+knee[1]+sole[1],knee[2]+sole[2]],root);
 const radius=Math.hypot(foot([.083,0,0])[1],foot([0,.027,0])[1],foot([0,0,.154])[1]);
 return .64+(includeRootY?p.rootY:0)+center[1]-radius;
});}
