// Set dressing that makes the course read as a cared-for tournament venue: timber-framed turf tee mats set in edged
// gravel beds, printed tee signs with the hole map, galvanised baskets with drooping chains, a branded band and a number
// flag, benches, bins, feather flags, and on hole 1 an event arch over the fairway, a roped gallery chute with event
// signs on legs, the course crew's UTV, a registration canopy and white canopies in the haze beyond. Every static prop
// merges into a handful of meshes: 'print' (every painted, printed or wooden surface, one canvas atlas, vertex tint for
// solid colours), 'steel' (bare metal, vertex tint), 'arch' (the arch's printed skin on the same atlas, single-sided so a
// chase camera flying through its beam sees through it rather than a screen of navy), 'paint' (the UTV's clear coat,
// Full only), the gravel beds and the soft contact shade under the props' feet. Six draws plus four shadow draws (two on
// Lite) however many props stand, all weathered by one shader chunk (GRIME). Only the arch is in play (its legs and beam
// go to the flight model as capsules); every other prop keeps out of the flight corridor (the tree-free half-width in
// front of each tee) and off the putt line, and the basket's visual parts keep physics' heights (tray .55-.72 m, chains
// .72-1.34, band 1.34-1.46).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, windTime, windVec } from './materials.js';
import { texture } from './assets.js';

const FONT = '"Barlow Condensed", "Arial Narrow", Impact, sans-serif';
const NAVY = '#16233d', GOLD = '#f2c318', PARK = '#173a2b';
// The crushed-stone bed round every tee mat, tee-local: u right of the play line, f toward the basket (the mat spans
// f -1.72..3.52 with its frame). course.js's `pads` are its four 1.6 x 3.2 m rectangles: keep the two in step.
export const BED = { u: 1.6, f0: -2.2, f1: 4.2 };
const rngOf = seed => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) >>> 0, s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0, (s ^ (s >>> 16)) >>> 0) / 4294967296); };

// ---------- atlas ----------
// Painted at 2048 on Full and at half scale on Lite (same layout, so the UVs are shared). [x, y, w, h] in 2048 space.
const REGION = { mat: [8, 8, 512, 1600], wood: [8, 1624, 512, 128], white: [8, 1768, 16, 16], concrete: [40, 1768, 64, 64] };
for (let i = 0; i < 9; i++) REGION['sign' + i] = [536 + (i % 3) * 496, 8 + Math.floor(i / 3) * 346, 480, 330];
for (let i = 0; i < 3; i++) REGION['feather' + i] = [536 + i * 176, 1048, 160, 640];
REGION.bag = [536, 1704, 256, 320]; REGION.band = [1072, 1048, 960, 76]; REGION.valance = [1072, 1352, 960, 96]; REGION.archBeam = [1072, 1464, 960, 104]; REGION.archLeg0 = [1072, 1600, 120, 440]; REGION.archLeg1 = [1208, 1600, 120, 440]; REGION.archSide = [1344, 1600, 56, 440];
for (let i = 0; i < 9; i++) REGION['flag' + i] = [1072 + (i % 6) * 144, 1140 + Math.floor(i / 6) * 104, 128, 88];
for (let i = 0; i < 4; i++) REGION['board' + i] = [1416 + (i % 2) * 312, 1600 + Math.floor(i / 2) * 120, 296, 84];
REGION.utvDecal = [1416, 1816, 400, 100];
const uvRect = name => { const [x, y, w, h] = REGION[name]; return [x / 2048, 1 - (y + h) / 2048, (x + w) / 2048, 1 - y / 2048]; };   // CanvasTexture flips Y

// Per-pixel painters shade a scratch canvas at the atlas's own scale (Lite evaluates a quarter of the texels) in
// region coordinates; callers draw it back at the region size.
let PX = 1;
function pixels(w, h, shade) {
  const W = Math.round(w * PX), H = Math.round(h * PX), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4, [r, gg, b] = shade(x / PX, y / PX); img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
}
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const vnoise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return (hash2(xi, yi, s) * (1 - a) + hash2(xi + 1, yi, s) * a) * (1 - b) + (hash2(xi, yi + 1, s) * (1 - a) + hash2(xi + 1, yi + 1, s) * a) * b; };
const sm = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Artificial-turf tee mat, the whole 1.6 x 5 m mat (top of the region = the throwing end): tufted pile in rows,
// fibre-scale grain, a flattened bleached plant zone and run-up, earth tracked in from the worn ground at the walk-in
// end, and the pile shadowed where it meets the timber.
function paintMat(g, w, h) {
  const c = pixels(w, h, (x, y) => {
    const fine = hash2(x, y, 3), streak = vnoise(x * .9, y * .22, 5), broad = vnoise(x / 60, y / 60, 7) * .6 + vnoise(x / 17, y / 17, 8) * .4;
    let k = .62 + fine * .3 + streak * .22 + (x % 4 === 0 ? -.12 : 0) + (broad - .5) * .18;
    const plant = Math.exp(-(((x - w * .5) / (w * .3)) ** 2 + ((y - h * .19) / (h * .12)) ** 2)), run = Math.exp(-(((x - w * .5) / (w * .19)) ** 2)) * sm(.32, .55, y / h) * (1 - sm(.86, 1, y / h));
    const wear = Math.min(1, plant * .95 + run * .45) * (.65 + broad * .6);
    const edge = Math.min(x, w - 1 - x, y, h - 1 - y), rim = 1 - sm(0, 9, edge) * .28 - .72;
    let r = 68 * k, gg = 132 * k, b = 46 * k;   // sunlit tee turf samples yellow-green in the reference, not lawn blue-green
    r += (156 * k - r) * wear * .7; gg += (158 * k - gg) * wear * .55; b += (98 * k - b) * wear * .6;   // flattened pile shows the paler, yellowed backing
    const dirt = sm(.8, 1, y / h) * .5 + (1 - sm(0, 26, edge)) * .35, d = sm(.55, .9, vnoise(x / 9, y / 9, 11) + dirt * .6 - .3) * .8;
    r += (92 - r) * d; gg += (74 - gg) * d; b += (50 - b) * d;
    return [r * (1 + rim), gg * (1 + rim), b * (1 + rim)];
  });
  g.drawImage(c, 0, 0, w, h);
  const rnd = rngOf(17);
  g.lineCap = 'round'; for (let i = 0; i < 9; i++) {   // pivot scuffs where the plant foot turns through the throw
    const cx = w * (.38 + rnd() * .24), cy = h * (.13 + rnd() * .12), r = 12 + rnd() * 26, a = rnd() * 6.3;
    g.strokeStyle = `rgba(${rnd() < .5 ? '52,60,30' : '150,150,105'},.35)`; g.lineWidth = 2 + rnd() * 3; g.beginPath(); g.arc(cx, cy, r, a, a + .6 + rnd()); g.stroke();
  }
  for (let i = 0; i < 26; i++) {   // leaves and needles blown onto the mat, most near the edges
    const x = rnd() < .5 ? rnd() * w * .25 + (rnd() < .5 ? 0 : w * .75) : rnd() * w, y = rnd() * h, a = rnd() * Math.PI, l = 5 + rnd() * 9;
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = ['#8a5a2c', '#a8793e', '#6b4a26', '#5d6b2a'][i % 4];
    if (i % 3) { g.beginPath(); g.ellipse(0, 0, l, l * .45, 0, 0, 7); g.fill(); } else { g.fillRect(-l, -.6, l * 2, 1.2); }
    g.restore();
  }
}
// Weathered pressure-treated timber, grain along the length.
function paintWood(g, w, h) {
  g.drawImage(pixels(w, h, (x, y) => {
    const warp = vnoise(x / 70, y / 16, 21) * 9 + vnoise(x / 11, y / 5, 22) * 1.5, ring = Math.sin((y + warp) * .55) * .5 + .5, grain = Math.pow(ring, 5);
    const grey = vnoise(x / 40, y / 30, 23) * .5 + vnoise(x / 6, y / 2, 24) * .15, k = .8 + hash2(x, y, 25) * .12 + vnoise(x / 3, y * .9, 26) * .12 - grain * .28;
    const r = (118 + grey * 34) * k, gg = (92 + grey * 36) * k, b = (66 + grey * 38) * k;
    return [r, gg, b];
  }), 0, 0, w, h);
  const rnd = rngOf(29); g.strokeStyle = 'rgba(30,20,12,.55)';
  for (let i = 0; i < 14; i++) { const y = 6 + rnd() * (h - 12), x = rnd() * w, l = 30 + rnd() * 120; g.lineWidth = .8 + rnd(); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l * .3, y + rnd() * 3 - 1.5, x + l * .7, y + rnd() * 3 - 1.5, x + l, y + rnd() * 2 - 1); g.stroke(); }   // drying checks
  for (let i = 0; i < 5; i++) { const x = rnd() * w, y = 14 + rnd() * (h - 28); g.fillStyle = 'rgba(52,34,20,.8)'; g.beginPath(); g.ellipse(x, y, 5 + rnd() * 4, 3 + rnd() * 2, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(52,34,20,.35)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 11, 6, 0, 0, 7); g.stroke(); }
  for (let i = 0; i < 7; i++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 50, gr = g.createRadialGradient(x, y, 0, x, y, r);   // silvered, sun-greyed patches and damp stains
    gr.addColorStop(0, rnd() < .6 ? 'rgba(168,164,152,.38)' : 'rgba(38,30,22,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  g.strokeStyle = 'rgba(214,196,160,.5)'; for (let i = 0; i < 10; i++) { const x = rnd() * w, y = rnd() * h, l = 8 + rnd() * 26, a = (rnd() - .5) * .6; g.lineWidth = .6 + rnd() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }   // spike and shoe scuffs to fresh wood
}
const roundRect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };   // Safari < 16 has no roundRect
const fwdOf = h => { const dx = h.way[1][0] - h.tee[0], dz = h.way[1][1] - h.tee[1], L = Math.hypot(dx, dz); return [dx / L, dz / L]; };
function fitText(g, text, x, y, maxW, font, size) { g.font = `${font} ${size}px ${FONT}`; const m = g.measureText(text).width; if (m > maxW) g.font = `${font} ${Math.floor(size * maxW / m)}px ${FONT}`; g.fillText(text, x, y); }

