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
