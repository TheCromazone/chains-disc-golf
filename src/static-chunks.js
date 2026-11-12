import * as THREE from 'three';

// Partition immutable world-space triangles without simplifying or rebaking their attributes.
// Bounds cover whole triangles (including cross-cell edges) plus shader wind padding. Each
// tile keeps the original local coordinates, material and shadow behavior, so both the view
// and each shadow camera can use native frustum culling. Return flat meshes for raycasters.
export function partitionStaticMesh(mesh, { cellSize = 128, padding = .5 } = {}) {
  const source = mesh.geometry, attributes = Object.entries(source.attributes), position = source.attributes.position;
  if (source.drawRange.start !== 0 || Number.isFinite(source.drawRange.count) || mesh.isInstancedMesh || mesh.isSkinnedMesh || source.groups.length || Object.keys(source.morphAttributes).length || attributes.some(([, a]) => a.isInterleavedBufferAttribute)) return [mesh];
  source.computeBoundingBox();
  const size = source.boundingBox.getSize(new THREE.Vector3());
  if (Math.max(size.x, size.z) <= cellSize) return [mesh];
  const count = source.index?.count ?? position.count, cells = new Map(), indexAt = i => source.index ? source.index.getX(i) : i;
  for (let i = 0; i < count; i += 3) {
    const ids = [indexAt(i), indexAt(i + 1), indexAt(i + 2)];
    const x = ids.reduce((sum, j) => sum + position.getX(j), 0) / 3, z = ids.reduce((sum, j) => sum + position.getZ(j), 0) / 3;
    const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []); cells.get(key).push(...ids);
  }
  if (cells.size < 2) return [mesh];
  // Three UUID allocation must not change the unrelated idle/appearance random stream.
  const random = Math.random; let seed = mesh.id + 7919;
  Math.random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  try {
    const chunks = [];
    for (const [key, indices] of cells) {
      const remap = new Map(), vertices = [], local = [];
      for (const i of indices) { if (!remap.has(i)) { remap.set(i, vertices.length); vertices.push(i); } local.push(remap.get(i)); }
      const geometry = new THREE.BufferGeometry();
      for (const [name, attribute] of attributes) {
        const { itemSize, array, normalized } = attribute, data = new array.constructor(vertices.length * itemSize);
        vertices.forEach((i, j) => data.set(array.subarray(i * itemSize, (i + 1) * itemSize), j * itemSize));
        const copy = new THREE.BufferAttribute(data, itemSize, normalized); copy.gpuType = attribute.gpuType;
        geometry.setAttribute(name, copy);
      }
      geometry.setIndex(local); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      geometry.boundingBox.expandByScalar(padding); geometry.boundingSphere.radius += padding;
      const chunk = mesh.clone(false); chunk.geometry = geometry; chunk.frustumCulled = true;
      chunk.customDepthMaterial = mesh.customDepthMaterial; chunk.customDistanceMaterial = mesh.customDistanceMaterial;
      for (const hook of ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']) chunk[hook] = mesh[hook];
      chunk.name = `${mesh.name || 'static'}:${key}`; chunk.userData.staticChunk = true; chunks.push(chunk);
    }
    source.dispose(); return chunks;
  } finally { Math.random = random; }
}