// Tee sign: aluminium panel in park green. Header with the course and the event, the hole number in a white block,
// par and distance, and a map drawn from the real layout (fairway, trees, water, tee, basket), sponsor strip below.
function paintSign(g, w, h, hole, { name, trees, fairwayW, sponsor }) {
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#1d4533'); grd.addColorStop(1, '#122e22'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = '#0d2219'; g.fillRect(0, 0, w, 50); g.fillStyle = GOLD; g.fillRect(0, 50, w, 4);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, name.toUpperCase(), 16, 27, 250, 800, 32);
  g.textAlign = 'right'; g.fillStyle = GOLD; fitText(g, 'CHAINS OPEN 2026', w - 16, 27, 170, 700, 22);
  g.fillStyle = '#f4f1e8'; roundRect(g, 16, 68, 150, 146, 12); g.fill();
  g.fillStyle = PARK; g.textAlign = 'center'; g.font = `800 140px ${FONT}`; g.fillText(String(hole.idx + 1), 91, 146);
  g.fillStyle = '#ffffff'; g.font = `800 44px ${FONT}`; g.fillText(`PAR ${hole.par}`, 91, 244);
  g.font = `700 25px ${FONT}`; g.fillStyle = '#d7e4da'; g.fillText(`${Math.round(hole.len)} m · ${Math.round(hole.len * 3.281)} ft`, 91, 280);
  // map
  const mx = 182, my = 66, mw = w - mx - 14, mh = 232, [fx, fz] = fwdOf(hole), rx = -fz, rz = fx, s = Math.min(mw / 64, (mh - 26) / (hole.len + 14));
  const at = (x, z) => { const dx = x - hole.tee[0], dz = z - hole.tee[1]; return [mx + mw / 2 + (dx * rx + dz * rz) * s, my + mh - 14 - (dx * fx + dz * fz) * s]; };
  g.save(); roundRect(g, mx, my, mw, mh, 10); g.clip(); g.fillStyle = '#8fb46f'; g.fillRect(mx, my, mw, mh);
  g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#b9d494'; g.lineWidth = 2 * 9 * fairwayW * s; g.beginPath(); hole.way.forEach((p, i) => { const [a, b] = at(p[0], p[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
  g.strokeStyle = '#d6e7b6'; g.lineWidth = 2 * 3.2 * fairwayW * s; g.stroke();
  const [bx, by] = at(hole.basket[0], hole.basket[1]); g.fillStyle = '#dcebbd'; g.beginPath(); g.arc(bx, by, 6.5 * s + 3, 0, 7); g.fill();
  for (const p of hole.ponds) { const [a, b] = at(p.x, p.z); g.fillStyle = '#4b8fb8'; g.strokeStyle = '#d8ecf2'; g.lineWidth = 2; g.beginPath(); g.ellipse(a, b, p.rx * 1.2 * s, p.rz * 1.2 * s, Math.atan2(-fx, rx), 0, 7); g.fill(); g.stroke(); }
  for (const t of trees) { const [a, b] = at(t.x, t.z); if (a < mx - 12 || a > mx + mw + 12 || b < my - 12 || b > my + mh + 12) continue; const r = Math.max(2.6, t.fr * s * .8);
    g.fillStyle = '#2e5a2c'; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); g.fillStyle = '#467a3a'; g.beginPath(); g.arc(a - r * .3, b - r * .3, r * .55, 0, 7); g.fill(); }
  const [tx, ty] = at(hole.tee[0], hole.tee[1]); g.fillStyle = '#26312b'; roundRect(g, tx - 5, ty - 8, 10, 16, 2); g.fill();
  g.fillStyle = '#26312b'; g.beginPath(); g.arc(bx, by, 8, 0, 7); g.fill(); g.fillStyle = GOLD; g.beginPath(); g.arc(bx, by, 6, 0, 7); g.fill();
  g.fillStyle = '#26312b'; g.font = `800 20px ${FONT}`; g.textAlign = bx > mx + mw * .6 ? 'right' : 'left'; g.fillText(`${Math.round(hole.len)} m`, bx + (bx > mx + mw * .6 ? -13 : 13), by + 2);
  g.restore(); g.strokeStyle = '#f4f1e8'; g.lineWidth = 3; roundRect(g, mx, my, mw, mh, 10); g.stroke();
  g.fillStyle = '#0d2219'; g.fillRect(0, h - 26, w, 26); g.fillStyle = '#c9d6cc'; g.textAlign = 'center'; fitText(g, `HOLE SPONSOR  ·  ${sponsor}`, w / 2, h - 12, w - 30, 700, 17);
}
// Feather flags, text reading bottom to top like the real ones. 0: event, 1-2: invented sponsors.
function paintFeather(g, w, h, i, name) {
  const [bg, fg, accent, big, small] = [[NAVY, '#ffffff', GOLD, 'CHAINS OPEN', '2026 · ' + name.toUpperCase()], ['#f6f4ee', '#d4471b', '#1c2430', 'LOFTWING', 'DISCS · FLY FURTHER'], ['#1f5a3b', '#f3ead2', GOLD, 'BIRDIE BREW', 'COFFEE ROASTERS']][i];
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.fillRect(0, 0, 14, h);
  g.save(); g.translate(w * .56, h - 18); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillStyle = fg; fitText(g, big, 0, -14, h * .78, 800, 92); g.fillStyle = accent; fitText(g, small, 2, 44, h * .6, 700, 30); g.restore();
  if (i === 1) { g.fillStyle = fg; g.beginPath(); g.moveTo(w * .3, 60); g.quadraticCurveTo(w * .75, 20, w * .9, 70); g.quadraticCurveTo(w * .6, 55, w * .3, 60); g.fill(); }   // wing mark
  if (i === 2) { g.strokeStyle = fg; g.lineWidth = 6; g.beginPath(); g.arc(w * .58, 70, 34, 0, 7); g.stroke(); g.font = `800 34px ${FONT}`; g.fillStyle = fg; g.textAlign = 'center'; g.fillText('BB', w * .58, 72); }
  weather(g, w, h, 131 + i);
}
// A season outdoors on a printed face: the dye fades toward the top that takes the sun, rain leaves faint tide marks,
// and splashed dirt greys the bottom edge.
function weather(g, w, h, seed) {
  const rnd = rngOf(seed), fade = g.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(236,232,220,.16)'); fade.addColorStop(.6, 'rgba(236,232,220,.04)'); fade.addColorStop(.86, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(70,56,36,.3)');
  g.fillStyle = fade; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 5; k++) { const x = rnd() * w, y = rnd() * h, r = Math.min(w, h) * (.15 + rnd() * .3), gr = g.createRadialGradient(x, y, r * .7, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.8, 'rgba(60,50,35,.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
}
// Event signs on the gallery rope: the event, the two invented sponsors and the host club.
function paintBoard(g, w, h, i, name) {
  const [bg, fg, accent, big, small] = [[NAVY, '#ffffff', GOLD, 'CHAINS OPEN 2026', name.toUpperCase() + '  ·  DISC GOLF CHAMPIONSHIP'], ['#f6f4ee', '#d4471b', '#1c2430', 'LOFTWING', 'DISCS  ·  FLY FURTHER'], ['#1f5a3b', '#f3ead2', GOLD, 'BIRDIE BREW', 'COFFEE ROASTERS'], [PARK, '#ffffff', GOLD, name.toUpperCase(), 'DISC GOLF CLUB  ·  HOST']][i];
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.fillRect(0, h - 8, w, 8);
  g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = fg; fitText(g, big, w / 2, h * .4, w - 28, 800, Math.round(h * .58)); g.fillStyle = i === 1 ? '#1c2430' : accent; fitText(g, small, w / 2, h * .77, w - 44, 700, Math.round(h * .19));
  weather(g, w, h, 141 + i);
}
// Band: the yellow top band, branded three times around so every side reads.
function paintBand(g, w, h, name) {
  g.fillStyle = GOLD; g.fillRect(0, 0, w, h); g.fillStyle = NAVY; g.fillRect(0, 0, w, 5); g.fillRect(0, h - 5, w, 5);
  g.textBaseline = 'middle'; g.textAlign = 'center';
  for (let k = 0; k < 3; k++) { const cx = (k + .5) * w / 3; g.fillStyle = NAVY; g.font = `800 50px ${FONT}`; g.fillText('CHAINS', cx - 50, h / 2 + 2); g.font = `700 22px ${FONT}`; g.fillText(name.toUpperCase(), cx + 95, h / 2 + 2); g.beginPath(); g.arc(cx + 30, h / 2, 5, 0, 7); g.fill(); }
}
function paintFlag(g, w, h, n) {
  g.fillStyle = '#f7f6f1'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9ccce'; g.fillRect(0, 0, 12, h); g.fillStyle = GOLD; g.fillRect(12, h - 12, w - 12, 12);
  g.fillStyle = NAVY; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 66px ${FONT}`; g.fillText(String(n), w * .56, h * .44);
}
// Printed fabric wrapped round a truss: the skin rolls over the corners, so the print darkens into its two long edges
// (top and bottom of the beam, the sides of a leg) and the face reads as stretched cloth, not a flat decal.
function wrapShade(g, w, h, acrossX, seed) {
  const rnd = rngOf(seed);   // uneven tension: broad, faint swells and slack in the cloth
  for (let i = 0; i < 9; i++) { const x = rnd() * w, y = rnd() * h, r = (acrossX ? w : h) * (.9 + rnd() * 1.4), gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rnd() < .5 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  const grd = acrossX ? g.createLinearGradient(0, 0, w, 0) : g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(4,8,18,.34)'); grd.addColorStop(.16, 'rgba(4,8,18,0)'); grd.addColorStop(.84, 'rgba(4,8,18,0)'); grd.addColorStop(1, 'rgba(4,8,18,.34)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}
// Stretched cover fabric pulls into soft diagonal folds from the corners where it is laced to the frame.
function tension(g, w, h, seed) {
  const rnd = rngOf(seed); g.lineCap = 'round';
  for (const side of [0, 1]) for (let i = 0; i < 4; i++) {
    const x0 = side ? w : 0, y0 = 4 + rnd() * h * .05, l = h * (.08 + rnd() * .1), a = (side ? Math.PI * .62 : Math.PI * .38) + (rnd() - .5) * .3;
    for (const [c, off] of [['rgba(255,255,255,.07)', -1.5], ['rgba(0,0,0,.14)', 1.5]]) { g.strokeStyle = c; g.lineWidth = 2 + rnd() * 2; g.beginPath(); g.moveTo(x0, y0 + off); g.lineTo(x0 + Math.cos(a) * l, y0 + off + Math.sin(a) * l); g.stroke(); }
  }
}
function paintAtlas(canvas, scale, ctx) {
  const g = canvas.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 2048, 2048); PX = scale;
  const draw = (name, fn) => { const [x, y, w, h] = REGION[name]; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore();
    const px = x * scale, py = y * scale, pw = w * scale, ph = h * scale, b = 8 * scale;   // bleed the edge texels into the gutter so mips do not pick up neighbours
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvas, px, py, 1, ph, px - b, py, b, ph); g.drawImage(canvas, px + pw - 1, py, 1, ph, px + pw, py, b, ph);
    g.drawImage(canvas, px - b, py, pw + 2 * b, 1, px - b, py - b, pw + 2 * b, b); g.drawImage(canvas, px - b, py + ph - 1, pw + 2 * b, 1, px - b, py + ph, pw + 2 * b, b); g.restore(); };
  draw('mat', paintMat); draw('wood', paintWood);
  draw('concrete', (g, w, h) => g.drawImage(pixels(w, h, (x, y) => { const v = 150 + hash2(x, y, 41) * 40 + vnoise(x / 8, y / 8, 42) * 30; return [v, v - 3, v - 8]; }), 0, 0, w, h));
  ctx.holes.forEach((hole, i) => i < 9 && draw('sign' + i, (g, w, h) => paintSign(g, w, h, hole, { ...ctx, sponsor: ['LOFTWING DISCS', 'BIRDIE BREW', ctx.name.toUpperCase() + ' DGC'][i % 3] })));
  for (let i = 0; i < 3; i++) draw('feather' + i, (g, w, h) => paintFeather(g, w, h, i, ctx.name));
  draw('band', (g, w, h) => paintBand(g, w, h, ctx.name));
  draw('bag', (g, w, h) => {   // ripstop purple with piping, a zip across the top third and a sponsor patch
    g.drawImage(pixels(w, h, (x, y) => { const k = .86 + hash2(x, y, 61) * .1 + ((x % 6 < 1 || y % 6 < 1) ? -.06 : 0) + vnoise(x / 40, y / 40, 62) * .1; return [78 * k, 50 * k, 128 * k]; }), 0, 0, w, h);
    g.strokeStyle = '#18161d'; g.lineWidth = 12; g.strokeRect(0, 0, w, h);
    g.fillStyle = '#18161d'; g.fillRect(0, h * .3, w, 9); g.fillStyle = '#b9b6c2'; g.fillRect(w * .7, h * .3 - 4, 12, 22);
    g.fillStyle = '#f4f1ea'; roundRect(g, w * .22, h * .45, w * .56, h * .2, 8); g.fill(); g.fillStyle = '#d4471b'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'LOFTWING', w / 2, h * .55 + 2, w * .5, 800, 40);
  });
  // Event arch: the beam carries the event, the legs stack the basket roundel over the partners, like a broadcast arch.
  const roundel = (g, cx, cy, r) => {
    g.strokeStyle = GOLD; g.lineWidth = r * .1; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); g.fillStyle = '#ffffff';
    g.fillRect(cx - r * .04, cy - r * .7, r * .08, r * 1.45); g.fillRect(cx - r * .5, cy - r * .42, r, r * .1);
    g.beginPath(); g.moveTo(cx - r * .46, cy + .1 * r); g.lineTo(cx + r * .46, cy + .1 * r); g.lineTo(cx + r * .36, cy + .45 * r); g.lineTo(cx - r * .36, cy + .45 * r); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = r * .035; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(cx - r * .42 + i * r * .14, cy - r * .32); g.quadraticCurveTo(cx - r * .3 + i * r * .1, cy - r * .05, cx + (i - 3) * r * .02, cy + r * .1); g.stroke(); }
  };
  draw('archBeam', (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#22385e'); grd.addColorStop(1, '#14223c'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = GOLD; g.fillRect(0, h - 6, w, 6); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 0, w, 3); roundel(g, 56, h / 2 - 2, 36); roundel(g, w - 56, h / 2 - 2, 36);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = GOLD; fitText(g, `${ctx.name.toUpperCase()}  ·  DISC GOLF CHAMPIONSHIP`, w / 2, 19, w - 230, 700, 21);
    g.fillStyle = '#ffffff'; fitText(g, 'CHAINS OPEN 2026', w / 2, 62, w - 230, 800, 70);
    wrapShade(g, w, h, false, 71);
  });
  // Legs: the event roundel over one partner each, set big down the leg so it reads from the tee. The art sits in the
  // top two thirds: a leg on higher ground (hole 1's cross slope) is shorter and loses only plain foot. Leg 0 is the
  // left one seen from the tee, the taller, so it carries the longer name.
  [['BIRDIE BREW', 'COFFEE ROASTERS'], ['LOFTWING', 'DISCS · FLY FURTHER']].forEach(([big, small], j) => draw('archLeg' + j, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#20355a'); grd.addColorStop(1, '#16243f'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = GOLD; g.fillRect(0, 0, w, 4); g.fillRect(8, 94, w - 16, 3); roundel(g, w / 2, 49, 37);
    g.save(); g.translate(w / 2, 108); g.rotate(Math.PI / 2); g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; fitText(g, big, 0, -8, j ? 196 : 250, 800, 74); g.fillStyle = GOLD; fitText(g, small, 0, 38, j ? 196 : 250, 700, 22); g.restore();
    wrapShade(g, w, h, true, 73 + j); tension(g, w, h, 91 + j);
  }));
  draw('archSide', (g, w, h) => {   // the legs' inner faces, the lighter return of a printed truss cover
    const grd = g.createLinearGradient(0, 0, w, 0); grd.addColorStop(0, '#34507e'); grd.addColorStop(1, '#2a4168'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = GOLD; g.fillRect(w - 12, 0, 4, h);
    g.save(); g.translate(w / 2, 16); g.rotate(Math.PI / 2); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff'; fitText(g, 'CHAINS OPEN 2026', 0, 4, h * .66, 800, 24); g.restore();
  });
  for (let i = 0; i < 4; i++) draw('board' + i, (g, w, h) => paintBoard(g, w, h, i, ctx.name));
  draw('valance', (g, w, h) => { g.fillStyle = NAVY; g.fillRect(0, 0, w, h); g.fillStyle = GOLD; g.fillRect(0, h - 10, w, 10); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'CHAINS OPEN 2026  ·  REGISTRATION', w / 2, h * .45, w - 60, 800, 60); });
  for (let i = 0; i < 9; i++) draw('flag' + i, (g, w, h) => paintFlag(g, w, h, i + 1));
  draw('utvDecal', (g, w, h) => {   // crew livery on the UTV's bed sides, on its own paint colour (a decal on the clear coat)
    g.fillStyle = '#2459a6'; g.fillRect(0, 0, w, h); g.fillStyle = GOLD; g.fillRect(0, h * .74, w, 7); g.fillStyle = '#ffffff'; g.fillRect(0, h * .74 + 10, w, 3);
    g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'CHAINS OPEN', 8, h * .36, w * .56, 800, 46); g.fillStyle = GOLD; fitText(g, 'COURSE CREW', w * .6, h * .38, w * .38, 700, 26);
  });
}

// ---------- geometry kit ----------
function kit(height, full) {
  const lists = { print: [], steel: [], arch: [], paint: [] }, col = new THREE.Color(), cells = new Map();
  // ground under x, z on a 25 cm lattice: the parts of one prop share a handful of samples (a basket's chains, one)
  const under = (x, z) => { const i = Math.round(x * 4), j = Math.round(z * 4), k = i * 8192 + j; let y = cells.get(k); if (y === undefined) cells.set(k, y = height(i / 4, j / 4)); return y; };
  // Remaps a placed part's 0..1 UVs into an atlas region, tints it (linear vertex colour) and queues it for one merge.
  // lift: each vertex's height over the turf under it, which the weathering (GRIME below) dusts and muds; `clean`
  // raises it (metres) to thin the dirt on a part that lives at ground level anyway, Infinity for none at all.
  const put = (list, g, region = 'white', color = '#ffffff', clean = 0) => {
    const uv = g.attributes.uv, [u0, v0, u1, v1] = uvRect(region);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    col.set(color); const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3), lift = new Float32Array(n);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; lift[i] = clean === Infinity ? 99 : p.getY(i) - under(p.getX(i), p.getZ(i)) + clean; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('lift', new THREE.BufferAttribute(lift, 1));
    if (list === 'print' && !g.attributes.sway) g.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(n), 1));   // 0 = rigid; cloth carries 0 at the pole to 1 at the free edge
    if (!g.index) g.setIndex([...Array(n).keys()]);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'lift', list === 'print' && 'sway'].includes(k)) g.deleteAttribute(k);
    lists[list].push(g);
    return g;
  };
  // Cloth: a second sheet with reversed winding, so the back-face-only shadow pass always has a face to draw.
  const sheet = g => { const b = g.clone(), ix = b.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } lists.print.push(b); };
  return { print: (g, region, color, clean) => put('print', g, region, color, clean), cloth: (g, region) => sheet(put('print', g, region)), steel: (g, color = '#c8cdd0', clean) => put('steel', g, 'white', color, clean), arch: (g, region, color) => put('arch', g, region, color),
    paint: (g, color, region = 'white') => full ? put('paint', g, region, color) : region === 'white' && put('steel', g, 'white', color), lists };   // clear-coated vehicle paint on Full; Lite folds it into steel and drops decals
}
// Weathering shared by the three prop materials, so nothing on the course reads as fresh CG: dust and dried mud splashed
// up the lowest ~35 cm of whatever stands on the turf (vLift, metres), its edge broken by 3D value noise into splashes,
// matte where it lies; and a broad grime mottle over every face so no painted part is one flat colour. Lite keeps one
// noise octave.
const GRIME_V = s => { s.vertexShader = 'attribute float lift;varying float vLift;varying vec3 vWp;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLift=lift;vWp=position;'); };   // the merged props sit at the origin: position is world space
const GRIME_F = (s, lite) => {
  s.fragmentShader = `varying float vLift;varying vec3 vWp;
float wHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float wNoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(wHash(i),wHash(i+vec3(1,0,0)),f.x),mix(wHash(i+vec3(0,1,0)),wHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(wHash(i+vec3(0,0,1)),wHash(i+vec3(1,0,1)),f.x),mix(wHash(i+vec3(0,1,1)),wHash(i+vec3(1,1,1)),f.x),f.y),f.z);}\n` + s.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
      float nA=wNoise(vWp*5.3),nB=${lite ? '.5' : 'wNoise(vWp*17.+3.7)'};
      float grime=1.-smoothstep(0.,.36,vLift+(nA-.5)*.2+(nB-.5)*.08);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.2,.17,.135)*(.7+.6*nB),grime*(.3+.5*grime));   // dried mud: lightens black rubber, darkens white paint
      diffuseColor.rgb*=.9+.2*${lite ? 'nA' : 'wNoise(vWp*1.9+11.)'};`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,1.,grime*.8);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor*=1.-grime*.8;');
};
// Soft contact shade where props meet the turf, the occlusion the sun's shadow map is too coarse to draw: one
// ground-hugging 5x5 grid per foot, dark in a rounded-rect core (`core` of the half-extents) and fading to nothing at
// the edge, faded out with distance like course.js's canopy pools. blobs: [x, z, yaw, half x, half z, core, strength].
function contactShade(blobs, height) {
  const pos = [], blob = [], idx = [], N = 4;
  for (const [x, z, yaw, hx, hz, core, k] of blobs) {
    const c = Math.cos(yaw), s = Math.sin(yaw), base = pos.length / 3;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const a = i / N * 2 - 1, b = j / N * 2 - 1, wx = x + a * hx * c + b * hz * s, wz = z - a * hx * s + b * hz * c; pos.push(wx, height(wx, wz) + .04, wz); blob.push(a, b, core, k); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const p = base + j * (N + 1) + i; idx.push(p, p + N + 1, p + 1, p + 1, p + N + 1, p + N + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('blob', new THREE.Float32BufferAttribute(blob, 4)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'attribute vec4 blob;varying vec4 vB;varying float vD;void main(){vB=blob;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'varying vec4 vB;varying float vD;void main(){vec2 q=max(abs(vB.xy)-vB.z,0.)/(1.-vB.z);float a=vB.w*(1.-smoothstep(0.,1.,length(q)))*(1.-smoothstep(45.,130.,vD));gl_FragColor=vec4(.018,.024,.012,a);}' }));
  m.renderOrder = 1; return m;
}
const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const pose = (x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(sx, sy, sz));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0, r1, h, n = 8, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);
const ring = (r, t, n, m = 5) => new THREE.TorusGeometry(r, t, m, n).rotateX(Math.PI / 2);
const tube = (pts, r, seg, sides) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, sides, false);
// a local part (built in the prop's own frame) placed by the prop's world matrix
const at = (g, local, world) => g.applyMatrix4(local).applyMatrix4(world);
// Padded box: every vertex of a subdivided box pulled onto a rounded shell of radius r (soft goods, cushions).
function roundBox(w, h, d, r, seg) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), c = new THREE.Vector3(), hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {   // the shell normal is the offset from the inner box: seamless across the face splits
    v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c).normalize(); n.setXYZ(i, v.x, v.y, v.z); v.multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// A straight tube from a to b (Vector3s), open-ended: cage bars, poles.
