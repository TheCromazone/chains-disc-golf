// Blender-authored athletes (tools/build-golfer-v3.py) driven by the shared clip set. The rig node carries
// extras (hand socket, head ellipsoid, eye and chest lines, region luminance, leg scale) so the disc grip,
// prints and recolouring follow whatever body Blender exported. The male and female bodies share the rig,
// the clips and every hair, headwear and glasses variant.
import * as THREE from 'three';
import { cloneModel } from './models.js';
import { rimLight } from './materials.js';
import { bodyMaterial } from './body-material.js';
import { JOINTS, RIGS, readyPose, heroPose, mirrorPose, poseAt, keysFor, soleHeights, STANCE_FADE, stanceFade } from './throw-poses.js';

const HEIGHT = { short: .94, average: 1, tall: 1.06 };
const SLOT = { hair: { roughness: .7, rim: .22 }, headwear: { roughness: .8 }, trim: { roughness: .78 }, frame: { roughness: .42, color: '#1a1c22' }, lens: { roughness: .15, color: '#14171c', metalness: .3, opacity: .86 } };
const DOME_HATS = new Set(['cap', 'backcap', 'beanie', 'bucket']), BIG_HAIR = new Set(['curly', 'wavy', 'sidepart', 'afro', 'mohawk']);   // volume no hat could sit over; 'short' is the scan's own hair, no mesh
const _v = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _gi = new THREE.Quaternion(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
const FLIP = new THREE.Quaternion(0, 1, 0, 0), UP = new THREE.Vector3(0, 1, 0);   // FLIP: half turn about the forearm, puts the carried disc's face on the knuckle side, where a lens in front sees it
const glassesOf = a => a.glasses && a.glasses !== 'none' ? a.glasses : a.shades ? 'sport' : 'none';

export function createGLTFCharacter(avatar) {
  const female = avatar.figure === 'female';
  const src = cloneModel((female ? 'golfer_f' : 'golfer') + (avatar.lod ? '_lod' : '')); if (!src) return null;
  const group = new THREE.Group(), actor = src.scene; group.add(actor);
  const joints = {}, owned = new Set(), glasses = [];
  const colors = { hair: avatar.hairColor, headwear: avatar.headwearColor, trim: avatar.accent };
  const spec = actor.getObjectByName('ChainsRig')?.userData || {};
  let body = null;
  actor.traverse(o => {
    if (o.isBone) joints[o.name] = o;
    if (o.name.startsWith('hair_')) o.visible = o.name === 'hair_' + avatar.hair && !(DOME_HATS.has(avatar.headwear) && BIG_HAIR.has(avatar.hair));
    if (o.name.startsWith('headwear_')) o.visible = o.name === 'headwear_' + avatar.headwear;
    if (o.name.startsWith('glasses_')) { glasses.push(o); o.visible = o.name === 'glasses_' + glassesOf(avatar); }
    if (o.name.startsWith('accessory_wristband')) o.visible = avatar.wristband === 'both' || avatar.wristband === (o.name.endsWith('R') ? 'right' : 'left');
    if (!o.isMesh) return;
    const key = [].concat(o.material)[0].name.replace(/\.\d+$/, '');
    if (key === 'body') { body = bodyMaterial(spec, avatar, o.geometry.index.count < 27000, female ? 'body_f_' : 'body_'); o.material = body.material; }
    else { const slot = SLOT[key] || { roughness: .8 }; o.material = new THREE.MeshStandardMaterial({ color: colors[key] || slot.color || '#ffffff', roughness: slot.roughness, metalness: slot.metalness || 0, transparent: slot.opacity < 1, opacity: slot.opacity ?? 1 }); if (slot.rim) rimLight(o.material, { strength: slot.rim }); }
    owned.add(o.material); o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
  });
  if (!joints.elR || !joints.root || !body) return null;
  actor.updateMatrixWorld(true);
  const headC = spec.headCentre;
  // chest and back prints: club mark and number, placed on the measured torso
  const printCanvas = document.createElement('canvas'); printCanvas.width = 256; printCanvas.height = 256;
  const ink = printCanvas.getContext('2d'); ink.fillStyle = avatar.accent; ink.textAlign = 'center';
  ink.font = 'bold 30px system-ui'; ink.fillText('CHAINS', 128, 60);
  ink.font = 'bold 116px system-ui'; ink.fillText(String(avatar.number), 128, 184);
  const print = new THREE.CanvasTexture(printCanvas); print.colorSpace = THREE.SRGBColorSpace;
  const printGeo = new THREE.PlaneGeometry(.2, .2);
  const printMat = new THREE.MeshBasicMaterial({ map: print, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }); owned.add(printMat);
  const chestY = (spec.chestY || 1.30) - joints.spine.getWorldPosition(_v).y, chestZ = spec.chestZ || [.13, .13];
  for (const side of [-1, 1]) { const badge = new THREE.Mesh(printGeo, printMat); badge.position.set(0, chestY, side * ((side < 0 ? chestZ[0] : chestZ[1]) + .004)); badge.rotation.y = side < 0 ? Math.PI : 0; badge.rotation.x = side < 0 ? -.1 : .1; joints.spine.add(badge); }
  // Disc socket: a roll-free wrist frame under the group rather than a child of the forearm bone. The clips roll the arm
  // through the pull (palm up at the reach-back, palm down at release), so a bone-mounted disc wobbles and ends up on the
  // open palm; this frame takes the forearm's heading and pitch only, so the plate stays level from the coiled stance to
  // release while the grip offset still follows the arm. Its -Y is the forearm (wrist to fingertips).
  const lefty = avatar.hand === 'left', forearm = joints[lefty ? 'elL' : 'elR'], handOffset = new THREE.Vector3(...(spec.handOffset || [0, -.25, 0]));
  const hand = new THREE.Group(); hand.name = 'disc_socket'; group.add(hand);
  let heading = 0;
  function placeSocket() {   // returns the forearm direction in group space
    _gi.copy(group.quaternion).invert();
    forearm.localToWorld(_v.copy(handOffset)); forearm.getWorldPosition(_e);
    _f.copy(_v).sub(_e).applyQuaternion(_gi).normalize();
    hand.position.copy(group.worldToLocal(_v));
    const pitch = Math.acos(THREE.MathUtils.clamp(-_f.y, -1, 1));
    if (Math.sin(pitch) > .05) heading = Math.atan2(-_f.x, -_f.z);   // a vertical forearm keeps the last heading
    hand.quaternion.setFromEuler(_eu.set(pitch, heading, 0, 'YXZ')).multiply(FLIP);
    hand.updateMatrixWorld(true);
    return _f;
  }
  const build = { slim: .95, athletic: 1, broad: 1.07 }[avatar.build] || 1, tall = HEIGHT[avatar.height] || 1;
  actor.scale.set(build * tall, tall, tall);
  // the clips were authored for the male rig's legs; a shorter rig scales their hip drops so the soles still meet the ground
  const legScale = spec.legScale || 1, rootRestY = joints.root.position.y;
  const handed = name => lefty && actions.has(name + '_left') ? name + '_left' : name;
  const mixer = new THREE.AnimationMixer(actor);
  const actions = new Map(src.animations.map(c => [c.name, mixer.clipAction(c)]));
  let phase = null, throwType = handed('backhand'), active = null, time = Math.random() * 8, mood = null, previous = null, blend = 1, frameDt = 0, locomotion = null;
  // Aim stance. main.js steers faceDir every frame for the player lining up a throw and for the menu hero; only the player
  // also grips the disc for a throw (holdDisc asks releaseFrame for the selected type), so two steered frames plus a grip
  // request mean "aiming" and the coiled stance blends over the idle clip, following the throw picker through aimType.
  // The hero and bystanders get the cover-shot pose instead. ponytail: inferred rather than a setStance() call because
  // main.js is shared; add the call if a second consumer needs the state.
  let aimHit = false, aimFrames = 0, gripHit = false, grips = 0, readyW = 0, heroW = 0, aimType = 'backhand';
  function settle() { if (legScale !== 1) joints.root.position.y = rootRestY + (joints.root.position.y - rootRestY) * legScale; group.updateMatrixWorld(true); }
  function blendTo(pose, w, base = null) {   // slerp the bones toward a shared-contract pose: over the mixer output, or over the windup pose the clip was baked from
    // (the mixer skips bones whose value did not change, so a held windup phase is rebuilt from the shared keys instead of read back)
    for (const j of JOINTS) {
      const b = joints[j]; if (!b) continue;
      if (base) b.quaternion.setFromEuler(_eu.set(base[j][0], base[j][1], base[j][2], 'XYZ'));
      b.quaternion.slerp(_q.setFromEuler(_eu.set(pose[j][0], pose[j][1], pose[j][2], 'XYZ')), w);
    }
    const baseY = base ? -Math.min(...soleHeights(base, false, RIGS.glb)) : (joints.root.position.y - rootRestY) / legScale;
    joints.root.position.y = rootRestY + (baseY + (pose.rootY - baseY) * w) * legScale; group.updateMatrixWorld(true);
  }
  function overlay() {
    const cw = coilW();
    if (cw > 0) {
      let pose = readyPose(aimType, time, RIGS.glb), base = phase === null ? null : poseAt(keysFor(throwType.replace(/_left$/, '')), phase);
      if (lefty) { pose = mirrorPose(pose); if (base) base = mirrorPose(base); }
      blendTo(pose, cw, base);
    }
    if (heroW > 0) { let pose = heroPose(time, RIGS.glb); if (lefty) pose = mirrorPose(pose); blendTo(pose, heroW); }
    // Backhand grip roll. The scan's palms face forward, so a bent elbow turns the palm up and the disc would sit on it like a
    // tray; rolling the forearm a quarter turn in the stance puts the palm against the rim with the thumb on top. The clip's
    // release hand is already thumb-up with the palm trailing, so the roll unwinds through the pull. Cosmetic: the socket ignores roll.
    const family = phase === null ? aimType : throwType, k = phase === null ? cw : phase < .45 ? 1 : phase < .6 ? 1 - (phase - .45) / .15 : 0;
    if (k > 0 && family.startsWith('backhand')) { forearm.quaternion.multiply(_q.setFromAxisAngle(UP, (lefty ? -1 : 1) * k * Math.PI / 2)); group.updateMatrixWorld(true); }
    placeSocket();
  }
  function sample(name, at) {
    const action = actions.get(name); if (!action) return;
    if (active !== action) { previous?.stop(); previous = active; active = action; blend = phase === null ? 0 : 1; action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
    blend = Math.min(1, blend + frameDt / .22); active.setEffectiveWeight(blend); previous?.setEffectiveWeight(1 - blend); if (blend === 1) { previous?.stop(); previous = null; }
    action.paused = true; action.time = THREE.MathUtils.clamp(at, 0, action.getClip().duration - .00001); mixer.update(0);
  }
  const frames = new Map();
  // Socket frame at the release phase (.62) in the group's own space: the disc grip is derived from it so the disc rides the
  // wrist through the windup and is exactly level with the planned release at the moment it leaves. dir is the offset from
  // the socket to the disc centre in units of the 7.5 cm main.js scales it by, with its 1.5 cm drop pre-added: the backhand
  // family holds the rim in the palm with the plate level across the body (palm side of the wrist, thumb on top, fingers
  // curled under), everything else pinches the rim beyond the fingertips.
  function releaseFrame(t) {
    const name = actions.has(handed(t)) ? handed(t) : handed('backhand');
    if (phase === null) { aimType = t; gripHit = true; }
    if (frames.has(name)) return frames.get(name);
    const action = actions.get(name); if (!action) return null;
    const snap = [...actions.values()].map(a => ({ a, w: a.getEffectiveWeight(), time: a.time, running: a.isRunning() }));
    for (const s of snap) s.a.setEffectiveWeight(0);
    const wasRunning = action.isRunning(); if (!wasRunning) { action.reset().play(); action.paused = true; }
    action.setEffectiveWeight(1); action.time = .62 * action.getClip().duration; mixer.update(0); settle();
    const f = placeSocket(), q = hand.quaternion.clone(), side = lefty ? -1 : 1, L = Math.hypot(f.x, f.z) || 1;
    const dir = t.startsWith('backhand') ? new THREE.Vector3(f.z / L * side * .085, 0, -f.x / L * side * .085).addScaledVector(f, .02) : f.clone().multiplyScalar(.075);
    dir.y += .015; dir.divideScalar(.075);
    if (!wasRunning) action.stop();
    for (const s of snap) { s.a.setEffectiveWeight(s.w); s.a.time = s.time; }
    mixer.update(0); settle(); overlay();
    const frame = { qInv: q.invert(), dir }; frames.set(name, frame); return frame;
  }
  const coilW = () => phase === null ? readyW : readyW * stanceFade(phase);
  const api = {
    group, hand, elbow: forearm, joints, avatar, source: 'glb', releaseFrame, headY: (spec.eyeY || headC[1]) * tall, clips: [...actions.keys()], faceParts: {},
    setFace(value) { body.setPalette(value); const g = glassesOf(value); for (const o of glasses) o.visible = o.name === 'glasses_' + g; },
    setThrow(t) { throwType = actions.has(handed(t)) ? handed(t) : handed('backhand'); }, setPhase(p) { phase = p; if (p !== null) mood = null; },
    getPhase() { return phase ?? (aimFrames >= 2 ? 0 : null); },   // steered toward a target counts as windup start so the disc is gripped, not carried
    get heroWeight() { return heroW; },   // how far into the cover-shot pose: holdDisc spins the disc on the raised hand past half
    react(kind) { mood = { name: handed(kind), t: 0 }; phase = null; },
    play(name) { if (actions.has(name)) { locomotion = name; phase = null; mood = null; time = 0; } },
    update(dt) {
      frameDt = dt; time += dt; aimFrames = aimHit ? aimFrames + 1 : 0; aimHit = false; grips = gripHit ? grips + 1 : 0; gripHit = false;
      const aiming = phase === null && !mood && !locomotion && aimFrames >= 2 && grips >= 1;
      let name = null;
      if (phase !== null) { const a = actions.get(throwType); sample(throwType, phase * (a?.getClip().duration || 1)); }
      else if (mood) { mood.t += dt; sample(mood.name, mood.t); if (mood.t >= (actions.get(mood.name)?.getClip().duration || 2.4)) mood = null; }
      else { name = handed(locomotion || 'idle'); sample(name, time % (actions.get(name)?.getClip().duration || 4)); }   // ponytail: no more practice-swing cycle; the cover-shot pose holds, play('practice') still works
      settle();
      readyW = aiming ? Math.min(1, readyW + dt / .22) : phase !== null && phase < STANCE_FADE ? readyW : Math.max(0, readyW - dt / .22);
      heroW = name?.startsWith('idle') && !locomotion && !aiming ? Math.min(1, heroW + dt / .35) : Math.max(0, heroW - dt / .35);
      overlay();
    },
    faceDir(dx, dz) { group.rotation.y = Math.atan2(-dx, -dz); aimHit = true; },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(actor); print.dispose(); printGeo.dispose(); for (const m of owned) m.dispose(); actor.traverse(o => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); }
  };
  api.update(0); return api;
}
