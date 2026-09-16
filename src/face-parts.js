// One shared canvas atlas, seven persistent decal planes projected onto the head. Choices only change UVs;
// the iris and facial-hair rows are drawn white so the material colour tints them (eye colour, hair colour).
import * as THREE from 'three';
export const FACE_OPTIONS = {
  eyes: ['round', 'oval', 'happy', 'focused'], brows: ['soft', 'straight', 'arched', 'bold'],
  nose: ['dot', 'button', 'angle', 'round'], mouth: ['smile', 'grin', 'calm', 'open'],
  glasses: ['none', 'round', 'square', 'sport'], facialHair: ['none', 'stubble', 'goatee', 'mustache', 'beard'],
};
export const EYE_COLORS = ['#2b2b2b', '#4a2a14', '#2560a8', '#2f7a3d', '#6b7b8c', '#8a5a2b'];
export const FACE_DEFAULTS = { eyes: 'round', brows: 'soft', nose: 'button', mouth: 'smile', glasses: 'none', facialHair: 'none', eyeColor: '#2b2b2b' };
// Atlas rows: the five option rows, then the tinted iris row (one tile per eye style) and facial hair.
const ROWS = ['eyes', 'brows', 'nose', 'mouth', 'glasses', 'facialHair', 'iris'];
const TILE = 128, COLS = 5, ATLAS_W = TILE * COLS, ATLAS_H = TILE * ROWS.length;
let atlas = null;
export function setFaceAtlas(texture) { atlas = texture; atlas.colorSpace = THREE.SRGBColorSpace; atlas.__shared = true; }
// Deterministic paths; the canvas is the zero-asset source of truth.
export function drawFaceAtlas(canvas) {
  canvas.width = ATLAS_W; canvas.height = ATLAS_H; const c = canvas.getContext('2d');
  const line = (points, width = 7) => { c.lineWidth = width; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke(); };
  const oval = (x, y, rx, ry, fill = true) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fill ? c.fill() : c.stroke(); };
  ROWS.forEach((part, row) => (part === 'iris' ? FACE_OPTIONS.eyes : FACE_OPTIONS[part]).forEach((id, col) => {
    c.save(); c.translate(col * TILE, row * TILE); c.fillStyle = c.strokeStyle = '#292633'; c.lineCap = c.lineJoin = 'round'; c.lineWidth = 7;
    if (part === 'eyes') for (const x of [35, 93]) {
      if (id === 'happy') { c.beginPath(); c.arc(x, 70, 13, Math.PI, Math.PI * 2); c.stroke(); }
      else { oval(x, 64, id === 'focused' ? 14 : 11, id === 'oval' ? 22 : id === 'focused' ? 8 : 16); }
    }
    if (part === 'iris' && id !== 'happy') for (const x of [35, 93]) {   // white ring: pupil and glint come from the eye tile beneath
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, 64, id === 'focused' ? 9 : 7.5, id === 'focused' ? 6 : id === 'oval' ? 12 : 9, 0, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'destination-out'; oval(x, 64, 3.6, 4.2); c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#ffffff'; oval(x - 3, 58, 3, 4);
    }
    if (part === 'eyes' && id !== 'happy') for (const x of [35, 93]) { c.fillStyle = 'white'; oval(x - 3, 58, 3, 4); c.fillStyle = '#292633'; }
    if (part === 'brows') for (const [x, dir] of [[35, -1], [93, 1]]) {
      if (id === 'arched') { c.beginPath(); c.moveTo(x - 18, 70); c.quadraticCurveTo(x, 48, x + 18, 65); c.stroke(); }
      else line([[x - 17, 64 + (id === 'soft' ? dir * 3 : 0)], [x + 17, 64 - (id === 'soft' ? dir * 3 : 0)]], id === 'bold' ? 12 : 7);
    }
    if (part === 'nose') {
      c.strokeStyle = c.fillStyle = '#a2644b';
      if (id === 'dot') oval(64, 64, 7, 6);
      if (id === 'button') { c.beginPath(); c.arc(64, 64, 11, 0, Math.PI); c.stroke(); }
      if (id === 'angle') line([[66, 49], [55, 70], [69, 70]], 5);
      if (id === 'round') { oval(64, 64, 13, 10, false); }
    }
    if (part === 'mouth') {
      c.fillStyle = c.strokeStyle = '#843f3f';
      if (id === 'smile') { c.beginPath(); c.moveTo(38, 54); c.quadraticCurveTo(64, 88, 90, 54); c.stroke(); }
      if (id === 'grin') { c.beginPath(); c.moveTo(34, 50); c.lineTo(94, 50); c.quadraticCurveTo(64, 104, 34, 50); c.fill(); c.fillStyle = 'white'; c.fillRect(42, 53, 44, 10); }
      if (id === 'calm') line([[44, 64], [84, 64]], 6);
      if (id === 'open') oval(64, 64, 13, 19);
    }
    if (part === 'glasses' && id !== 'none') {
      for (const x of [34, 94]) {
        if (id === 'round') oval(x, 64, 24, 27, false);
        else { c.beginPath(); c.roundRect(x - 25, 41, 50, 45, 9); id === 'sport' ? c.fill() : c.stroke(); }
      }
      line([[58, 60], [70, 60]], 6);
    }
    if (part === 'facialHair' && id !== 'none') {   // white ink, tinted by hair colour at runtime; tile spans the lower face
      c.fillStyle = c.strokeStyle = '#ffffff';
      if (id === 'stubble') { c.globalAlpha = .45; c.beginPath(); c.moveTo(18, 40); c.quadraticCurveTo(64, 120, 110, 40); c.quadraticCurveTo(100, 78, 64, 88); c.quadraticCurveTo(28, 78, 18, 40); c.fill(); c.globalAlpha = 1; }
      if (id === 'goatee') { c.beginPath(); c.ellipse(64, 84, 16, 20, 0, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.ellipse(64, 72, 9, 6, 0, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'source-over'; }
      if (id === 'mustache') { c.beginPath(); c.moveTo(38, 60); c.quadraticCurveTo(64, 46, 90, 60); c.quadraticCurveTo(78, 70, 64, 63); c.quadraticCurveTo(50, 70, 38, 60); c.fill(); }
      if (id === 'beard') { c.beginPath(); c.moveTo(14, 34); c.quadraticCurveTo(20, 118, 64, 122); c.quadraticCurveTo(108, 118, 114, 34); c.quadraticCurveTo(100, 72, 64, 80); c.quadraticCurveTo(28, 72, 14, 34); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.ellipse(64, 66, 22, 12, 0, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'source-over'; }
    }
    c.restore();
  }));
  return canvas;
}
function getAtlas() {
  if (!atlas) { atlas = new THREE.CanvasTexture(drawFaceAtlas(document.createElement('canvas'))); atlas.colorSpace = THREE.SRGBColorSpace; atlas.__shared = true; }
  return atlas;
}
// head: parent object; the decals wrap an ellipsoid of radii rx/ry/rz centred centerY above it. scale sizes the ink.
export function createFaceParts(head, avatar, { centerY = .23, rx = .275, ry = .295, rz = .255, scale = 1 } = {}) {
  const group = new THREE.Group(); group.name = 'face_decals'; head.add(group);
  const dimensions = { eyes: [.36, .20, .045], brows: [.38, .12, .115], nose: [.13, .12, -.017], mouth: [.24, .15, -.105], glasses: [.41, .19, .045], facialHair: [.36, .30, -.11], iris: [.36, .20, .045] };
  const parts = {};
  ROWS.forEach((part, row) => {
    const [w0, h0, y0] = dimensions[part], w = w0 * scale, h = h0 * scale, y = y0 * scale;
    const geometry = new THREE.PlaneGeometry(w, h, 12, 8);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) { const x = position.getX(i), py = position.getY(i) + y; position.setZ(i, Math.sqrt(Math.max(.01, 1 - (x / rx) ** 2 - (py / ry) ** 2)) * rz + .003 * scale + row * .0005); }
    geometry.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ map: getAtlas(), transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = 'face_' + part; mesh.rotation.y = Math.PI; mesh.position.set(0, centerY + y, 0); mesh.renderOrder = 5 + row; group.add(mesh); parts[part] = mesh;
  });
  const setFace = value => ROWS.forEach((part, row) => {
    let id = part === 'iris' ? (value.eyes || FACE_DEFAULTS.eyes) : value[part] || (part === 'glasses' && value.shades ? 'sport' : FACE_DEFAULTS[part]);
    const options = part === 'iris' ? FACE_OPTIONS.eyes : FACE_OPTIONS[part];
    const col = Math.max(0, options.indexOf(id)); const uv = parts[part].geometry.attributes.uv;
    const u0 = (col * TILE + 1) / ATLAS_W, u1 = ((col + 1) * TILE - 1) / ATLAS_W, v0 = 1 - ((row + 1) * TILE - 1) / ATLAS_H, v1 = 1 - (row * TILE + 1) / ATLAS_H;
    const compressed = parts[part].material.map.isCompressedTexture;
    for (let i = 0; i < uv.count; i++) { const x = i % 13, yy = Math.floor(i / 13), v = v1 - (v1 - v0) * yy / 8; uv.setXY(i, u0 + (u1 - u0) * x / 12, compressed ? 1 - v : v); } uv.needsUpdate = true;
    if (part === 'iris') parts[part].material.color.set(value.eyeColor || FACE_DEFAULTS.eyeColor);
    if (part === 'facialHair') parts[part].material.color.set(value.hairColor || '#3b2a1c');
    parts[part].visible = part === 'iris' ? id !== 'happy' : !(['glasses', 'facialHair'].includes(part) && id === 'none');
  });
  setFace(avatar);
  return { group, parts, setFace, dispose() { for (const mesh of Object.values(parts)) { mesh.geometry.dispose(); mesh.material.dispose(); } group.removeFromParent(); } };
}