const rod = (a, b, r, n = 6) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); return cyl(r, r, L, n, true).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(L))).translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); };
// Solid-colour parts whose generator writes UVs in metres (extrusions) sample the atlas's white patch.
const solid = g => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, .5, .5); return g; };
// Fender flare: an arc band round a wheel, r0-r1 from angle a0 to a1 (0 = forward, in the z-y plane), `w` wide
// across x, centred on the axle.
function flare(r0, r1, a0, a1, w, n) {
  const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a1, false); s.absarc(0, 0, r0, a1, a0, true);
  return solid(new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false, curveSegments: n }).rotateY(-Math.PI / 2).translate(w / 2, 0, 0));
}
// Knobby UTV tyre, axle along x: a lathe of the carcass with rounded shoulders and two staggered rows of chevron lugs.
function tyreGeometry(full) {
  const R = .31, hw = .13, sh = .05, prof = [new THREE.Vector2(.19, -hw)];
  for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI / 2; prof.push(new THREE.Vector2(R - sh + Math.sin(a) * sh, -hw + sh - Math.cos(a) * sh)); }
  for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI / 2; prof.push(new THREE.Vector2(R - sh + Math.cos(a) * sh, hw - sh + Math.sin(a) * sh)); }
  prof.push(new THREE.Vector2(.19, hw));
  const parts = [new THREE.LatheGeometry(prof, full ? 28 : 14).rotateZ(Math.PI / 2)], N = full ? 18 : 12;
  for (let i = 0; i < N; i++) for (const s of [-1, 1]) parts.push(box(.1, .075, .045).rotateZ(s * .35).translate(s * .056, 0, R + .012).rotateX((i + (s > 0 ? .5 : 0)) / N * Math.PI * 2));
  return mergeGeometries(parts);
}

