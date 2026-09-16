// Blender-authored athlete (tools/build-golfer-v3.py) driven by the shared clip set. The rig node carries
// extras (hand socket, head ellipsoid, eye line, region luminance) so the disc grip, glasses and recolouring
// follow whatever body Blender exported.
import * as THREE from 'three';
import { cloneModel } from './models.js';
import { createFaceParts } from './face-parts.js';
import { rimLight } from './materials.js';
import { bodyMaterial } from './body-material.js';

const HEIGHT = { short: .94, average: 1, tall: 1.06 };
const SLOT = { hair: { roughness: .7, rim: .22 }, headwear: { roughness: .8 }, trim: { roughness: .78 } };
const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _gi = new THREE.Quaternion();

export function createGLTFCharacter(avatar) {
  const src = cloneModel(avatar.lod ? 'golfer_lod' : 'golfer'); if (!src) return null;
  const group = new THREE.Group(), actor = src.scene; group.add(actor);
  const joints = {}, owned = new Set();
  const colors = { hair: avatar.hairColor, headwear: avatar.headwearColor, trim: avatar.accent };
  const spec = actor.getObjectByName('ChainsRig')?.userData || {};
  let body = null;
  actor.traverse(o => {
    if (o.isBone) joints[o.name] = o;
    if (o.name.startsWith('hair_')) o.visible = o.name === 'hair_' + avatar.hair;
    if (o.name.startsWith('headwear_')) o.visible = o.name === 'headwear_' + avatar.headwear;
    if (o.name.startsWith('accessory_wristband')) o.visible = avatar.wristband === 'both' || avatar.wristband === (o.name.endsWith('R') ? 'right' : 'left');
    if (!o.isMesh) return;
    const key = [].concat(o.material)[0].name.replace(/\.\d+$/, '');
    if (key === 'body') { body = bodyMaterial(spec, avatar, o.geometry.index.count < 27000); o.material = body.material; }
    else { const slot = SLOT[key] || { roughness: .8 }; o.material = new THREE.MeshStandardMaterial({ color: colors[key] || '#ffffff', roughness: slot.roughness, metalness: 0 }); if (slot.rim) rimLight(o.material, { strength: slot.rim }); }
    owned.add(o.material); o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
  });
  if (!joints.elR || !joints.root || !body) return null;
  actor.updateMatrixWorld(true);
  const headC = spec.headCentre, headR = spec.headRadii, headY = joints.head.getWorldPosition(_v).y, headZ = joints.head.getWorldPosition(_v).z;
  // Glasses are the one decal left on a scanned face: wrapped on the skull so the lenses sit on the eye line.
  const scale = headR[1] / .295;
  const face = createFaceParts(joints.head, avatar, { only: ['glasses'], centerY: spec.eyeY - headY - .045 * scale, rx: headR[0], ry: headR[1], rz: headZ - spec.faceZ, scale });
  // chest and back prints: club mark and number, placed on the measured torso
  const printCanvas = document.createElement('canvas'); printCanvas.width = 256; printCanvas.height = 256;
  const ink = printCanvas.getContext('2d'); ink.fillStyle = avatar.accent; ink.textAlign = 'center';
  ink.font = 'bold 30px system-ui'; ink.fillText('CHAINS', 128, 60);
  ink.font = 'bold 116px system-ui'; ink.fillText(String(avatar.number), 128, 184);
  const print = new THREE.CanvasTexture(printCanvas); print.colorSpace = THREE.SRGBColorSpace;
  const printGeo = new THREE.PlaneGeometry(.2, .2);
  const printMat = new THREE.MeshBasicMaterial({ map: print, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); owned.add(printMat);
  const chestY = 1.30 - joints.spine.getWorldPosition(_v).y, chestZ = spec.chestZ || [.13, .13];
  for (const side of [-1, 1]) { const badge = new THREE.Mesh(printGeo, printMat); badge.position.set(0, chestY, side * ((side < 0 ? chestZ[0] : chestZ[1]) + .004)); badge.rotation.y = side < 0 ? Math.PI : 0; badge.rotation.x = side < 0 ? -.1 : .1; joints.spine.add(badge); }
  const hand = new THREE.Group(); hand.name = 'disc_socket'; hand.position.set(...(spec.handOffset || [0, -.25, 0]));
  const lefty = avatar.hand === 'left'; joints[lefty ? 'elL' : 'elR'].add(hand);
  const build = { slim: .95, athletic: 1, broad: 1.07 }[avatar.build] || 1, tall = HEIGHT[avatar.height] || 1;
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
  const frames = new Map();
  // Hand frame at the release phase (.62) in the group's own space: the disc grip is derived from it so the
  // disc rides the wrist through the windup and is exactly level with the planned release at the moment it leaves.
  function releaseFrame(t) {
    const name = actions.has(handed(t)) ? handed(t) : handed('backhand');
    if (frames.has(name)) return frames.get(name);
    const action = actions.get(name); if (!action) return null;
    const snap = [...actions.values()].map(a => ({ a, w: a.getEffectiveWeight(), time: a.time, running: a.isRunning() }));
    for (const s of snap) s.a.setEffectiveWeight(0);
    const wasRunning = action.isRunning(); if (!wasRunning) { action.reset().play(); action.paused = true; }
    action.setEffectiveWeight(1); action.time = .62 * action.getClip().duration; mixer.update(0); actor.updateMatrixWorld(true);
    _gi.copy(group.quaternion).invert();
    const q = hand.getWorldQuaternion(new THREE.Quaternion()).premultiply(_gi);
    const dir = hand.getWorldPosition(new THREE.Vector3()).sub(api.elbow.getWorldPosition(_e)).normalize().applyQuaternion(_gi);
    if (!wasRunning) action.stop();
    for (const s of snap) { s.a.setEffectiveWeight(s.w); s.a.time = s.time; }
    mixer.update(0); actor.updateMatrixWorld(true);
    const frame = { qInv: q.invert(), dir }; frames.set(name, frame); return frame;
  }
  const api = {
    group, hand, elbow: joints[lefty ? 'elL' : 'elR'], joints, avatar, source: 'glb', releaseFrame, headY: (spec.eyeY || headC[1]) * tall, clips: [...actions.keys()], faceParts: face.parts,
    setFace(value) { face.setFace(value); body.setPalette(value); },
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
