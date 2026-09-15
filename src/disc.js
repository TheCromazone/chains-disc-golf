// Disc mesh: lathe profile of a real golf disc + a canvas stamp on the flight plate.
import * as THREE from 'three';
import { asset } from './assets.js';
import { cloneModel } from './models.js';

const profile = [[0, 0.017], [0.03, 0.0165], [0.06, 0.0145], [0.085, 0.0095], [0.1, 0.003], [0.105, -0.004], [0.104, -0.012], [0.098, -0.014], [0.088, -0.012], [0.086, -0.004], [0.086, 0.004], [0.06, 0.006], [0.03, 0.007], [0, 0.007]].map(p => new THREE.Vector2(p[0], p[1]));
const bodyGeo = new THREE.LatheGeometry(profile, 56);
const stampGeo = new THREE.CircleGeometry(0.062, 40).rotateX(-Math.PI / 2).translate(0, 0.0178, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3();

const stamps = new Map();
const stampMap = disc => { if(stamps.has(disc.id))return stamps.get(disc.id); const u=asset('discs',disc.id);const t=u?new THREE.TextureLoader().load(u):stampTexture(disc);t.colorSpace=THREE.SRGBColorSpace;t.__shared=true;stamps.set(disc.id,t);return t; };
function stampTexture(disc) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const dark = ['#f4f4f4', '#ffcc00'].includes(disc.color);
  g.strokeStyle = dark ? '#222' : '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.stroke();
  g.fillStyle = dark ? '#222' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 44px system-ui, sans-serif'; g.fillText(disc.name, 128, 110);
  g.font = '600 20px system-ui, sans-serif'; g.fillText(disc.type.toUpperCase(), 128, 150);
  g.font = 'bold 26px system-ui, sans-serif'; g.fillText(`${disc.speed} | ${disc.glide} | ${disc.turn} | ${disc.fade}`, 128, 186);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createDiscMesh(disc) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({ color: disc.color, roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
  body.castShadow = true; g.add(body);
  const imported = cloneModel('disc');
  if (imported) { body.visible = false; imported.scene.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(disc.color); o.material.roughness = .32; } }); g.add(imported.scene); }
  const stamp = new THREE.Mesh(stampGeo, new THREE.MeshStandardMaterial({ map: stampMap(disc), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1 }));
  g.add(stamp);
  g.userData.disc = disc; g.userData.spinAngle = 0;
  g.userData.dispose = () => g.traverse(o => { for(const m of [].concat(o.material||[])) if(!m.__shared)m.dispose(); });
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
