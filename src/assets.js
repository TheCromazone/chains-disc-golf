// Optional generated assets. Drop files under assets/ and list them in assets/manifest.json
// (see docs/codex-asset-prompts.md for the exact names and prompts). Anything missing falls back to
// the procedural version, so the game always runs with an empty assets folder.
import * as THREE from 'three';

let manifest = null;
const cache = {};
// A phone's cold first load drops the odd request (cellular, a tab still waking), and an asset that failed once stayed broken for
// the session: one lost body albedo drew the athlete's skin black, a lost grass map the turf blank, a lost clip fell back for good.
// Image and file loads (textures, GLBs, the Draco and Basis decoders) try twice more, after .8 s and 2.4 s; a missing file (4xx)
// does not. The loading manager keeps the item open over the wait, so the loading screen (main.js assetsIdle) still waits on it.
for (const Loader of [THREE.ImageLoader, THREE.FileLoader]) {
  const load = Loader.prototype.load;
  Loader.prototype.load = function (url, onLoad, onProgress, onError) {
    let tries = 0; const remote = typeof url === 'string' && !/^(data|blob):/.test(url), held = `${url}#retry`;
    const attempt = () => load.call(this, url, onLoad, onProgress, e => {
      if (!remote || tries >= 2) { onError?.(e); return; }
      this.manager.itemStart(held);
      // A file load's error carries its status. An image's says nothing (a 404 and a dropped request look the same, and every missing
      // image waited 3.2 s through two more tries), so one HEAD asks the server whether the file is there at all.
      Promise.resolve(e?.response ? e.response.status : e instanceof Event ? fetch(this.manager.resolveURL((this.path || '') + url), { method: 'HEAD', cache: 'no-store' }).then(r => r.status, () => 0) : 0)
        .then(s => { if (s >= 400 && s < 500) { onError?.(e); this.manager.itemEnd(held); } else setTimeout(() => { attempt(); this.manager.itemEnd(held); }, 800 * 3 ** tries++); });
    });
    return attempt();
  };
}
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
export function texture(name, { repeat = null, srgb = true, clamp = false, flipY = true } = {}) {
  const url = asset('textures', name); if (!url) return null;
  if (cache[url]) return cache[url];
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.anisotropy = 4; t.flipY = flipY;   // glTF UVs are not flipped
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.__shared = true; return (cache[url] = t);
}
