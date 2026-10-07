import * as THREE from 'three';

// Reusable landing reticle following the actual hillside, with no extra render target.
export function createShotGuide(parent) {
  const group = new THREE.Group(); group.name = 'estimated_landing'; parent.add(group);
  const points = new Float32Array(64 * 3), positions = new THREE.BufferAttribute(points, 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', positions);
  const mat = new THREE.LineBasicMaterial({ color: '#5cf0a8', transparent: true, opacity: .85, depthWrite: false });
  const ring = new THREE.LineLoop(geo, mat); ring.frustumCulled = false; group.add(ring);
  const crossGeo = new THREE.BufferGeometry(); crossGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const cross = new THREE.LineSegments(crossGeo, mat); cross.frustumCulled = false; group.add(cross);
  return { group, set(result, world, putt) {
    const [x, , z] = result.rest, radius = putt ? .42 : 1.25;
    const wet = world.inWater(x, z);
    const surface = result.holed ? 'Chains' : result.ob ? wet ? 'Water · penalty' : 'Out of bounds' : world.rough(x, z) > .5 ? 'Rough' : 'Fairway';
    mat.color.set(result.ob ? '#ff9275' : '#5cf0a8');
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2, px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius;
      points.set([px, result.ob && world.inWater(px, pz) ? world.waterLevel(px, pz) + .05 : world.height(px, pz) + .065, pz], i * 3);
    }
    positions.needsUpdate = true; geo.computeBoundingSphere();
    const y = result.ob && wet ? world.waterLevel(x, z) : world.height(x, z);
    crossGeo.attributes.position.array.set([x - radius * .35, y + .075, z, x + radius * .35, y + .075, z, x, y + .075, z - radius * .35, x, y + .075, z + radius * .35]);
    crossGeo.attributes.position.needsUpdate = true; crossGeo.computeBoundingSphere();
    return { range: result.thrown, left: result.dist, surface, danger: result.ob };
  }, dispose() { geo.dispose(); crossGeo.dispose(); mat.dispose(); parent.remove(group); } };
}
