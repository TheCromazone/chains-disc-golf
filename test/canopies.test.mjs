import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANOPY_DATA } from '../src/canopy-data.js';

const metadata = JSON.parse(readFileSync('art/blender/canopies-r4.json', 'utf8'));
assert.equal(Object.keys(CANOPY_DATA).length, 6);
const signatures = new Set();
let totalTriangles = 0;
for (const species of ['pine', 'deciduous']) for (let variant = 0; variant < 3; variant++) {
  const key = `${species}${variant}`, [count, base64] = CANOPY_DATA[key];
  const bytes = Buffer.from(base64, 'base64'), positions = [], ao = [];
  for (let i = 0; i < count; i++) {
    const p = [0, 1, 2].map(axis => bytes.readInt16LE(i * 10 + axis * 2) / 2048);
    const n = [0, 1, 2].map(axis => bytes.readInt8(i * 10 + 6 + axis) / 127);
    assert(Math.abs(Math.hypot(...n)-1)<.01, `${key} authored smooth unit normals`);
    positions.push(p); ao.push(bytes[i * 10 + 9]);
    assert(p.every(Number.isFinite));
    assert(Math.hypot(p[0], p[2]) <= (species === 'pine' ? 2.3 : 3.4), `${key} stays inside crown radius`);
    assert(p[1] >= 3.1 && p[1] <= 11.1, `${key} crown height`);
  }
  const edges = new Map(), adjacency = Array.from({length: count}, () => []);
  let triangles = 0, volume6 = 0;
  for (let offset = count * 10; offset < bytes.length; offset += 6) {
    const ids = [0, 2, 4].map(i => bytes.readUInt16LE(offset + i));
    assert(ids.every(i => i < count));
    assert.equal(new Set(ids).size, 3, `${key} no repeated triangle vertices`);
    const [a, b, c] = ids.map(i => positions[i]);
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
    assert(Math.hypot(...cross) > 1e-5, `${key} nondegenerate triangle`);
    volume6 += a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    for (let i = 0; i < 3; i++) {
      const u = ids[i], v = ids[(i + 1) % 3], edge = [u, v].sort((a, b) => a - b).join(',');
      edges.set(edge, (edges.get(edge) || 0) + 1); adjacency[u].push(v); adjacency[v].push(u);
    }
    triangles++;
  }
  assert([...edges.values()].every(n => n === 2), `${key} closed manifold shells`);
  let components = 0; const seen = new Set();
  for (let i = 0; i < count; i++) if (!seen.has(i)) {
    components++; const pending = [i]; seen.add(i);
    while (pending.length) for (const next of adjacency[pending.pop()]) if (!seen.has(next)) {seen.add(next);pending.push(next);}
  }
  assert.equal(components, 3, `${key} exactly three large shells`);
  assert(volume6 > 0, `${key} outward-facing winding`);
  assert(Math.min(...ao) <= 110 && Math.max(...ao) >= 250, `${key} shaded interior and clean exterior`);
  assert(new Set(ao).size > 30, `${key} baked occlusion is spatially varied`);
  assert(triangles <= (species === 'pine' ? 540 : 576), `${key} no increase over previous Lite crown budget`);
  assert.equal(triangles, metadata.crowns[key].triangles);
  assert.equal(count, metadata.crowns[key].vertices);
  signatures.add(base64); totalTriangles += triangles;
}
assert.equal(signatures.size, 6, 'six distinct authored silhouettes');
console.log(`Canopy geometry OK: six variants, 18 closed shells, ${totalTriangles} total triangles; bounded radius, vertex AO and Lite budgets.`);
