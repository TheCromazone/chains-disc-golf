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
export async function loadModels(renderer, quality = 'full') {
  activeQuality = quality;
  // Props use the clean procedural art. Only the actor is downloaded, by quality: phones get the athlete LOD.
  const bodyName = quality === 'full' || quality === 'high' ? 'golfer' : 'golfer_lod';
  const baseClips = ['idle','practice','backhand','backhand_io','backhand_oi','forehand','forehand_io','forehand_oi','tomahawk','scoober','hammer','blade','putt','celebrate','slump','walk'];
  const clipNames = [...baseClips,...baseClips.map(n=>n+'_left')];
  const names = [...new Set([bodyName, 'golfer_lod']), 'disc', ...clipNames.map(n=>'golfer_'+n)];
  if (!names.some(n => asset('models', n))) return;
  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  draco.setWorkerLimit(2);
  const ktx = new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/').detectSupport(renderer);
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
  const actor = models.get(bodyName);
  if (actor) {
    actor.animations = clipNames.flatMap(n=>models.get('golfer_'+n)?.animations || []);
    if (models.get('golfer_lod')) models.get('golfer_lod').animations = actor.animations;
    models.set('golfer', actor); modelStatus.golfer = 'ready';
  }
  draco.dispose(); ktx.dispose();
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
