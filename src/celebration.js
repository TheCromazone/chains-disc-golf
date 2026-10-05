import * as THREE from 'three';

// A fixed pool: one instanced draw, no per-frame object or geometry allocations.
export function createCelebration(scene) {
  const count = 96, states = [], dummy = new THREE.Object3D();
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.055, .1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  const colors = ['#5cf0a8', '#ffd23f', '#ff6d68', '#b5f4ff', '#ffffff'].map(c => new THREE.Color(c));
  let elapsed = 10;
  function burst(at, big = false) {
    elapsed = 0; states.length = 0;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963, radius = .5 + Math.random() * 1.8;
      states.push({ x: at[0], y: at[1] + 1, z: at[2], vx: Math.cos(angle) * radius, vy: (big ? 3.2 : 2.4) + Math.random() * 1.8, vz: Math.sin(angle) * radius, phase: angle });
      mesh.setColorAt(i, colors[i % colors.length]);
    }
    mesh.instanceColor.needsUpdate = true; mesh.visible = true; update(0);
  }
  function update(dt) {
    if (!mesh.visible) return; elapsed += dt;
    if (elapsed > 3.2) { mesh.visible = false; return; }
    for (let i = 0; i < count; i++) {
      const p = states[i]; p.vy -= dt * 2.5; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(elapsed * 4 + p.phase, elapsed * 3, p.phase + elapsed * 2);
      dummy.scale.setScalar(Math.min(1, (3.2 - elapsed) * 2)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { burst, update, clear() { mesh.visible = false; }, dispose() { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } };
}