// Basket: galvanised pole, tray of rim rings and bars over a pressed dish, outer and inner chain sets hanging in
// catenaries from the rings inside the band to a collar over the tray, the printed band with rolled edges, and a
// number flag on a mast. Full hangs 24 + 12 chains of 10 and 8 segments; Lite 10 chains of 3 and drops hidden parts.
function addBasket(K, world, n, full) {
  const S = (g, c) => K.steel(g.applyMatrix4(world), c), Pr = (g, region, c) => K.print(g.applyMatrix4(world), region, c);
  const GALV = '#d5d9db', DARK = '#8c9296';
  S(cyl(.029, .029, 1.52, full ? 12 : 6, !full).translate(0, .71, 0), GALV);
  S(cyl(.008, .008, .62, 5, !full).translate(0, 1.77, 0), GALV);   // flag mast
  S(cyl(.075, .075, .05, full ? 12 : 6).translate(0, .845, 0), DARK);   // chain collar
  if (full) S(cyl(.045, .045, .12, 8).translate(0, 0, 0), DARK);   // ground sleeve
  S(ring(.34, .012, full ? 40 : 14, full ? 5 : 3).translate(0, .8, 0), GALV);
  S(ring(.33, .009, full ? 40 : 14, full ? 5 : 3).translate(0, .6, 0), GALV);
  if (full) { S(ring(.34, .006, 40, 4).translate(0, .7, 0), GALV); S(ring(.29, .008, 40, 5).translate(0, 1.33, 0), GALV); S(ring(.29, .008, 40, 5).translate(0, 1.46, 0), GALV); S(ring(.255, .006, 32, 4).translate(0, 1.37, 0), DARK); S(ring(.16, .006, 24, 4).translate(0, 1.37, 0), DARK); }
  S(cyl(.33, .06, .035, full ? 24 : 10).translate(0, .59, 0), '#aab0b3');   // pressed dish
  const bars = full ? 24 : 10;
  for (let i = 0; i < bars; i++) { const a = i / bars * Math.PI * 2; S(cyl(.005, .005, .2, 3, true).translate(Math.cos(a) * .337, .7, Math.sin(a) * .337), GALV); }
  if (full) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; S(cyl(.006, .006, .26, 3).rotateZ(Math.PI / 2).rotateY(-a).translate(Math.cos(a) * .15, 1.455, Math.sin(a) * .15), GALV); }   // cap spokes
  const hang = (r0, r1, y0, y1, count, bulge, off, seg, sides) => {
    for (let i = 0; i < count; i++) {
      const a = off + i / count * Math.PI * 2 + (hash2(i, n, 3) - .5) * .08, b = bulge * (.85 + hash2(i, n, 4) * .3), twist = (hash2(i, n, 5) - .5) * .12, pts = [];
      for (let k = 0; k <= 6; k++) { const t = k / 6, r = r0 + (r1 - r0) * t + b * Math.sin(Math.PI * t) * (1 - t * .35), aa = a + twist * Math.sin(Math.PI * t); pts.push(new THREE.Vector3(Math.cos(aa) * r, y0 + (y1 - y0) * t - .018 * Math.sin(Math.PI * t), Math.sin(aa) * r)); }
      S(tube(pts, .007, seg, sides), '#f2f4f5');
    }
  };
  hang(.255, .068, 1.37, .87, full ? 24 : 10, .055, 0, full ? 10 : 3, full ? 4 : 3);
  if (full) hang(.16, .05, 1.37, .87, 12, .035, .13, 8, 3);
  Pr(cyl(.29, .29, .13, full ? 40 : 16, true).translate(0, 1.395, 0), 'band');
  const flag = new THREE.PlaneGeometry(.38, .26, full ? 8 : 2, 1), fp = flag.attributes.position;   // 38 x 26 cm, flying from the mast top
  const sway = new Float32Array(fp.count);
  for (let i = 0; i < fp.count; i++) { const x = fp.getX(i) + .19; sway[i] = x / .38; fp.setXYZ(i, x + .008, fp.getY(i) + 1.94, Math.sin(x * 13) * .03 * x / .38); }
  flag.setAttribute('sway', new THREE.BufferAttribute(sway, 1)); flag.computeVertexNormals(); K.cloth(flag.applyMatrix4(world), 'flag' + n);
  if (full) Pr(cyl(.21, .23, .05, 20).translate(0, .005, 0), 'concrete');   // footing, flush with the turf
}

// Feather flag: a cloth panel with a rounded top on a fibreglass pole that bends along its top edge, cross base.
function featherGeometry(full) {
  const W = .78, yb = .45, yc = 3.1, yt = 3.7, rows = [], NC = full ? 4 : 2;
  for (let j = 0; j <= (full ? 8 : 3); j++) rows.push([yb + (yc - yb) * j / (full ? 8 : 3), 1]);
  for (let k = 1; k <= (full ? 6 : 3); k++) { const a = k / (full ? 6 : 3) * Math.PI / 2; rows.push([yc + (yt - yc) * Math.sin(a), Math.max(.02, Math.cos(a))]); }
  const pos = [], uv = [], idx = [], belly = (s, wk) => (Math.sin(Math.PI * s) * .06 + s * s * .05) * wk;
  rows.forEach(([y, wk]) => { for (let i = 0; i <= NC; i++) { const s = i / NC, x = s * W * wk; pos.push(x, y, belly(s, wk)); uv.push(x / W, (y - yb) / (yt - yb)); } });
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < NC; i++) { const a = j * (NC + 1) + i, b = a + NC + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  g.setAttribute('sway', new THREE.Float32BufferAttribute(uv.filter((_, i) => i % 2 === 0), 1));   // flutter grows from the pole to the free edge
  const pole = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, yc, 0)];   // up the leading edge, then bent along the rounded top
  for (let k = 0; k <= 4; k++) { const a = Math.PI / 2 * (1 - k / 4 * .7); pole.push(new THREE.Vector3(W * Math.cos(a), yc + (yt - yc) * Math.sin(a), belly(1, Math.cos(a)))); }
  return { cloth: g, pole };
}

