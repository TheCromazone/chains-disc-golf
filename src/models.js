// Optional cached GLBs. Model failures never prevent the procedural game from booting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { asset } from './assets.js';

const models = new Map();
let activeQuality = 'low';
export const modelStatus = {};
// Mobile: the full-detail bodies, fetched once the round can already start, for the athlete the camera is on (the player on
// the tee, the clubhouse). The low-detail bake's 1024 albedo stair-steps and shimmers across the jersey at the tee. Resolves
// true once they replaced the low-detail ones under the 'golfer' and 'golfer_f' names.
export let fullBodies = Promise.resolve(false);
export async function loadModels(renderer, quality = 'full') {
  activeQuality = quality;
  // Props use the clean procedural art. Only the actors are downloaded, by quality: phones get the athlete LODs.
  const full = quality === 'full' || quality === 'high';
  const bodies = full ? ['golfer', 'golfer_lod', 'golfer_f', 'golfer_f_lod'] : ['golfer_lod', 'golfer_f_lod'];
  const baseClips = ['idle','practice','backhand','backhand_io','backhand_oi','forehand','forehand_io','forehand_oi','tomahawk','scoober','hammer','blade','putt','xstep','fxstep','celebrate','slump','walk'];   // xstep/fxstep: the run-ups into a drive
  const clipNames = [...baseClips,...baseClips.map(n=>n+'_left')];
  const names = [...bodies, 'disc', 'pine', 'deciduous', 'bush', ...clipNames.map(n=>'golfer_'+n)];   // both tiers fetch the Blender trees (~230 KB): Lite draws the near ones in 3D too
  if (!names.some(n => asset('models', n))) return;
  // relative to the page, not the site root: Chains also runs one level down as Huck Yeah's disc golf (/discgolf/)
  const vendor = location.pathname.startsWith('/node_modules/') ? '/node_modules/three/examples/jsm/libs/' : new URL(document.querySelector('script[type="importmap"]') ? 'node_modules/three/examples/jsm/libs/' : 'vendor/', document.baseURI).pathname;
  const draco = new DRACOLoader().setDecoderPath(vendor.endsWith('libs/') ? vendor + 'draco/gltf/' : vendor + 'draco/');
  draco.setWorkerLimit(2);
  const ktx = new KTX2Loader().setTranscoderPath(vendor + 'basis/').detectSupport(renderer);
  ktx.setWorkerLimit(2);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx);
  await Promise.all(names.map(async name => {
    const url = asset('models', name); if (!url) return;
    try {
      const gltf = await loader.loadAsync(url);
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.geometry.__shared = true; for (const m of [].concat(o.material)) { m.__shared = true; for (const v of Object.values(m)) if (v?.isTexture) v.__shared = true; } } });
      models.set(name, gltf); modelStatus[name] = 'ready';
    } catch { modelStatus[name] = 'procedural fallback'; }
  }));
  // Fitted headwear (tools/build-headwear.py) follows in the background: hats are cosmetic, so they never hold up the
  // first frame; athletes built before it lands keep the procedural hats.
  const hats = asset('models', 'headwear') && !models.has('headwear') ? loader.loadAsync(asset('models', 'headwear'))
    .then(g => { g.scene.updateMatrixWorld(true); models.set('headwear', g); modelStatus.headwear = 'ready'; }, () => { modelStatus.headwear = 'procedural fallback'; }) : null;
  const clips = clipNames.flatMap(n=>models.get('golfer_'+n)?.animations || []);
  for (const [body, lod] of [['golfer', 'golfer_lod'], ['golfer_f', 'golfer_f_lod']]) {   // both figures share the rig and the clip set
    const actor = models.get(full ? body : lod) || models.get(lod); if (!actor) continue;
    actor.animations = clips; if (models.get(lod)) models.get(lod).animations = clips;
    models.set(body, actor); modelStatus[body] = 'ready';
  }
  if (!full) fullBodies = Promise.all(['golfer', 'golfer_f'].map(async body => {
    const url = asset('models', body); if (!url) return false;
    try {
      const gltf = await loader.loadAsync(url);
      gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.geometry.__shared = true; for (const m of [].concat(o.material)) { m.__shared = true; for (const v of Object.values(m)) if (v?.isTexture) v.__shared = true; } } });
      if (activeQuality !== quality) return false;   // switched tiers meanwhile
      gltf.animations = clips; models.set(body, gltf); modelStatus[body] = 'ready'; return true;
    } catch { return false; }
  })).then(r => r.some(Boolean));
  Promise.all([hats, fullBodies]).finally(() => { draco.dispose(); ktx.dispose(); });
}
export const model = name => models.get(name);
export function cloneModel(name) {
  const src = models.get(name); if (!src) return null;
  return { scene: clone(src.scene), animations: src.animations };
}
// Extract model geometry in world coordinates for efficient static instancing.
export function modelParts(name) {
  const src = models.get(name); if (!src) return null;
  src.scene.updateMatrixWorld(true);
  const parts = [];
  src.scene.traverse(o => { if (o.isMesh) { const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld); parts.push({ geometry, material: o.material }); } });
  return parts;
}
export function addModel(parent, name) {
  const src = cloneModel(name); if (!src) return null;
  parent.add(src.scene); return src.scene;
}
