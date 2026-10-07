import * as THREE from 'three';

// Pose transitions are captured AFTER the stance and hand overlays. Mixer-only
// crossfades cannot retain those poses and used to snap a recovering thrower upright.
// The throw itself stays unfiltered so the authored .62 release remains exact.
export function createAthleteMotion({ joints, actor, skin, group }) {
  const bones = Object.values(joints), last = bones.map(b => b.quaternion.clone());
  const from = last.map(q => q.clone()), root = joints.root;
  let mode = null, transition = 1, lastY = root.position.y, fromY = lastY;
  let ground = null, gaze = null, gazeYaw = 0, gazePitch = 0;
  const point = new THREE.Vector3(), target = new THREE.Vector3(), q = new THREE.Quaternion(), euler = new THREE.Euler();
  // Heel, toe and both sides of each sole, sampled from each figure's own mesh.
  // This follows the actual skinned shoes, including the phone LOD and body scale.
  const p = skin.geometry.attributes.position;
  const soles = [];
  for (const side of [-1, 1]) {
    const indices = [];
    for (let i = 0; i < p.count; i++) if (p.getX(i) * side > 0 && p.getY(i) < .10) indices.push(i);
    indices.sort((a, b) => p.getY(a) - p.getY(b));
    const cells = new Set();
    for (const i of indices) {
      const key = `${Math.round(p.getX(i) * 60)},${Math.round(p.getZ(i) * 60)}`;
      if (!cells.has(key)) { cells.add(key); soles.push(i); }
      if (cells.size >= 12) break;
    }
  }
  return {
    setGround(fn) { ground = fn; },
    lookAt(value) { gaze = value ? target.copy(value) : null; },
    update(dt, nextMode, phase) {
      if (mode !== nextMode) {
        from.forEach((q, i) => q.copy(last[i])); fromY = lastY;
        transition = mode === null || phase !== null ? 1 : 0;
        mode = nextMode;
      }
      transition = Math.min(1, transition + Math.max(0, dt) / .32);
      if (transition < 1) {
        const t = transition * transition * (3 - 2 * transition);
        bones.forEach((b, i) => { q.copy(b.quaternion); b.quaternion.copy(from[i]).slerp(q, t); });
        root.position.y = THREE.MathUtils.lerp(fromY, root.position.y, t);
      }
      if (gaze && joints.head) {
        group.updateMatrixWorld(true);
        const head = joints.head;
        point.copy(gaze); head.parent.worldToLocal(point); point.sub(head.position);
        const yaw = THREE.MathUtils.clamp(Math.atan2(-point.x, -point.z), -1.1, 1.1);
        const pitch = THREE.MathUtils.clamp(Math.atan2(point.y, Math.hypot(point.x, point.z)), -.25, .30);
        const a = 1 - Math.exp(-Math.max(0, dt) * 7);
        gazeYaw += (yaw - gazeYaw) * a; gazePitch += (pitch - gazePitch) * a;
        head.quaternion.slerp(q.setFromEuler(euler.set(gazePitch, gazeYaw, 0, 'YXZ')), phase !== null ? .25 : .65);
      }
      if (ground && soles.length) {
        group.updateMatrixWorld(true); skin.skeleton.update();
        let offset = -Infinity;
        for (const i of soles) {
          skin.getVertexPosition(i, point); skin.localToWorld(point);
          offset = Math.max(offset, ground(point.x, point.z) + .012 - point.y + actor.position.y);
        }
        if (Number.isFinite(offset)) actor.position.y = THREE.MathUtils.clamp(offset, -.20, .20);
      }
      bones.forEach((b, i) => last[i].copy(b.quaternion)); lastY = root.position.y;
      group.updateMatrixWorld(true);
    }
  };
}
