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
// Texture from the manifest or null. srgb=false for normal/roughness maps.
export function texture(name, { repeat = null, srgb = true } = {}) {
  const url = asset('textures', name); if (!url) return null;
  if (cache[url]) return cache[url];
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.__shared = true; return (cache[url] = t);
}
