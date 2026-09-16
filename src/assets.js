// Optional generated assets. Drop files under assets/ and list them in assets/manifest.json
// (see docs/codex-asset-prompts.md for the exact names and prompts). Anything missing falls back to
// the procedural version, so the game always runs with an empty assets folder.
import * as THREE from 'three';

let manifest = null;
const cache = {};
export async function loadManifest() {
  try { manifest = await fetch('assets/manifest.json').then(r => r.ok ? r.json() : null); } catch { manifest = null; }
  return manifest;
}
export const asset = (group, name) => manifest?.[group]?.[name] ? 'assets/' + manifest[group][name] : null;
// Photo tile neutralised toward white so it contributes grain while vertex colours keep the palette.
// Starts as a 4x4 white canvas and repaints when the image lands, so materials build synchronously.
export function washedTexture(name, { wash = .58, repeat = null } = {}) {
  const url = asset('textures', name); if (!url) return null;
  const key = url + '#wash' + wash; if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  const img = new Image(); img.onload = () => { c.width = img.width; c.height = img.height; g.drawImage(img, 0, 0); g.globalAlpha = wash; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; t.needsUpdate = true; };
  img.src = url; t.__shared = true; return (cache[key] = t);
}
// Texture from the manifest or null. srgb=false for normal/roughness maps.
export function texture(name, { repeat = null, srgb = true } = {}) {
  const url = asset('textures', name); if (!url) return null;
  if (cache[url]) return cache[url];
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.__shared = true; return (cache[url] = t);
}
