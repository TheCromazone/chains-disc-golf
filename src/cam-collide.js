// Camera collision for the moving cameras (the disc chase, the landing shot, the hole flyover): how much of the segment from
// a subject (the disc) out to a wanted camera spot is clear air, against the same colliders the flight model uses (tree
// trunks and crowns from world.treesNear, the event arch's capsules) plus the terrain. Point samples along the segment, not
// exact sweeps: a trunk swollen by the margin is wider than the 0.4 m step, and it costs ~20 samples x the ~30 trees round
// one grid cell a frame. Returns the clear fraction 0..1 (1 = nothing in the way), backed off one step from the first hit.
const N = 20;
export function clearFraction(world, ax, ay, az, bx, by, bz, margin = .6, ground = 1.2, crown = .8) {   // crown: the share of a crown's radius that counts (its leaf cards are sparse at the rim)
  const trees = world.treesNear((ax + bx) / 2, (az + bz) / 2), caps = world.camBlockers || world.capsules || [];   // camBlockers: the arch's capsules plus camera-only ones (tents)   // 3x3 cells of 12 m round the midpoint: a chase segment is ~6 m
  for (let i = 1; i <= N; i++) {
    const u = i / N, x = ax + (bx - ax) * u, y = ay + (by - ay) * u, z = az + (bz - az) * u;
    let hit = y < world.height(x, z) + ground * u;   // the clearance grows from the subject (a disc on the turf) out to the lens
    for (let k = 0; !hit && k < trees.length; k++) {
      const t = trees[k], dx = x - t.x, dz = z - t.z, d2 = dx * dx + dz * dz, r = t.r + margin;
      if (d2 < r * r && y > t.y - .5 && y < t.y + t.h) hit = true;   // trunk
      else { const fy = y - (t.y + t.fy), fr = t.fr * crown, sx = ax - t.x, sy = ay - t.y - t.fy, sz = az - t.z; if (d2 + fy * fy < fr * fr && sx * sx + sy * sy + sz * sz > fr * fr) hit = true; }   // crown (not one the subject is inside)
    }
    for (let k = 0; !hit && k < caps.length; k++) {
      const c = caps[k], ex = c.b[0] - c.a[0], ey = c.b[1] - c.a[1], ez = c.b[2] - c.a[2], px = x - c.a[0], py = y - c.a[1], pz = z - c.a[2];
      const s = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez || 1))), qx = px - ex * s, qy = py - ey * s, qz = pz - ez * s, r = c.r + margin;
      if (qx * qx + qy * qy + qz * qz < r * r) hit = true;
    }
    if (hit) return (i - 1) / N;
  }
  return 1;
}
// The lens itself, out of the solids: clearFraction keeps the line from the disc to the wanted spot clear, but the tracker that
// carries the camera there lags, coasts and overshoots, and on its way it passed through crowns and beside the arch's legs
// (r4 watcher frames: a second of leaf cards over the lens). Moves p (a Vector3) radially out of any trunk's berth, crown or
// capsule, so the camera slides round a solid instead of through it. Returns whether it moved. A crown counts whole and a little
// over (the leaf cards reach the physics' radius; at .8 of it, the share a sight line may cross, cards sat on the lens), and a
// trunk by .8 m (a spruce's branches hang below its crown's sphere: at .4 m a chase into the woods filled a phone with needles).
export function pushOut(world, p, margin = .8, crown = 1.05) {
  let moved = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const t of world.treesNear(p.x, p.z)) {
      let dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), r = t.r + margin;
      if (d < r && p.y > t.y - .5 && p.y < t.y + t.h) { if (d < 1e-4) { dx = 1; d = 1; } p.x = t.x + dx / d * r; p.z = t.z + dz / d * r; moved = true; dx = p.x - t.x; dz = p.z - t.z; d = r; }
      const fy = p.y - t.y - t.fy, fr = t.fr * crown, D = Math.hypot(d, fy);
      if (D < fr) { const k = fr / Math.max(D, 1e-4); p.x = t.x + dx * k; p.y = t.y + t.fy + fy * k; p.z = t.z + dz * k; moved = true; }
    }
    for (const c of world.camBlockers || world.capsules || []) {
      const ex = c.b[0] - c.a[0], ey = c.b[1] - c.a[1], ez = c.b[2] - c.a[2], px = p.x - c.a[0], py = p.y - c.a[1], pz = p.z - c.a[2];
      const s = Math.max(0, Math.min(1, (px * ex + py * ey + pz * ez) / (ex * ex + ey * ey + ez * ez || 1))), qx = px - ex * s, qy = py - ey * s, qz = pz - ez * s, D = Math.hypot(qx, qy, qz), r = c.r + margin;
      if (D < r && D > 1e-4) { const k = r / D; p.x = c.a[0] + ex * s + qx * k; p.y = c.a[1] + ey * s + qy * k; p.z = c.a[2] + ez * s + qz * k; moved = true; }
    }
  }
  return moved;
}
