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

// Aim stances per throw family, absolute joint angles in the shared contract (right-handed; callers mirror), breathing
// added per frame; the windup morphs them into the clip (stanceFade below). Spine and head pitch: negative leans forward.
// Hips pitch forward and every leg is solved so both soles stay planted with the shin near vertical: the rig has no
// ankle, so a leaning shin tips the foot onto its toe.
const STANCE = {
  // backhand: side-on and pre-coiled (pelvis ~70°, chest ~135° off the line), weight settled into bent knees, head turned
  // back over the leading shoulder to the target, the off arm hanging loose: the set-up a real reach-back starts from, and
  // the one Disc Golf Masters shows its thrower in; the chest hunched over the disc (a bolt-upright torso read as a
  // mannequin). The throwing arm was solved numerically (shR, elR incl. the forearm's roll) against the aim camera for a
  // compact address: the elbow out at shoulder height, the forearm across the chest dipping a little toward the hand, which
  // stays a hand's width off the chest, the wrist flexed toward the palm (grip morph, gltf-player.js) so the disc lies level
  // beside the hand ~22 cm under the shoulder, its far edge out toward the target. Critics read the earlier solves (the
  // forearm pointed at the lens, a dangling forearm, a wrist bent 90° sideways) as a chicken wing with the disc hanging off
  // a broken wrist
  backhand: { root: [-.12, 1.22, 0], spine: [-.3, 1.25, .1], head: [.37, -1.5, -.05], shR: [-1.006, .885, 2.433], elR: [2.05, .27, 0], shL: [.18, 0, -.14], elL: [.62, 0, 0], hipR: [.8, 0, .42], knR: [-.66, 0, 0], hipL: [.63, 0, -.2], knL: [-.68, 0, 0] },
  // forehand (and the other overhand-side throws): hips a little closed, shoulders loaded away from the line, elbow at
  // the ribs with the disc cocked out beside the hip, lead foot opposite the throwing hand, eyes on the target
  forehand: { root: [-.12, -.35, 0], spine: [-.16, -.35, 0], head: [.22, .7, 0], shR: [-.2, -.2, .25], elR: [1.5, 0, 0], shL: [.25, 0, -.25], elL: [.7, 0, 0], hipR: [.62, 0, .1], knR: [-.6, 0, 0], hipL: [.64, 0, -.2], knL: [-.48, 0, 0] },
  // putt: square to the pin with the throwing-side foot a half step ahead, knees loaded, hips hinged, the putter set in
  // both hands in front of the belly and a little to the off side, where the camera over the off shoulder still sees it,
  // eyes up on the chains
  putt: { root: [-.12, .2, 0], spine: [-.16, -.17, 0], head: [.14, -.05, 0], shR: [.1, .65, -.05], elR: [1.5, 0, 0], shL: [-.1, -.1, -.3], elL: [1.6, 0, 0], hipR: [.76, 0, .1], knR: [-.54, 0, 0], hipL: [.72, 0, -.12], knL: [-.66, 0, 0] },
};
// Cover-shot idle for the menu tee and bystanders: weight over the right leg, the left knee soft with its toe still on the
// ground, disc hand raised beside the head with the forearm upright (main.js spins the disc flat on it), off hand on the
// hip, head level. Right-handed; callers mirror. Absolute joint values, breathing sway added per frame.
const HERO = { root: [0, .08, -.03], spine: [.02, -.06, .05], head: [.02, .12, -.02], shR: [.45, -.4, .2], elR: [2.6, 0, 0], shL: [-.15, 0, -.5], elL: [.36, 0, .96], hipR: [.02, 0, .04], knR: [-.03, 0, 0], hipL: [.02, 0, -.1], knL: [-.26, 0, 0] };
export function heroPose(time, rig = RIGS.lite) {
  const pose = { rootY: 0 }; for (const j of JOINTS) pose[j] = [...(HERO[j] || IDLE[j])];
  const breath = Math.sin(time * 1.2);
  pose.spine[0] += .012 * breath; pose.shR[2] += .015 * breath; pose.elR[0] -= .02 * breath; pose.shL[2] -= .01 * Math.sin(time * .9);
  pose.head[1] += .05 * Math.sin(time * .35); pose.head[0] += .015 * Math.sin(time * .6); pose.root[2] += .006 * Math.sin(time * .5);
  pose.rootY = -Math.min(...soleHeights(pose, false, rig));
  return pose;
}
// The swipe morphs the stance into the clip across most of the windup rather than its first few percent: the coiled,
// knee-loaded set-up and the clip's reach-back share their shape, and a short fade bobbed the athlete upright between them.
export const STANCE_FADE = .4;
export const stanceFade = phase => { const u = Math.min(1, Math.max(0, phase / STANCE_FADE)); return 1 - u * u * (3 - 2 * u); };
export function readyPose(type, time, rig = RIGS.lite) {
  const stance = STANCE[type.split('_')[0]] || STANCE.forehand, breath = Math.sin(time * 1.3), pose = { rootY: 0 };
  for (const j of JOINTS) pose[j] = [...(stance[j] || IDLE[j])];
  const bank = type.endsWith('_io') ? .08 : type.endsWith('_oi') ? -.08 : 0;   // inside-out / outside-in: the shoulders already lean the way the clip banks
  pose.spine[2] += bank; pose.head[2] -= bank * .6;
  // breathing and a slow settle of the coil, so the set-up never freezes
  pose.knR[0] -= .02 + .02 * breath; pose.knL[0] -= .02 + .02 * breath; pose.spine[0] += .015 * breath; pose.head[1] += .04 * Math.sin(time * .5);
  pose.root[1] += .03 * Math.sin(time * .7); pose.spine[1] += .02 * Math.sin(time * .7 + .6); pose.elR[0] += .03 * breath;
  pose.rootY = -Math.min(...soleHeights(pose, false, rig));
  return pose;
}

// Sole support for the visual rig only. No X/Z root travel and no change to the player's lie.
// Leg geometry of the procedural rig and of ChainsRig (tools/golfer-rig.json "ground", what the Blender clips were planted with).
export const RIGS = { lite: { root: .64, hipDrop: .02, hipX: .115, thigh: .26, sole: [0, -.333, -.052], soleRadii: [.083, .027, .154] },
  glb: { root: .9867, hipDrop: .0905, hipX: .0995, thigh: .3638, sole: [0, -.5324, -.0196], soleRadii: [.0639, .012, .1418] } };
function rotate(v,r){let[x,y,z]=v;const[rx,ry,rz]=r;let c=Math.cos(rz),s=Math.sin(rz);[x,y]=[x*c-y*s,x*s+y*c];c=Math.cos(ry);s=Math.sin(ry);[x,z]=[x*c+z*s,-x*s+z*c];c=Math.cos(rx);s=Math.sin(rx);return[x,y*c-z*s,y*s+z*c];}
export function soleHeights(p,includeRootY=true,g=RIGS.lite){return ['R','L'].map(side=>{
 const hip=p['hip'+side],kn=p['kn'+side],root=p.root;const foot=v=>rotate(rotate(rotate(v,kn),hip),root);
 const knee=rotate([0,-g.thigh,0],hip),sole=rotate(rotate(g.sole,kn),hip);
 const center=rotate([(side==='R'?1:-1)*g.hipX+knee[0]+sole[0],-g.hipDrop+knee[1]+sole[1],knee[2]+sole[2]],root);
 const[rx,ry,rz]=g.soleRadii,radius=Math.hypot(foot([rx,0,0])[1],foot([0,ry,0])[1],foot([0,0,rz])[1]);
 return g.root+(includeRootY?p.rootY:0)+center[1]-radius;
});}
