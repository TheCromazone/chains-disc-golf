// Disc mesh: the Blender-lathed profile (assets/models/disc.glb, tools/build-disc.py) with translucent-looking
// plastic and a hot-stamp foil decal on the flight plate. The procedural lathe is the zero-asset fallback.
import * as THREE from 'three';
import { asset } from './assets.js';
import { cloneModel } from './models.js';

const profile = [[0, 0.0192], [0.03, 0.0187], [0.06, 0.017], [0.085, 0.013], [0.1, 0.0045], [0.105, -0.005], [0.1035, -0.012], [0.096, -0.0162], [0.088, -0.0135], [0.0835, -0.006], [0.0836, 0.002], [0.06, 0.0056], [0.03, 0.007], [0, 0.0074]].map(p => new THREE.Vector2(p[0], p[1]));
const bodyGeo = new THREE.LatheGeometry(profile, 56);
const stampGeo = new THREE.CircleGeometry(0.066, 48).rotateX(-Math.PI / 2);
{ // curve the decal onto the dome so it never floats or z-fights
  const pos = stampGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getZ(i)); pos.setY(i, 0.0192 - 0.0034 * (r / 0.066) ** 2 + 0.0006); }
  stampGeo.computeVertexNormals();
}
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();

// Foil stamp art per mould: name, mark, flight numbers. Drawn once per disc id and shared.
const MARKS = {
  driver: g => { g.lineWidth = 9; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(128, 96, 26 + i * 12, Math.PI * (0.15 + i * 0.5), Math.PI * (0.95 + i * 0.5)); g.stroke(); } },
  fairway: g => { g.lineWidth = 8; g.beginPath(); g.moveTo(74, 118); g.quadraticCurveTo(128, 60, 182, 118); g.moveTo(96, 112); g.quadraticCurveTo(128, 80, 160, 112); g.stroke(); },
  mid: g => { g.lineWidth = 7; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(80, 96 + i * 16); g.lineTo(176, 96 + i * 16); g.stroke(); } g.beginPath(); g.arc(128, 96, 32, 0, 7); g.stroke(); },
  putter: g => { g.lineWidth = 8; g.beginPath(); g.moveTo(128, 60); g.lineTo(128, 130); g.moveTo(96, 130); g.quadraticCurveTo(128, 154, 160, 130); g.moveTo(112, 78); g.lineTo(144, 78); g.stroke(); g.beginPath(); g.arc(128, 62, 8, 0, 7); g.stroke(); },
};
const stamps = new Map();
const stampMap = disc => { if (stamps.has(disc.id)) return stamps.get(disc.id); const u = asset('discs', disc.id); const t = u ? new THREE.TextureLoader().load(u) : stampTexture(disc); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.__shared = true; stamps.set(disc.id, t); return t; };
function stampTexture(disc) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512); g.scale(2, 2);
  const dark = ['#f4f4f4', '#ffcc00', '#ffd23f'].includes(disc.color);
  // metallic foil: a diagonal gradient with a bright band, like a real hot stamp
  const foil = g.createLinearGradient(40, 40, 216, 216);
  if (dark) { foil.addColorStop(0, '#3a3a44'); foil.addColorStop(.45, '#111118'); foil.addColorStop(.55, '#55556a'); foil.addColorStop(1, '#1a1a22'); }
  else { foil.addColorStop(0, '#ffffff'); foil.addColorStop(.42, '#d8dde6'); foil.addColorStop(.52, '#ffffff'); foil.addColorStop(.7, '#c2c9d6'); foil.addColorStop(1, '#f2f4f8'); }
  g.strokeStyle = g.fillStyle = foil; g.lineCap = g.lineJoin = 'round';
  g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(128, 128, 100, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  MARKS[disc.id]?.(g);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 34px system-ui, -apple-system, Segoe UI, sans-serif'; g.fillText(disc.name, 128, 166);
  g.font = '600 11px system-ui, sans-serif'; g.letterSpacing = '3px'; g.fillText(disc.type.toUpperCase(), 128, 190);
  g.letterSpacing = '0px'; g.font = 'bold 15px system-ui, sans-serif';
  [disc.speed, disc.glide, disc.turn, disc.fade].forEach((n, i) => { const x = 128 + (i - 1.5) * 26; g.beginPath(); g.roundRect(x - 11, 202, 22, 20, 4); g.stroke(); g.fillText(String(n), x, 212); });
  g.font = '600 9px system-ui, sans-serif'; g.fillText('CHAINS · DISC GOLF', 128, 236);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function plastic(color) {
  // Premium-plastic look under the sports lighting: soft sheen, a clearcoat for the glossy dome, a hint of depth.
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.18, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 0.8 });
  return m;
}

export function createDiscMesh(disc) {
  const g = new THREE.Group();
  const imported = cloneModel('disc');
  const body = imported ? null : new THREE.Mesh(bodyGeo, plastic(disc.color));
  if (body) { body.castShadow = true; g.add(body); }
  if (imported) { imported.scene.traverse(o => { if (o.isMesh) { o.material = plastic(disc.color); o.castShadow = true; } }); g.add(imported.scene); }
  const stamp = new THREE.Mesh(stampGeo, new THREE.MeshStandardMaterial({ map: stampMap(disc), transparent: true, roughness: 0.35, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false }));
  stamp.renderOrder = 1; g.add(stamp);
  g.userData.disc = disc; g.userData.spinAngle = 0;
  g.userData.dispose = () => g.traverse(o => { for (const m of [].concat(o.material || [])) if (!m.__shared) m.dispose(); });
  return g;
}

// p:[x,y,z], n:[nx,ny,nz] (disc normal), spin angle in radians
export function setDiscPose(mesh, p, n, spinAngle) {
  mesh.position.set(p[0], p[1], p[2]);
  _n.set(n[0], n[1], n[2]).normalize();
  _q.setFromUnitVectors(_up, _n);
  _q2.setFromAxisAngle(_up, spinAngle);
  mesh.quaternion.copy(_q).multiply(_q2);
}
