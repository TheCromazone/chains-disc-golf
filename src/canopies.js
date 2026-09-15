import * as THREE from 'three';
import { CANOPY_DATA } from './canopy-data.js';

// Tiny Blender-authored geometry is embedded so Lite and an empty asset manifest
// keep the same crowns without fetching a GLB, texture, decoder or loader.
export function canopyGeometry(species, variant) {
  const [count, encoded] = CANOPY_DATA[`${species}${variant}`];
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const gain = view.getUint8(i * 10 + 9) / 255;
    for (let axis = 0; axis < 3; axis++) {
      positions[i * 3 + axis] = view.getInt16(i * 10 + axis * 2, true) / 2048;
      normals[i * 3 + axis] = view.getInt8(i * 10 + 6 + axis) / 127;
      colors[i * 3 + axis] = gain;
    }
  }
  const indices = new Uint16Array((bytes.length - count * 10) / 2);
  for (let i = 0; i < indices.length; i++) indices[i] = view.getUint16(count * 10 + i * 2, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { canopy: species, variant, authoring: 'Blender', ao: 'baked-raycast' };
  return geometry;
}
