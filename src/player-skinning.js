import * as THREE from 'three';

// Repair scan weighting once on the shared body geometry, before making hand morphs.
// UV seams share a weight; neighbouring cloth vertices blend across a joint instead
// of following opposing bones. Keep the source GLBs and their bind pose intact.
export function repairPlayerSkinning(mesh) {
  const g = mesh.geometry;
  if (g.userData.playerSkinning) return g.userData.playerSkinning;
  const p = g.attributes.position, ix = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = mesh.skeleton.bones, count = bones.length, root = bones.findIndex(b => b.name === 'root');
  const arms = new Set(bones.flatMap((b, i) => /^(sh|el)[RL]$/.test(b.name) ? [i] : []));
  const legs = bones.flatMap((b, i) => /^(hip|kn)[RL]$/.test(b.name) ? [i] : []);
  const rootY = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[root]).invert().elements[13];
  const headBone=bones.findIndex(b=>b.name==='head'),headY=headBone<0?Infinity:new THREE.Matrix4().copy(mesh.skeleton.boneInverses[headBone]).invert().elements[13];
  const weld = new Int32Array(p.count), groups = [], keys = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(x => Math.round(x * 10000)).join(',');
    let w = keys.get(key); if (w === undefined) { w = groups.length; keys.set(key, w); groups.push([]); }
    weld[i] = w; groups[w].push(i);
  }
  const n = groups.length, links = Array.from({ length: n }, () => new Map()), armBlock = new Float32Array(n),headCore=new Uint8Array(n);
  let weights = new Float64Array(n * count), removed = 0;
  for (let w = 0; w < n; w++) {
    for (const i of groups[w]) for (let k = 0; k < 4; k++) weights[w * count + ix.getComponent(i, k)] += sw.getComponent(i, k) / groups[w].length;
    const i = groups[w][0], legW = legs.reduce((a, b) => a + weights[w * count + b], 0);
    headCore[w]=headBone>=0&&p.getY(i)>headY+.09&&weights[w*count+headBone]>.5;
    // The hanging hand overlaps the hip in this bind pose. Require existing leg
    // influence as well as height so the actual hand keeps its forearm attachment.
    const lowerBody = p.getY(i) < rootY + .12 && legW + weights[w * count + root] > .2;
    armBlock[w] = lowerBody ? 1 : 0;
    if (armBlock[w]) {
      let moved = 0; for (const b of arms) { moved += weights[w * count + b]*armBlock[w]; weights[w * count + b] *= 1-armBlock[w]; }
      const supports = [...legs, root];
      const support = supports.reduce((a, b) => a + weights[w * count + b], 0);
      if (moved > .001) removed++;
      if (support < 1e-6) weights[w * count + root] += moved;
      else for (const b of supports) weights[w * count + b] *= 1 + moved / support;
    }
  }
  const index = g.index.array;
  for (let f = 0; f < index.length; f += 3) for (const [i, j] of [[index[f], index[f + 1]], [index[f + 1], index[f + 2]], [index[f + 2], index[f]]]) {
    const a = weld[i], b = weld[j]; if (a === b) continue;
    const d = Math.hypot(p.getX(i) - p.getX(j), p.getY(i) - p.getY(j), p.getZ(i) - p.getZ(j));
    if (d > .2) continue;
    const k = 1 / Math.max(.004, d); links[a].set(b, k); links[b].set(a, k);
  }
  // A short spatial diffusion removes abrupt arm/torso seams without changing
  // geometry, adding bones, or adding any per-frame work.
  for (let pass = 0; pass < 20; pass++) {
    const next = weights.slice();
    for (let w = 0; w < n; w++) {
      let total = 0; for (const k of links[w].values()) total += k;
      if (!total) continue;
      for (let b = 0; b < count; b++) {
        let v = 0; for (const [other, k] of links[w]) v += weights[other * count + b] * k;
        next[w * count + b] = weights[w * count + b] * .45 + v / total * .55;
      }
      if(armBlock[w]){
        let armW=0;for(const b of arms)armW+=next[w*count+b];const moved=Math.max(0,armW-(1-armBlock[w]));
        if(moved>0){for(const b of arms)next[w*count+b]*=1-moved/armW;next[w*count+root]+=moved;}
      }
      let sum = 0; for (let b = 0; b < count; b++) sum += next[w * count + b];
      for (let b = 0; b < count; b++) next[w * count + b] /= sum || 1;
    }
    weights = next;
  }
  // Limit discontinuities on coarse scan triangles too. Pure diffusion alone
  // misses a long edge across a sparse chest or shoulder patch.
  for(let pass=0;pass<12;pass++){
    for(let w=0;w<n;w++)for(const [other,k]of links[w])if(w<other){
      let diff=0;for(let b=0;b<count;b++)diff+=Math.abs(weights[w*count+b]-weights[other*count+b]);
      const limit=Math.max(.06,8/k);if(diff<=limit)continue;const blend=.35*(1-limit/diff);
      for(let b=0;b<count;b++){const d=(weights[other*count+b]-weights[w*count+b])*blend;weights[w*count+b]+=d;weights[other*count+b]-=d;}
    }
    for(let w=0;w<n;w++)if(armBlock[w]){let moved=0;for(const b of arms){moved+=weights[w*count+b];weights[w*count+b]=0;}weights[w*count+root]+=moved;}
    for(let w=0;w<n;w++)if(headCore[w]){for(let b=0;b<count;b++)weights[w*count+b]=b===headBone?1:0;}
  }
  for (let w = 0; w < n; w++) {
    const top = Array.from({ length: count }, (_, b) => [b, weights[w * count + b]]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((a, [, v]) => a + v, 0) || 1;
    for (const i of groups[w]) for (let k = 0; k < 4; k++) { ix.setComponent(i, k, top[k]?.[0] ?? root); sw.setComponent(i, k, (top[k]?.[1] ?? 0) / sum); }
  }
  ix.needsUpdate = sw.needsUpdate = true;
  return g.userData.playerSkinning = { correctedLowerBodyVertices: removed, weldedVertices: p.count - n };
}