export function dressCourse({ holes, height, trees, bushes = [], corridor, def, quality }) {
  const full = quality !== 'low', K = kit(height, full), rnd = rngOf(def.seed * 97 + 5);
  const frame = (h, u, f) => { const [fx, fz] = fwdOf(h); return [h.tee[0] - fz * u + fx * f, h.tee[1] + fx * u + fz * f]; };   // tee-local: u right of the fairway, f toward the basket
  // u of a spot pad metres outside the flight corridor on one side (-1 left), the half-width sampled where it stands
  const edge = (h, side, f, pad) => { let u = side * (corridor(...frame(h, side * 9, f)) + pad); u = side * (corridor(...frame(h, u, f)) + pad); return u; };
  const onGround = (h, u, f, rot = 0, sink = .03) => { const [x, z] = frame(h, u, f); return pose(x, height(x, z) - sink, z, h.yaw + rot); };
  // the same, pitched and rolled to the ground under a wheelbase (+-hx across, +-hz along its own axes)
  const fitted = (h, u, f, rot, hx, hz, sink = .02) => {
    const [x, z] = frame(h, u, f), yaw = h.yaw + rot, c = Math.cos(yaw), s = Math.sin(yaw), g = (a, b) => height(x + a * hx * c + b * hz * s, z - a * hx * s + b * hz * c);
    const fr = g(-1, 1) + g(1, 1), bk = g(-1, -1) + g(1, -1), rt = g(1, 1) + g(1, -1), lt = g(-1, 1) + g(-1, -1);
    return pose(x, (fr + bk) / 4 - sink, z, yaw, -Math.atan2((fr - bk) / 2, 2 * hz), Math.atan2((rt - lt) / 2, 2 * hx));
  };
  // contact shade under a prop placed by `world`: half-extents in its own frame, offset (ox, oz) from its origin
  const blobs = [], shadeUnder = (world, hx, hz, core, k, ox = 0, oz = 0) => { const e = world.elements; blobs.push([e[12] + e[0] * ox + e[8] * oz, e[14] + e[2] * ox + e[10] * oz, Math.atan2(e[8], e[10]), hx, hz, core, k]); };
  const feather = featherGeometry(full);
  const addFeather = (world, design) => {
    K.cloth(feather.cloth.clone().applyMatrix4(world), 'feather' + design);
    K.steel(tube(feather.pole, .012, full ? 12 : 4, 4).applyMatrix4(world), '#d9dcdc');
    K.steel(box(.7, .025, .05).applyMatrix4(world), '#3a3d40'); K.steel(box(.05, .025, .7).applyMatrix4(world), '#3a3d40');
    shadeUnder(world, .55, .55, .2, .8);   // w7 putt verdicts: the banners' feet met the ground with no dark contact line, 'pasted onto the terrain'
  };
  const paint = (g, color) => K.print(g, 'white', color);   // powder-coated steel, plastic, canvas: dielectric, solid colour
  const addBench = world => {
    for (let i = 0; i < 3; i++) K.print(at(box(1.7, .04, .11), pose(0, .44, -.13 + i * .13), world), 'wood');
    for (let i = 0; i < 2; i++) K.print(at(box(1.7, .1, .035), pose(0, .6 + i * .15, .2 + i * .03, 0, -.2), world), 'wood');
    for (const x of [-.65, .65]) { paint(at(box(.05, .42, .05), pose(x, .21, -.12), world), '#26292b'); paint(at(box(.05, .82, .05), pose(x, .41, .17, 0, -.1), world), '#26292b'); paint(at(box(.05, .04, .42), pose(x, .4, .03), world), '#26292b'); shadeUnder(world, .2, .38, .2, .5, x, .03); }
    shadeUnder(world, 1.05, .45, .55, .28, 0, .02);   // the seat's own occlusion, softer, between the legs
  };
  const addCan = world => {   // park bin: green powder-coated drum, black lid, two rolled ribs
    paint(at(cyl(.27, .25, .82, full ? 16 : 8, true), pose(0, .41, 0), world), '#35573f');
    paint(at(cyl(.3, .29, .07, full ? 16 : 8), pose(0, .85, 0), world), '#1f2422');
    if (full) for (const y of [.22, .6]) paint(at(ring(.272, .012, 24, 3), pose(0, y, 0), world), '#35573f');
    shadeUnder(world, .46, .46, .15, .5);
  };
  // A player's disc golf backpack left on the bench: a padded purple body with rounded edges, black zip pocket and
  // base, a putter pouch, and the rims of a stack of coloured discs over the top. Built in the bench's frame (seat .46).
  const addBag = world => {
    K.print(at(roundBox(.36, .46, .26, .05, full ? 3 : 2), pose(0, .69, 0), world), 'bag');
    paint(at(roundBox(.3, .24, .07, .03, 2), pose(0, .62, -.135), world), '#1d1c22');
    paint(at(roundBox(.37, .06, .27, .02, 1), pose(0, .48, 0), world), '#1d1c22');
    paint(at(cyl(.075, .075, .22, full ? 12 : 6), pose(.2, .64, .02), world), '#1d1c22');
    ['#e4412b', '#f3c21b', '#2f9fd8', '#62c23c', '#f07ab8', '#f4f4f0', '#ff8a1e'].slice(0, full ? 7 : 3).forEach((c, k) => paint(at(cyl(.105, .105, .021, full ? 16 : 8).rotateZ(Math.PI / 2 + (k - 3) * .06), pose(-.14 + k * .045, .88 + (k % 3) * .014, .01), world), c));   // standing like books
  };
  // Pop-up event canopy: 3 x 3 m, navy roof, printed valance, a draped registration table underneath.
  const addTent = (world, white = false) => {   // white: a plain vendor/players' canopy, walled at the back, for the village beyond the arch
    for (const [x, z] of [[-1.47, -1.47], [1.47, -1.47], [-1.47, 1.47], [1.47, 1.47]]) K.steel(at(box(.04, 2.12, .04), pose(x, 1.06, z), world), '#c4c9cc');
    paint(at(new THREE.ConeGeometry(2.12, .85, 4, 1, true).rotateY(Math.PI / 4), pose(0, 2.54, 0), world), white ? '#f1f1ee' : NAVY);
    for (let k = 0; k < 4; k++) { const v = at(new THREE.PlaneGeometry(3, .3), pose(Math.sin(k * Math.PI / 2) * 1.5, 1.97, Math.cos(k * Math.PI / 2) * 1.5, k * Math.PI / 2), world); if (white) paint(v, '#ecebe6'); else K.print(v, 'valance'); }
    if (white) paint(at(new THREE.PlaneGeometry(2.96, 1.9), pose(0, .98, -1.47), world), '#e6e5df');
    paint(at(box(1.8, .74, .72), pose(0, .37, -.6), world), '#f1f1ee');
    paint(at(box(1.82, .03, .74), pose(0, .755, -.6), world), '#f7f7f4');
    for (const [x, z] of [[-1.47, -1.47], [1.47, -1.47], [-1.47, 1.47], [1.47, 1.47]]) shadeUnder(world, .16, .16, 0, .45, x, z);
    shadeUnder(world, 1.05, .5, .6, .42, 0, -.6);
  };
  // Event arch: a truss gate skinned in printed fabric, straddling the fairway in the frame (+x = right of the play
  // line, +z = toward the tee, y = world height). Legs ARCH.leg wide and ARCH.deep deep, each on a level ballast plinth
  // (top at feet[]) whose skirt is cut to the ground, so on hole 1's cross slope both stand planted rather than one
  // sinking into the hill; up to the level beam's underside yb; brushed aluminium corner extrusions. The leg art hangs
  // from the beam at its painted aspect, so the leg on higher ground shows less of its plain foot.
  const ARCH = { span: 11.2, leg: 1.6, deep: 1.3, beam: 1.5 }, legX = ARCH.span / 2 + ARCH.leg / 2;
  const addArch = (world, yb, feet, rise) => {
    const { leg, deep, beam } = ARCH, face = deep / 2 + .004, skin = (g, region, color) => K.arch(g.applyMatrix4(world), region, color), AL = '#c3c8cc';
    // Printed cover faces are cloth pulled over the frame: each bellies out a few centimetres between its edges (across
    // its width, `across`; down its height otherwise), so the light rolls across it instead of lying flat as on a board.
    const pillow = (g, w, h, across) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = across ? 2 * p.getX(i) / w : 2 * p.getY(i) / h; p.setZ(i, p.getZ(i) + (full ? .05 : .03) * (1 - t * t)); } g.computeVertexNormals(); return g; };
    const panel = (w, region, top, bottom) => {   // art of `region` at its own aspect, hung from `top`, cropped at `bottom`
      const [, , rw, rh] = REGION[region], nat = w * rh / rw, h = Math.min(nat, top - bottom), g = new THREE.PlaneGeometry(w, h, full ? 6 : 2, 1), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (1 - uv.getY(i)) * h / nat);
      return pillow(g, w, h, true).translate(0, top - h / 2, 0);
    };
    [-1, 1].forEach((s, j) => {
      const x = s * legX, y0 = feet[j], hgt = yb - y0;
      skin(roundBox(leg, hgt - .34, deep, .07, full ? 3 : 1).translate(x, y0 + .34 + (hgt - .34) / 2, 0), 'white', '#1a2a48');   // the cover stops 34 cm short of the plinth, showing the truss foot
      for (const z of [1, -1]) skin(panel(leg - .08, 'archLeg0', yb - .08, y0 + .3).rotateY(z < 0 ? Math.PI : 0).translate(x, 0, z * face), 'archLeg' + (s * z > 0 ? 1 : 0));   // left leg as seen from either side: LOFTWING
      skin(panel(deep - .06, 'archSide', yb - .08, y0 + .3).rotateY(-s * Math.PI / 2).translate(x - s * (leg / 2 + .004), 0, 0), 'archSide');   // inner face, toward the opening
      // the truss foot under the cover: corner chords, rails top and bottom, zigzag lacing on all four faces
      for (const [ex, ez] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) K.steel(box(.05, .4, .05).translate(x + ex * (leg / 2 - .04), y0 + .2, ez * (deep / 2 - .04)).applyMatrix4(world), AL);
      const hx = leg / 2 - .04, hz = deep / 2 - .04, tv = (u, y, w) => new THREE.Vector3(x + u, y0 + y, w), lace = (a, b) => K.steel(rod(a, b, .013, full ? 5 : 3).applyMatrix4(world), AL);
      for (const y of [.03, .32]) for (const z of [-hz, hz]) lace(tv(-hx, y, z), tv(hx, y, z));
      for (const y of [.03, .32]) for (const u of [-hx, hx]) lace(tv(u, y, -hz), tv(u, y, hz));
      for (const z of [-hz, hz]) for (let k = 0; k < 5; k++) lace(tv(-hx + 2 * hx * k / 5, k % 2 ? .32 : .03, z), tv(-hx + 2 * hx * (k + 1) / 5, k % 2 ? .03 : .32, z));
      for (const u of [-hx, hx]) for (let k = 0; k < 3; k++) lace(tv(u, k % 2 ? .32 : .03, -hz + 2 * hz * k / 3), tv(u, k % 2 ? .03 : .32, -hz + 2 * hz * (k + 1) / 3));
      // ballast: chamfered cast-concrete blocks, two to a course with the joints crossed between courses; the bottom
      // course is cut to the ground (dug in uphill), and a leg on the low side gets a second course (rise)
      const bw = leg + .3, bd = deep + .7, top2 = rise[j] > .3 ? rise[j] * .5 + .12 : 0;
      const block = (cx, cz, w, d, ya, yb, cut, tone) => {
        const g = roundBox(w, yb - ya, d, .04, 2).translate(x + cx, (ya + yb) / 2, cz).applyMatrix4(world), p = g.attributes.position;
        if (cut) for (let i = 0; i < p.count; i++) if (p.getY(i) < (ya + yb) / 2) p.setY(i, height(p.getX(i), p.getZ(i)) - .1);
        K.print(g, 'concrete', tone);
      };
      const low = Math.min(...[-1, 1].flatMap(a => [-1, 1].map(b => { const e = world.elements, px = x + a * bw / 2, pz = b * bd / 2; return height(e[0] * px + e[8] * pz + e[12], e[2] * px + e[10] * pz + e[14]); })));
      for (const k of [-1, 1]) block(k * bw / 4, 0, bw / 2 - .02, bd, low - .1, y0 - top2, true, k > 0 ? '#d6d2c9' : '#cfcbc2');
      if (top2) for (const k of [-1, 1]) block(0, k * bd / 4, bw - .06, bd / 2 - .02, y0 - top2, y0, false, k > 0 ? '#d3cfc6' : '#dbd7ce');
      K.steel(box(leg + .12, .04, deep + .12).translate(x, y0 + .02, 0).applyMatrix4(world), '#5d6368');   // the truss's base plate
      for (const z of [1, -1]) for (const dx of [-.42, .42]) paint(roundBox(.66, .19, .36, .08, 2).rotateY(dx * .25).translate(x + dx, y0 + .095, z * (deep / 2 + .19)).applyMatrix4(world), '#8c7b55');   // khaki sandbags on the ballast
      shadeUnder(world, bw / 2 + .55, bd / 2 + .55, .6, .8, x, 0);
    });
    skin(roundBox(2 * legX + leg, beam, deep, .07, full ? 3 : 1).translate(0, yb + beam / 2, 0), 'white', '#1a2a48');
    for (const z of [1, -1]) skin(pillow(new THREE.PlaneGeometry(2 * legX + leg - .08, beam - .08, 1, full ? 4 : 2), 0, beam - .08, false).rotateY(z < 0 ? Math.PI : 0).translate(0, yb + beam / 2, z * face), 'archBeam');   // no extrusions on the beam: a chase camera passing through it would meet them as bars across the screen
  };
  // Event sign: a printed 2 x .57 m composite panel in a black edge frame, bolted to two square steel posts that stand
  // on T-feet held down with sandbags, so its legs show and it stands on its own like the ones at a real event.
  const addSign = (world, design) => {
    const y0 = .5, ph = .57;
    for (const z of [1, -1]) K.print(at(new THREE.PlaneGeometry(2, ph), pose(0, y0 + ph / 2, z * .016, z < 0 ? Math.PI : 0), world), 'board' + design);
    paint(at(box(2.05, ph + .05, .028), pose(0, y0 + ph / 2, 0), world), '#1e2023');
    for (const x of [-.8, .8]) {
      K.steel(at(box(.045, y0 + ph + .06, .045), pose(x, (y0 + ph + .06) / 2, -.04), world), '#44484c');
      K.steel(at(box(.06, .035, .62), pose(x, .018, -.04), world), '#3a3d40');   // T-foot across the panel
      paint(at(roundBox(.4, .12, .24, .055, 2), pose(x + (x < 0 ? .03 : -.03), .075, -.22, x < 0 ? .12 : -.1), world), '#8c7b55');   // sandbag on the foot
      shadeUnder(world, .26, .4, .25, .6, x, -.08);
    }
  };
  // Side-by-side utility vehicle, the course crew's: 3.0 x 1.5 x 1.98 m on 1.95 m of wheelbase, nose +z, origin on the
  // ground between the axles. Clear-coated paint (hood, fascia, fender flares, sills, bed sides, tailgate with the crew
  // livery), a glossy black tube cage and moulded roof with an amber beacon; knobby tyres on alloys, vinyl seats and
  // textured charcoal plastics in print; a cargo bed with a cooler, two cones and a bundle of rolled feather flags.
  // The lift grime muds its lowest 35 cm on its own.
  const addUTV = world => {
    const BODY = '#2459a6', PLA = '#2b2d30', RUB = '#222223', CAGE = '#1b1c1e', VINYL = '#3a3d42', UNDER = '#17181a', I = new THREE.Matrix4(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const S = (g, c, m = I) => K.steel(at(g, m, world), c), P = (g, c, m = I) => K.print(at(g, m, world), 'white', c), B = (g, m = I) => K.paint(at(g, m, world), BODY), hi = full ? 2 : 1;
    const tyre = tyreGeometry(full), axle = .335;
    for (const [x, z] of [[-.6, .97], [.6, .97], [-.6, -.97], [.6, -.97]]) {
      const s = Math.sign(x), wm = pose(x, axle, z);
      P(tyre.clone(), RUB, wm);
      S(cyl(.19, .19, .2, full ? 16 : 8, true).rotateZ(Math.PI / 2), '#3f4448', wm);   // rim barrel
      S(cyl(.18, .18, .02, full ? 16 : 8).rotateZ(Math.PI / 2).translate(s * .085, 0, 0), '#34393d', wm);   // dished face
      S(ring(.172, .013, full ? 20 : 10, 3).rotateZ(Math.PI / 2).translate(s * .095, 0, 0), '#aab0b5', wm);   // machined lip
      if (full) for (let k = 0; k < 5; k++) S(box(.022, .13, .04).translate(s * .098, .088, 0).rotateX(k * Math.PI * .4), '#8f969c', wm);
      S(cyl(.045, .055, .04, 8).rotateZ(Math.PI / 2).translate(s * .105, 0, 0), '#26292c', wm);   // hub
      B(flare(.4, .47, .42, Math.PI - .42, .3, full ? 10 : 6), pose(x, axle, z));
      for (const [y, dz] of [[.27, .07], [.39, -.07]]) P(box(.36, .03, .05).translate(-s * .2, 0, 0), UNDER, pose(x, y, z + dz));   // suspension arms
      shadeUnder(world, .19, .28, .2, .75, x, z);
    }
    P(box(.9, .06, 2.7), UNDER, pose(0, .31, 0));   // skid plates and frame between the wheels
    // front clip: hood pitched down to the nose, fascia with a black grille, lamps in housings, bumper and brush guard
    B(roundBox(1.36, .09, .9, .04, hi), pose(0, .905, 1.02, 0, .13));
    B(roundBox(1.0, .42, .14, .05, hi), pose(0, .63, 1.43));
    P(box(.6, .19, .02), '#101112', pose(0, .6, 1.505));
    for (const x of [-.31, .31]) { P(box(.27, .11, .03), '#141516', pose(x, .77, 1.49)); S(roundBox(.22, .075, .03, .015, 1), '#f2eedd', pose(x, .77, 1.502)); }
    P(roundBox(1.18, .1, .12, .04, 1), PLA, pose(0, .42, 1.5));
    for (const x of [-.44, .44]) P(rod(V(x, .42, 1.55), V(x, .78, 1.58), .022, full ? 8 : 4), PLA);
    P(rod(V(-.46, .78, 1.58), V(.46, .78, 1.58), .022, full ? 8 : 4), PLA);
    // cab: floor, dash, column and wheel, two vinyl seats on a storage pedestal, rockers, painted sill panels
    P(box(1.26, .04, 1.1), PLA, pose(0, .44, -.02));
    P(roundBox(1.24, .25, .16, .04, hi), PLA, pose(0, .96, .56));
    P(rod(V(-.3, .95, .5), V(-.3, 1.07, .37), .02, 6), PLA);
    P(ring(.17, .016, full ? 22 : 12, full ? 5 : 3), PLA, pose(-.3, 1.08, .36, 0, -.82));
    P(box(1.2, .33, .52), PLA, pose(0, .6, -.25));
    for (const x of [-.3, .3]) {
      P(roundBox(.54, .13, .5, .05, hi), VINYL, pose(x, .81, -.22));
      P(roundBox(.54, .5, .12, .05, hi), VINYL, pose(x, 1.1, -.5, 0, -.18));
      P(roundBox(.3, .15, .1, .04, 1), VINYL, pose(x, 1.44, -.57, 0, -.18));
    }
    for (const s of [-1, 1]) { P(roundBox(.08, .12, 1.0, .03, 1), PLA, pose(s * .67, .4, 0)); B(roundBox(.05, .32, .6, .02, 1), pose(s * .64, .62, -.24)); }
    // cage: two side hoops (A-pillar, roof rail, B-pillar) and three cross bars, the moulded roof and a beacon
    const tube = (a, b) => S(rod(a, b, .025, full ? 8 : 4), CAGE);
    for (const s of [-1, 1]) {
      const pts = [V(s * .66, .98, .6), V(s * .64, 1.87, .33), V(s * .64, 1.89, -.58), V(s * .68, .88, -.66)];
      for (let k = 0; k < 3; k++) tube(pts[k], pts[k + 1]);
      if (full) for (const p of pts.slice(1, 3)) S(new THREE.SphereGeometry(.027, 8, 5).translate(p.x, p.y, p.z), CAGE);
    }
    tube(V(-.64, 1.87, .33), V(.64, 1.87, .33)); tube(V(-.64, 1.89, -.58), V(.64, 1.89, -.58)); tube(V(-.673, 1.25, -.631), V(.673, 1.25, -.631));
    S(roundBox(1.5, .07, 1.06, .03, hi), '#1c1d1f', pose(0, 1.945, -.1));
    S(cyl(.05, .056, .09, 10), '#ff9a1a', pose(.42, 2.025, -.46)); P(cyl(.07, .07, .025, 10), PLA, pose(.42, 1.99, -.46));
    // cargo bed: painted sides with black rail caps, black floor and front wall, painted tailgate; tail lamps, hitch
    P(box(1.36, .05, .94), PLA, pose(0, .86, -1.07));
    P(box(1.36, .3, .05), PLA, pose(0, 1.02, -.6));
    for (const s of [-1, 1]) { B(roundBox(.06, .3, .96, .02, 1), pose(s * .7, 1.02, -1.07)); P(box(.09, .03, .97), PLA, pose(s * .7, 1.18, -1.07)); K.paint(at(new THREE.PlaneGeometry(.8, .2), pose(s * .732, 1.01, -1.07, s * Math.PI / 2), world), '#ffffff', 'utvDecal'); }
    B(roundBox(1.36, .3, .05, .015, 1), pose(0, 1.02, -1.55));
    P(box(1.0, .4, .9), UNDER, pose(0, .6, -1.05));
    P(roundBox(1.1, .09, .1, .03, 1), PLA, pose(0, .46, -1.56)); P(box(.07, .06, .14), '#2a2c2e', pose(0, .41, -1.64));
    for (const x of [-.55, .55]) S(roundBox(.13, .06, .03, .01, 1), '#a3161c', pose(x, .8, -1.585));
    // load: a cooler, two stacked cones, three feather flags rolled on their poles
    P(roundBox(.6, .36, .38, .04, hi), '#efefea', pose(.2, 1.07, -1.24)); P(roundBox(.62, .07, .4, .03, 1), '#2c62b3', pose(.2, 1.28, -1.24));
    for (const k of [0, 1]) { const y = .9 + k * .07; P(cyl(.025, .14, .42, full ? 12 : 8, true), '#f0641c', pose(.42, y + .21, -.8)); P(cyl(.087, .105, .07, full ? 12 : 8, true), '#f2f2ee', pose(.42, y + .17, -.8)); }
    P(box(.3, .03, .3), '#1f1f1f', pose(.42, .9, -.8));
    [NAVY, '#1f5a3b', '#f2efe6'].forEach((c, k) => { const a = V(-.52 + k * .1, 1.22, -2), b = V(-.4 + k * .1, 1.24, -.68); P(rod(a.clone().lerp(b, .12), b.clone().lerp(a, .06), .048, full ? 8 : 5), c); S(rod(a, b, .013, 4), '#cfd3d6'); });
    shadeUnder(world, .86, 1.62, .45, .6);
  };
  const clearOf = (x, z, r) => !trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (r + t.r * 2) ** 2) && !holes.some(h => h.ponds.some(p => ((x - p.x) / (p.rx * 1.3 + r)) ** 2 + ((z - p.z) / (p.rz * 1.3 + r)) ** 2 < 1));
  // A 10 x 12 cm landscape timber laid from (u0, f0) to (u1, f1) of hole h, 5 cm proud of the ground and dug in below
  // it, bending with the ground along its length.
  const sleeper = (h, u0, f0, u1, f1) => {
    const [x0, z0] = frame(h, u0, f0), [x1, z1] = frame(h, u1, f1), L = Math.hypot(x1 - x0, z1 - z0);
    const g = box(L, 1, .1, Math.max(1, Math.round(L / .7)), 1, 1).applyMatrix4(pose((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(z0 - z1, x1 - x0))), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)) + (p.getY(i) > 0 ? .05 : -.07));
    g.computeVertexNormals(); K.print(g, 'wood', '#d8d2c8', .1);
  };
  // Crushed stone laid on the ground, one draw for all of it: the bed round every tee mat (see the tee loop) and loose
  // pads where the crew set down heavy kit (the arch's ballast). One ground-hugging grid per patch in the ground's own
  // gravel photo (course.js's paths), a shade cooler and fresher, in world-scaled UVs. A bed darkens where it butts
  // against the mat's frame and its edging timbers (the occlusion the shadow map cannot resolve); a loose pad has no
  // edging, so its outline frays into the turf instead. patches: [hole, u0, u1, f0, f1, cells across, cells along, fray].
  const gravel = holes.map(h => [h, -BED.u, BED.u, BED.f0, BED.f1, 6, 12, 0]);
  const gravelBed = () => {
    const pos = [], uv = [], loc = [], ext = [], idx = [];
    for (const [h, u0, u1, f0, f1, NU, NF, fray] of gravel) {
      const base = pos.length / 3;
      for (let j = 0; j <= NF; j++) for (let i = 0; i <= NU; i++) {
        const u = u0 + (u1 - u0) * i / NU, f = f0 + (f1 - f0) * j / NF, [x, z] = frame(h, u, f);
        pos.push(x, height(x, z) + .025, z); uv.push(x / 1.3, z / 1.3); loc.push(u, f, fray); ext.push(u0, u1, f0, f1);
      }
      for (let j = 0; j < NF; j++) for (let i = 0; i < NU; i++) { const a = base + j * (NU + 1) + i, b = a + NU + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('bed', new THREE.Float32BufferAttribute(loc, 3)); g.setAttribute('ext', new THREE.Float32BufferAttribute(ext, 4)); g.setIndex(idx); g.computeVertexNormals();
    const m = toonMaterial({ map: texture('gravel'), color: new THREE.Color(1.16, 1.16, 1.17), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    m.onBeforeCompile = s => {
      s.vertexShader = 'attribute vec3 bed;attribute vec4 ext;varying vec3 vBed;varying vec4 vExt;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBed=bed;vExt=ext;');
      s.fragmentShader = 'varying vec3 vBed;varying vec4 vExt;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 q=vBed.xy*vec2(1.9,1.3);vec2 i=floor(q),w=fract(q);w=w*w*(3.-2.*w);vec4 hh=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+1.,vec2(127.1,311.7))))*43758.5);
        float n=mix(mix(hh.x,hh.y,w.x),mix(hh.z,hh.w,w.x),w.y);   // raked and trodden patches half a metre across
        float edge=min(min(vBed.x-vExt.x,vExt.y-vBed.x),min(vBed.y-vExt.z,vExt.w-vBed.y)),mat=max(abs(vBed.x)-.92,max(vBed.y-3.52,-1.72-vBed.y));
        if(vBed.z>0.&&edge<vBed.z*(.25+.75*n))discard;   // a loose pad frays into the turf
        diffuseColor.rgb*=(.84+.3*n)*mix(mix(.5,1.,smoothstep(0.,.14,edge)),1.,step(.001,vBed.z))*mix(.55,1.,smoothstep(0.,.12,mat));`);
    };
    m.customProgramCacheKey = () => 'chains-props-bed';
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; return mesh;
  };

  holes.forEach((h, i) => {
    // Tee: a 1.6 x 5 m turf mat, the athlete's stance 1.6 m from its back end (its top face sits under his soles at
    // teeY + .07) and a 3.4 m run-up ahead of him, so its front reaches into the bottom of the tee camera's frame; the
    // landscape-timber frame stands 2 cm proud of the pile, buried 7 cm into the flattened pad earth. The whole frame
    // is set in a crushed-stone bed (BED) edged with more timbers; course.js keeps the blade carpet off the bed (its
    // `pads` are the bed's four rectangles).
    const T = pose(h.tee[0], h.teeY, h.tee[1], h.yaw);
    K.print(at(box(1.6, .1, 5), pose(0, .02, -.9), T), 'mat', '#ffffff', Infinity);
    for (const s of [-1, 1]) { K.print(at(box(5.28, .16, .12), pose(s * .86, .01, -.9, Math.PI / 2), T), 'wood', '#ffffff', .14); K.print(at(box(1.6, .16, .12), pose(0, .01, s > 0 ? 1.66 : -3.46), T), 'wood', '#ffffff', .14); }
    for (const s of [-1, 1]) { sleeper(h, s * (BED.u + .05), BED.f0 - .1, s * (BED.u + .05), BED.f1 + .1); sleeper(h, -BED.u, s > 0 ? BED.f1 + .05 : BED.f0 - .05, BED.u, s > 0 ? BED.f1 + .05 : BED.f0 - .05); }
    // Sign on two 4x4 posts beside the back half of the pad, facing the walk-in. The aim camera sits 2.3 m behind the
    // pad on a 55° lens: anything level with the pad's front edge lands half-cut at the frame's side, so tee furniture
    // stays behind that line and reads from the flyover instead.
    const sg = onGround(h, 2.3, -.9, -.4);
    for (const x of [-.52, .52]) { K.print(at(box(.09, 1.64, .09), pose(x, .82, 0), sg), 'wood'); shadeUnder(sg, .2, .2, 0, .45, x, 0); }
    K.print(at(box(1.0, .7, .05), pose(0, 1.16, -.01), sg), 'wood');
    K.print(at(new THREE.PlaneGeometry(.92, .632), pose(0, 1.16, .019), sg), 'sign' + i);
    K.print(at(box(1.16, .045, .16), pose(0, 1.66, 0), sg), 'wood');
    if (full || i === 0) { const bench = onGround(h, -2.6, -.7, -Math.PI / 2); addCan(onGround(h, 3.1, .5)); addBench(bench); if (i === 0) addBag(pose(-.5, 0, 0).premultiply(bench)); }   // Lite furnishes only the clubhouse tee
    // Basket, same yaw as the hole so the flag flies broadside to the approach; a pair of feather flags stands
    // behind-left of the green, off the putt line and clear of the basket's silhouette from the approach.
    const ap = h.way[h.way.length - 2], adx = h.basket[0] - ap[0], adz = h.basket[1] - ap[1], al = Math.hypot(adx, adz), fx = adx / al, fz = adz / al, yawB = Math.atan2(-fx, -fz);   // the approach, past any dogleg
    addBasket(K, pose(h.basket[0], h.basketY, h.basket[1], yawB), i, full);
    const green = (u, f, rot, sink = .03) => { const x = h.basket[0] - fz * u + fx * f, z = h.basket[1] + fx * u + fz * f; return clearOf(x, z, 1) && pose(x, height(x, z) - sink, z, yawB + rot); };
    if (full || i === 0) for (const [u, f, d] of [[-3.6, 6.2, i % 3], [-2.6, 9.8, (i + 1) % 3]]) { const w = green(u, f, .35 + (rnd() - .5) * .3, .05); if (w) addFeather(w, d); }
    if (full) { const b = green(-4.4, 1.9, -Math.PI / 2), c = green(-4.5, 3.9, 0); if (b) addBench(b); if (c) addCan(c); }   // a bench and a bin at the green's edge, left of the approach
    // Every other tee: two sponsor flags down the left edge of the corridor (Full).
    if (full && i) for (const f of [14, 22]) { const [x, z] = frame(h, edge(h, -1, f, 1.6) - rnd(), f); if (clearOf(x, z, .8)) addFeather(pose(x, height(x, z) - .05, z, h.yaw + .45 + (rnd() - .5) * .3), (i + f) % 3); }
  });
  // Tournament village on hole 1, the clubhouse tee (both tiers). The event arch straddles the fairway ~33 m out on the
  // play line (its centre 0.5 m right of it), where the tee camera and the throw both look, near enough that the haze
  // leaves it crisp and far enough that the tee lens holds it whole between the HUD's score panel and the athlete's
  // head, on a 16:9 screen and a 2.2:1 phone alike: 11.2 m clear span, beam underside 6 m over the play line (a
  // full-power drive passes ~4 m up there; a lofted, overhand or blade throw clips it) and never below the eye's line to
  // the top of the pin marker, so the marker hangs in the opening. Its legs and beam go to the flight model as capsules.
  // Yellow rope on white stakes runs from the pad to its legs with an event sign on each line turned to the tee; the
  // crew's UTV parks off the left line, a feather flag stands between it and the left leg, the registration canopy
  // sits just outside the pad camera's left edge (Full), so it never shows as a sliver, and white canopies stand beyond.
  const h1 = holes[0], L1 = Math.hypot(h1.basket[0] - h1.tee[0], h1.basket[1] - h1.tee[1]), capsules = [], archU = .5;
  let archF = 33;
  for (const af of [33, 31, 35, 29, 37]) if ([-1, 1].every(s => clearOf(...frame(h1, archU + s * legX, af), 1.5))) { archF = af; break; }
  // each leg's plinth top: 24 cm over the ground at its centre, its skirt cut to the ground (dug in on the uphill side);
  // on a cross slope the downhill leg stands on a second course of ballast blocks (up to 1.1 m), so the two legs differ
  // by less than the hill does and neither reads as sunk into it
  const feet = [-1, 1].map(s => frame(h1, archU + s * legX, archF)), ground = feet.map(p => height(...p)), rise = ground.map(g => Math.min(1.1, .4 * (Math.max(...ground) - g)));
  const footY = ground.map((g, j) => g + .24 + rise[j]);
  const eye = h1.teeY + 1.42, pin = h1.basketY + 2.7 + 1.225 * Math.min(7, .065 * (L1 + 2.3));   // aim camera's eye 2.3 m behind the pad; marker top (course.js: 2.7 + .6 size up, 1.25 size tall, size .065/m)
  const yb = Math.max(height(...frame(h1, 0, archF)) + 6, eye + (pin - eye) * (archF + 2.3) / (L1 + 2.3) + .35, ...footY.map(y => y + 4.2));
  const [ax, az] = frame(h1, archU, archF); addArch(pose(ax, 0, az, h1.yaw), yb, footY, rise);
  for (const sx of [-1, 1]) { const cu = archU + sx * legX, hw = (ARCH.leg + .3) / 2 + .8, hd = (ARCH.deep + .7) / 2 + .8; gravel.push([h1, cu - hw, cu + hw, archF - hd, archF + hd, 4, 4, .7]); }   // stone laid under the ballast, trodden out round it
  const top = yb + ARCH.beam / 2;
  feet.forEach(([x, z], j) => capsules.push({ a: [x, ground[j], z], b: [x, top, z], r: .7, tag: 'arch' }));   // from the ground: the ballast is solid too
  capsules.push({ a: [feet[0][0], top, feet[0][1]], b: [feet[1][0], top, feet[1][1]], r: ARCH.beam / 2, tag: 'arch' });
  // Chute: yellow rope sagging between white stakes from ahead of the pad's front corners to the arch's legs
  // (inside the walking trail on the open side), an event sign on each rope line.
  for (const s of [-1, 1]) {
    const u0 = s * 2.5, f0 = 5, u1 = archU + s * (legX - .15), f1 = archF - (ARCH.deep + .7) / 2 - .3, n = Math.max(3, Math.round((f1 - f0) / 3.4)), line = t => [u0 + (u1 - u0) * t, f0 + (f1 - f0) * t];
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const [u, f] = line(k / n), [x, z] = frame(h1, u, f), y = height(x, z), post = new THREE.Vector3(x, y + .84, z);
      // a white-painted timber stake hammered 15 cm into the turf, a little off plumb, its tip dipped in marker orange,
      // the mud of every wet round up its foot; the rope is tied round it just under the tip
      const lean = pose(x, y, z, hash2(k, s, 51) * 6.3, (hash2(k, s, 52) - .5) * .07, (hash2(k, s, 53) - .5) * .07);   // hashed, so the rng stream the later dressing draws from is untouched
      K.print(at(box(.05, 1.07, .05), pose(0, .385, 0), lean), 'white', '#ebe8df', -.04); paint(at(box(.054, .09, .054), pose(0, .875, 0), lean), '#ef6a1d');
      post.set(0, .8, 0).applyMatrix4(lean); shadeUnder(pose(x, y, z), .22, .22, .1, .6);
      if (prev) K.print(tube([0, .25, .5, .75, 1].map(t => prev.clone().lerp(post, t).setY(prev.y + (post.y - prev.y) * t - .15 * 4 * t * (1 - t))), .012, 8, full ? 5 : 3), 'white', '#f7cf0a');   // yellow polypropylene rope, sagging
      prev = post;
    }
    // turned to face the tee camera; the left one inside the rope so the nearer stakes fall outside it on screen, the
    // right one outside it, wholly behind the athlete rather than peeking past his arm (it reads from the flyover)
    const [u, f] = line(.5), bu = u + (s < 0 ? .8 : .35); addSign(onGround(h1, bu, f, Math.atan2(-.75 - bu, f + 2.3), .02), s > 0 ? 1 : 0);
  }
  // The crew's UTV takes the first spot clear of trees whose view from the tee camera no bush blocks, nose turned
  // three-quarters to the tee camera.
  const bushFree = (u, f, r) => { const [x, z] = frame(h1, u, f); return !bushes.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < (r + b.s) ** 2); };
  for (const [u, f] of [[-6.9, archF - 14], [-7.4, archF - 12], [-7.2, archF - 16], [-8.3, archF - 9], [-8.6, archF - 6]]) {
    if (!clearOf(...frame(h1, u, f), 1.9) || ![0, .2, .4, .6].every(k => bushFree(u + (-.75 - u) * k, f + (-2.3 - f) * k, k ? .9 : 1.6))) continue;
    addUTV(fitted(h1, u, f, Math.atan2(-.75 - u, f + 2.3) + .9, .6, .97)); break;
  }
  // one feather flag between the UTV and the arch's left leg (clear of both on screen), another by the canopy (Full)
  [[archU - legX - 1.8, archF - 3, 2], [edge(h1, -1, 8, 1.3), 8, 0]].slice(0, full ? 2 : 1).forEach(([u0, f, d]) => {
    for (const df of [0, 2, -2, 4]) { const u = u0 - rnd() * .4, [x, z] = frame(h1, u, f + df); if (clearOf(x, z, 1.2)) return addFeather(onGround(h1, u, f + df, .45 + (rnd() - .5) * .3, .05), d); }
  });
  if (full) { const u = edge(h1, -1, 11.5, 5.3), [x, z] = frame(h1, u, 11.5); if (clearOf(x, z, 2.2)) addTent(onGround(h1, u, 11.5, .6, .02)); }
  // Players' village beyond the arch on the left: white canopies half lost in the haze, the first two spots clear of trees.
  let village = 0;
  for (const [u, f] of [[-15, 55], [-14.5, 44.5], [-22, 52], [-12, 60], [-20.5, 52], [-17, 47]]) {
    if (village >= 2) break; const [x, z] = frame(h1, u, f);
    if (clearOf(x, z, 2.4)) { addTent(onGround(h1, u, f, .5 + village * .35, .02), true); village++; }
  }

  const atlas = document.createElement('canvas'), scale = full ? 1 : .5; atlas.width = atlas.height = 2048 * scale;
  const ctx = { holes, trees, name: def.name, fairwayW: def.fairwayW };
  paintAtlas(atlas, scale, ctx);
  const map = new THREE.CanvasTexture(atlas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  if (document.fonts && !document.fonts.check(`800 40px ${FONT}`)) document.fonts.load(`800 40px ${FONT}`).then(() => { if (map.image) { paintAtlas(atlas, scale, ctx); map.needsUpdate = true; } }).catch(() => {});   // signs repaint in the condensed face once it lands
  // Double-sided so cloth reads from behind, but only back faces go into the shadow map: the flat mat and sign faces
  // under a 19° sun would otherwise shadow themselves in bands (acne). Cloth is two sheets, so one always casts.
  const print = new THREE.Mesh(mergeGeometries(K.lists.print), toonMaterial({ map, vertexColors: true, roughness: .82, side: THREE.DoubleSide, shadowSide: THREE.BackSide }));
  // Cloth ripples along its own normal, a wave running from pole to free edge, livelier as the wind rises (the shadow
  // pass keeps the rest pose: a few centimetres the eye never checks).
  print.material.onBeforeCompile = s => {
    s.uniforms.windTime = windTime; s.uniforms.windVec = windVec; GRIME_V(s); GRIME_F(s, !full);
    s.vertexShader = 'attribute float sway;uniform float windTime;uniform vec2 windVec;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += objectNormal * sin(windTime * 4.3 - sway * 5.5 + position.x * .9 + position.z * .7) * (.03 + min(length(windVec), 1.) * .07) * sway;`);
  };
  print.material.customProgramCacheKey = () => 'chains-props-print' + full;
  // Galvanised steel is a matte zinc skin: mostly diffuse so a back-lit basket stays silver-white under the dim ambient,
  // with enough metal and a tight enough lobe that chains still glint. The UTV's cage (and on Lite its paint) share it.
  const steel = new THREE.Mesh(mergeGeometries(K.lists.steel), toonMaterial({ vertexColors: true, metalness: .35, roughness: .38 }));
  steel.material.onBeforeCompile = s => { GRIME_V(s); GRIME_F(s, !full); };
  steel.material.customProgramCacheKey = () => 'chains-props-steel' + full;
  // w10 putt verdicts (5/6: 'a dark featureless oval ~1.4 m right of the basket, detached from the pole'): under the 24°
  // key the solid pressed dish threw one dark ellipse. In the shadow pass alone the dish (picked out by its tint) is a
  // wire grid, 5 mm wires on a 5 cm pitch (~19% cover; 1.4 cm wires, ~48%, still blurred to a grey oval at 640x360), so
  // the tray casts an open cage: its rim and bars a hoop round a faint lattice, hung on the pole's shadow line. Looks unchanged.
  const tray = new THREE.Color('#aab0b3'), steelDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  steelDepth.onBeforeCompile = s => {
    s.vertexShader = 'attribute vec3 color;varying float vTray;varying vec2 vGrid;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vTray = step(length(color - vec3(${tray.r.toFixed(5)}, ${tray.g.toFixed(5)}, ${tray.b.toFixed(5)})), .003); vGrid = (modelMatrix * vec4(transformed, 1.)).xz / .05;`);
    s.fragmentShader = 'varying float vTray;varying vec2 vGrid;\n' + s.fragmentShader.replace('void main() {', 'void main() {\n\tvec2 wire = abs(fract(vGrid) - .5); if (vTray > .5 && max(wire.x, wire.y) < .45) discard;');
  };
  steelDepth.customProgramCacheKey = () => 'chains-props-steel-depth';
  steel.customDepthMaterial = steelDepth;
  // The arch's skin: dye-sublimated polyester, a soft satin sheen. Single-sided (see the top). Stretched thin over the
  // truss it passes some of the daylight behind it, so a face turned from the sun still glows with its own print
  // (a fraction of its albedo): the whites stay white and the navy stays navy instead of both sinking to slate.
  const arch = new THREE.Mesh(mergeGeometries(K.lists.arch), toonMaterial({ map, vertexColors: true, roughness: .62 }));
  // A season outdoors: the dye bleaches and greys, more toward the beam that takes the most sun, and rain running off
  // the beam leaves faint vertical streaks down the legs.
  arch.material.onBeforeCompile = s => { GRIME_V(s); GRIME_F(s, !full); s.fragmentShader = s.fragmentShader.replace('#include <roughnessmap_fragment>', `{ float l=dot(diffuseColor.rgb,vec3(.3,.59,.11)),up=smoothstep(1.,7.,vLift);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(l)*1.1+.01,.12+.12*up);
        diffuseColor.rgb*=mix(.78,1.04,smoothstep(.3,4.,vLift));   // less sky reaches the foot of a leg than its top
        diffuseColor.rgb*=1.-.14*smoothstep(.55,.95,wNoise(vec3(vWp.x*13.,vWp.y*.4,vWp.z*13.)))*(1.-up*.4); }
      #include <roughnessmap_fragment>`).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * .22;'); };
  arch.material.customProgramCacheKey = () => 'chains-props-arch' + full;
  print.castShadow = print.receiveShadow = steel.receiveShadow = arch.castShadow = arch.receiveShadow = true; steel.castShadow = full;
  const meshes = [print, steel, arch, gravelBed(), contactShade(blobs, height)];
  // Vehicle paint (Full): metallic base under a clear coat, so the hood and flanks carry the sky's sharp reflection over
  // the colour the way car paint does; mud kills the coat as well as the gloss.
  if (K.lists.paint.length) {
    const paint = new THREE.Mesh(mergeGeometries(K.lists.paint), new THREE.MeshPhysicalMaterial({ map, vertexColors: true, metalness: .3, roughness: .42, clearcoat: 1, clearcoatRoughness: .07 }));
    paint.material.onBeforeCompile = s => { GRIME_V(s); GRIME_F(s, false); s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat*=1.-grime;'); };
    paint.material.customProgramCacheKey = () => 'chains-props-paint';
    paint.castShadow = paint.receiveShadow = true; meshes.push(paint);
  }
  for (const g of [...K.lists.print, ...K.lists.steel, ...K.lists.arch, ...K.lists.paint]) g.dispose();
  return { meshes, capsules };
}
