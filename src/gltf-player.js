// Blender-authored athlete (tools/build-golfer-v2.py) driven by the shared clip set. The rig node carries
// extras (hand socket, head ellipsoid) so face decals and the disc grip follow whatever body Blender exported.
import * as THREE from 'three';
import { cloneModel } from './models.js';
import { createFaceParts } from './face-parts.js';
import { characterRamp } from './character-material.js';
import { paintDetail, jerseyStyle } from './materials.js';

const HEIGHT = { short: .94, average: 1, tall: 1.06 };
const _v = new THREE.Vector3();

export function createGLTFCharacter(avatar) {
  const src = cloneModel(avatar.lod ? 'golfer_lod' : 'golfer'); if (!src) return null;
  const group = new THREE.Group(), actor = src.scene; group.add(actor);
  const joints = {}, owned = new Set();
  const colors = { skin: avatar.skin, hair: avatar.hairColor, jersey: avatar.jersey, trim: avatar.accent, shorts: avatar.shorts, shoes: avatar.shoes, headwear: avatar.headwearColor, socks: avatar.socks || avatar.accent, laces: avatar.accent };
  const spec = actor.getObjectByName('ChainsRig')?.userData || {};   // athlete v2 extras; absent on the round-two Mii export
  actor.traverse(o => {
    if (o.isBone) joints[o.name] = o;
    if (o.name.startsWith('hair_')) o.visible = o.name === 'hair_' + avatar.hair;
    if (o.name.startsWith('headwear_')) o.visible = o.name === 'headwear_' + avatar.headwear;
    if (o.name.startsWith('accessory_wristband')) o.visible = avatar.wristband === 'both' || avatar.wristband === (o.name.endsWith('R') ? 'right' : 'left');
    if (o.name === 'shades') o.visible = false;   // glasses are face decals
    if (!o.isMesh) return;
    const tint = m => {
      const n = new THREE.MeshToonMaterial({ color: m.color, gradientMap: characterRamp }); owned.add(n);
      const key = m.name.replace(/\.\d+$/, ''); if (colors[key]) n.color.set(colors[key]);
      n.__shared = false;
      if (key === 'jersey') jerseyStyle(n, avatar.jerseyStyle, avatar.accent, 1);
      return ['skin', 'jersey'].includes(key) ? paintDetail(n, key) : n;
    };
    o.material = Array.isArray(o.material) ? o.material.map(tint) : tint(o.material);
    o.receiveShadow = false;
    o.frustumCulled = false;
  });
  if (!joints.elR || !joints.root) return null;
  actor.updateMatrixWorld(true);
  const headC = spec.headCentre || null, headR = spec.headRadii || null;
  const faceOpts = headC ? { centerY: headC[1] - joints.head.getWorldPosition(_v).y, rx: headR[0], ry: headR[1], rz: headR[2], scale: headR[1] / .295 } : {};
  const face = createFaceParts(joints.head, avatar, faceOpts);
  // chest and back prints: club mark and number, sized from the jersey rings
  const printCanvas = document.createElement('canvas'); printCanvas.width = 256; printCanvas.height = 256;
  const ink = printCanvas.getContext('2d'); ink.fillStyle = avatar.accent; ink.textAlign = 'center';
  ink.font = 'bold 30px system-ui'; ink.fillText('CHAINS', 128, 60);
  ink.font = 'bold 116px system-ui'; ink.fillText(String(avatar.number), 128, 184);
  const print = new THREE.CanvasTexture(printCanvas); print.colorSpace = THREE.SRGBColorSpace;
  const printGeo = new THREE.PlaneGeometry(.22, .22);
  const printMat = new THREE.MeshBasicMaterial({ map: print, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); owned.add(printMat);
  const chestY = headC ? 1.30 - joints.spine.getWorldPosition(_v).y : .20, chestZ = headC ? [.148, .138] : [.155, .155];
  for (const side of [-1, 1]) { const badge = new THREE.Mesh(printGeo, printMat); badge.position.set(0, chestY, side * (side < 0 ? chestZ[0] : chestZ[1])); badge.rotation.y = side < 0 ? Math.PI : 0; badge.rotation.x = side < 0 ? -.08 : .08; joints.spine.add(badge); }
  const hand = new THREE.Group(); hand.name = 'disc_socket'; hand.position.set(...(spec.handOffset || [0, -.205, 0]));
  const lefty = avatar.hand === 'left'; joints[lefty ? 'elL' : 'elR'].add(hand);
  const build = { slim: .93, athletic: 1, broad: 1.1 }[avatar.build] || 1, tall = HEIGHT[avatar.height] || 1;
  actor.scale.set(build * tall, tall, tall);
  const handed = name => lefty && actions.has(name + '_left') ? name + '_left' : name;
  const mixer = new THREE.AnimationMixer(actor);
  const actions = new Map(src.animations.map(c => [c.name, mixer.clipAction(c)]));
  let phase = null, throwType = handed('backhand'), active = null, time = Math.random() * 8, mood = null, previous = null, blend = 1, frameDt = 0, locomotion = null;
  function sample(name, at) {
    const action = actions.get(name); if (!action) return;
    if (active !== action) { previous?.stop(); previous = active; active = action; blend = phase === null ? 0 : 1; action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
    blend = Math.min(1, blend + frameDt / .22); active.setEffectiveWeight(blend); previous?.setEffectiveWeight(1 - blend); if (blend === 1) { previous?.stop(); previous = null; }
    action.paused = true; action.time = THREE.MathUtils.clamp(at, 0, action.getClip().duration - .00001); mixer.update(0);
  }
  const api = {
    group, hand, elbow: joints[lefty ? 'elL' : 'elR'], joints, avatar, source: 'glb', headY: (headC ? headC[1] : 1.39) * tall, clips: [...actions.keys()], faceParts: face.parts, setFace: face.setFace,
    setThrow(t) { throwType = actions.has(handed(t)) ? handed(t) : handed('backhand'); }, setPhase(p) { phase = p; if (p !== null) mood = null; }, getPhase() { return phase; },
    react(kind) { mood = { name: handed(kind), t: 0 }; phase = null; },
    play(name) { if (actions.has(name)) { locomotion = name; phase = null; mood = null; time = 0; } },
    update(dt) {
      frameDt = dt; time += dt;
      if (phase !== null) { const a = actions.get(throwType); sample(throwType, phase * (a?.getClip().duration || 1)); }
      else if (mood) { mood.t += dt; sample(mood.name, mood.t); if (mood.t >= (actions.get(mood.name)?.getClip().duration || 2.4)) mood = null; }
      else { const name = handed(locomotion || (Math.floor(time / 8) % 3 === 2 ? 'practice' : 'idle')); sample(name, time % (actions.get(name)?.getClip().duration || 4)); }
      actor.updateMatrixWorld(true);
    },
    faceDir(dx, dz) { group.rotation.y = Math.atan2(-dx, -dz); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(actor); face.dispose(); print.dispose(); printGeo.dispose(); for (const m of owned) m.dispose(); actor.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); }
  };
  api.update(0); return api;
}