// Shoulder half-joints. ChainsRig has no clavicle, so the stance and the clips swing the upper arm 60-150° from the bind
// pose about one pivot, and linear blend skinning averaged the spine/shoulder blend zone straight through the chest: the
// deltoid caved in and the arm read as growing out of the front of the shirt (every losing tee critic). Each shoulder gets
// a helper bone on the spine at the shoulder joint that turns half as far; a vertex shared by spine and upper arm hands
// the overlapping share of both weights (2 x min) to it, so the blend zone bends in two half steps and keeps its volume.
// Weights are rewritten once per geometry; each character appends the helpers to its own skeleton (indices bones.length
// and +1, as the weights expect) and calls the returned update once the pose is final.
export function addHalfJoints(mesh) {
  const g = mesh.geometry, bones = mesh.skeleton.bones, n = bones.length, spine = bones.findIndex(b => b.name === 'spine');
  const pairs = ['shR', 'shL'].map((name, k) => ({ arm: bones.findIndex(b => b.name === name), half: n + k }));
  if (spine < 0 || pairs.some(p => p.arm < 0)) return { halves: [], update() {} };
  if (g.userData.halfJoints !== n) {
    const ix = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
    // only the shoulder cap and the chest/back beside it (from ~5 cm under the joint up): the armpit keeps the plain blend,
    // which folds it in under a raised arm; rigid half steps there stretched it into a web from the ribs to the elbow
    const jointY = pairs.map(p => new THREE.Matrix4().copy(mesh.skeleton.boneInverses[p.arm]).invert().elements[13]);
    for (let i = 0; i < ix.count; i++) for (const [j, { arm, half }] of pairs.entries()) {
      let a = -1, s = -1; for (let k = 0; k < 4; k++) { const b = ix.getComponent(i, k); if (b === arm) a = k; else if (b === spine) s = k; }
      if (a < 0 || s < 0) continue;
      const y = (pos.getY(i) - jointY[j] + .055) / .06, cap = y <= 0 ? 0 : y >= 1 ? 1 : y * y * (3 - 2 * y);
      const m = cap * Math.min(sw.getComponent(i, a), sw.getComponent(i, s)); if (m < 1e-4) continue;
      sw.setComponent(i, a, sw.getComponent(i, a) - m); sw.setComponent(i, s, sw.getComponent(i, s) - m);
      // an empty slot takes the helper; with all four in use the smaller of the pair makes way and its rest rides the helper
      let free = [0, 1, 2, 3].find(k => k !== a && k !== s && sw.getComponent(i, k) < 1e-5);
      if (free === undefined) free = sw.getComponent(i, a) <= sw.getComponent(i, s) ? a : s;
      ix.setComponent(i, free, half); sw.setComponent(i, free, (free === a || free === s ? sw.getComponent(i, free) : 0) + 2 * m);
    }
    ix.needsUpdate = sw.needsUpdate = true; g.userData.halfJoints = n;
  }
  const helpers = pairs.map(({ arm }) => { const h = new THREE.Bone(); h.name = bones[arm].name + 'Half'; h.position.copy(bones[arm].position); bones[spine].add(h); return h; });
  mesh.bind(new THREE.Skeleton([...bones, ...helpers], [...mesh.skeleton.boneInverses, ...pairs.map(p => mesh.skeleton.boneInverses[p.arm].clone())]), mesh.bindMatrix);
  const rest = new THREE.Quaternion();   // ChainsRig's bind rotations are identity (tools/build-golfer-v3.py)
  return { halves: pairs.map(p => p.half), update() { pairs.forEach(({ arm }, k) => { helpers[k].position.copy(bones[arm].position); helpers[k].quaternion.copy(rest).slerp(bones[arm].quaternion, .5); }); } };
}
