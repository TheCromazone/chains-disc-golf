// Sound. Everything is synthesized with small physical models (metallic modal rings for the basket,
// wood knocks for trees, filtered-noise bursts for grass/water/air) and sits in a short synthetic
// outdoor reverb. Real recordings override any effect: list them under "sfx" in assets/manifest.json
// (see docs/codex-asset-prompts.md) and they are decoded on unlock and used instead of the synth.
let ctx = null, master = null, verb = null, noiseBuf = null, muted = false;
const samples = {};
const VOL = 0.22;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : VOL;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -20; lim.knee.value = 10; lim.ratio.value = 12; lim.attack.value = 0.002; lim.release.value = 0.12;
  master.connect(lim); lim.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // outdoor "air": short, dark, fast-decaying reverb
  const n = Math.floor(ctx.sampleRate * 0.9), ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); for (let i = 0; i < n; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4.5) * (i < 400 ? i / 400 : 1); }
  verb = ctx.createConvolver(); verb.buffer = ir;
  const vf = ctx.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = 3200;
  const vg = ctx.createGain(); vg.gain.value = 0.28; verb.connect(vf); vf.connect(vg); vg.connect(master);
  ambient(); loadSamples();
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : VOL, ctx.currentTime, 0.02); }
export const isMuted = () => muted;

const now = () => ctx.currentTime;
const rnd = (a, b) => a + Math.random() * (b - a);
function out(g, send) { g.connect(master); if (send > 0) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(verb); } }
// one decaying sine partial
function partial(f0, dur, gain, { f1 = f0, type = 'sine', t0 = now(), send = 0, attack = 0.003 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); out(g, send); o.start(t0); o.stop(t0 + dur + 0.05);
  return g;
}
// filtered noise burst; lfo = [hz, depth] adds amplitude flutter
function burst(dur, { f0 = 800, f1 = f0, q = 1, gain = 0.5, type = 'bandpass', attack = 0.005, t0 = now(), send = 0, lfo = null } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rnd(0.92, 1.08);
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g);
  if (lfo) { const m = ctx.createGain(); m.gain.value = 1 - lfo[1]; const o = ctx.createOscillator(); o.frequency.value = lfo[0]; const og = ctx.createGain(); og.gain.value = lfo[1]; o.connect(og); og.connect(m.gain); o.start(t0); o.stop(t0 + dur + 0.05); g.connect(m); out(m, send); }
  else out(g, send);
  s.start(t0); s.stop(t0 + dur + 0.05);
}
// metallic / wooden modal ring: inharmonic partials, higher ones die faster
function ring(base, ratios, gains, dur, gain, { t0 = now(), send = 0.3, detune = 0.012 } = {}) {
  ratios.forEach((r, i) => partial(base * r * rnd(1 - detune, 1 + detune), dur * (1 - i * 0.18), gain * gains[i], { t0, send }));
}
const CHAIN = { r: [1, 1.47, 2.09, 2.86], g: [1, 0.55, 0.32, 0.16] };
const trayDrop = (t0, k = 1) => {  // disc settling on the basket tray: dull steel pan clank + two smaller bounces
  ring(rnd(300, 360), [1, 1.83, 2.71], [1, 0.4, 0.2], 0.22, 0.2 * k, { t0, send: 0.4 });
  burst(0.07, { f0: 900, f1: 260, q: 0.6, gain: 0.22 * k, type: 'lowpass', t0 });
  ring(rnd(310, 380), [1, 1.83], [1, 0.4], 0.1, 0.07 * k, { t0: t0 + rnd(0.1, 0.14), send: 0.3 });
  ring(rnd(320, 400), [1, 1.83], [1, 0.4], 0.07, 0.035 * k, { t0: t0 + rnd(0.2, 0.26), send: 0.3 });
};
const chainCascade = (t0, hits, loud) => {  // N link collisions, dense then sparse, bright ringing tail
  let t = 0;
  for (let i = 0; i < hits; i++) {
    const k = i / hits;
    ring(rnd(2300, 5100), CHAIN.r, CHAIN.g, rnd(0.05, 0.09) + (1 - k) * 0.1, loud * (1 - k * 0.75) * rnd(0.5, 1), { t0: t0 + t, send: 0.55 });
    t += 0.005 + k * 0.03 + rnd(0, 0.014);
  }
  partial(rnd(4600, 5600), 0.75, loud * 0.12, { t0: t0 + 0.04, send: 0.7 }); partial(rnd(3500, 4200), 0.55, loud * 0.1, { t0: t0 + 0.06, send: 0.7 });
  return t;
};

export const sfx = {
  whoosh(power = 1) { if (!ctx) return; if (play('whoosh', { gain: 0.5 + power * 0.5, rate: 0.9 + power * 0.25 })) return;
    burst(0.4 + power * 0.55, { f0: 900 + power * 1500, f1: 220, q: 0.7, gain: 0.1 + power * 0.22, attack: 0.012, lfo: [rnd(17, 26), 0.35] }); },
  chains(power = 0.6) { if (!ctx) return; if (play(power < 0.35 ? 'chains_soft' : power > 0.75 ? 'chains_fast' : 'chains_medium') || play('chains')) return;
    const t0 = now(); burst(0.05, { f0: 2600, f1: 1100, q: 0.5, gain: 0.45, t0 });
    const len = chainCascade(t0, Math.round(rnd(20, 30)), 0.22); trayDrop(t0 + Math.max(0.2, len * 0.8)); },
  drop() { if (!ctx) return; if (play('tray') || play('chains', { gain: 0.6 })) return; const t0 = now(); chainCascade(t0, 6, 0.12); trayDrop(t0 + 0.08, 1.1); },
  chainout() { if (!ctx) return; if (play('chainout')) return; const t0 = now(); burst(0.04, { f0: 3000, f1: 1500, q: 0.5, gain: 0.35, t0 }); chainCascade(t0, 9, 0.2); },
  band() { if (!ctx) return; if (play('band')) return; const t0 = now();
    burst(0.05, { f0: 1800, f1: 600, q: 0.5, gain: 0.35, t0 }); ring(rnd(820, 980), [1, 1.58, 2.32, 3.1], [1, 0.5, 0.3, 0.15], 0.32, 0.3, { t0, send: 0.45 }); partial(170, 0.12, 0.16, { f1: 90, t0 }); chainCascade(t0 + 0.02, 4, 0.08); },
  pole() { if (!ctx) return; if (play('band', { rate: 0.7 })) return; const t0 = now(); burst(0.04, { f0: 1200, f1: 500, q: 0.6, gain: 0.3, t0 }); ring(rnd(480, 560), [1, 2.76, 5.4], [1, 0.35, 0.15], 0.22, 0.3, { t0, send: 0.4 }); },
  thud(k = 1) { if (!ctx) return; if (play('grass', {gain:k}) || play('thud', { gain: k, rate: rnd(0.9, 1.1) })) return; const t0 = now();
    partial(105, 0.16, 0.34 * k, { f1: 48, t0 }); burst(0.09, { f0: 420, f1: 120, q: 0.7, gain: 0.3 * k, type: 'lowpass', t0 }); burst(0.24, { f0: 2600, f1: 1500, q: 0.4, gain: 0.07 * k, type: 'highpass', t0: t0 + 0.01, attack: 0.02 }); },
  skip() { if (!ctx) return; if (play('skip')) return; const t0 = now(); burst(0.07, { f0: 800, f1: 300, q: 0.7, gain: 0.22, t0 }); partial(150, 0.07, 0.18, { f1: 70, t0 }); burst(0.14, { f0: 3000, f1: 1800, q: 0.4, gain: 0.05, type: 'highpass', t0 }); },
  tree() { if (!ctx) return; if (play('tree')) return; const t0 = now();
    burst(0.025, { f0: 1600, f1: 500, q: 0.5, gain: 0.35, t0 }); ring(rnd(190, 320), [1, 2.3, 3.9, 5.4], [1, 0.45, 0.3, 0.15], 0.1, 0.45, { t0, send: 0.35, detune: 0.03 });
    partial(rnd(90, 120), 0.09, 0.2, { f1: 60, t0 }); for (let i = 0; i < 3; i++) burst(rnd(0.12, 0.3), { f0: rnd(2000, 3500), f1: 1500, q: 0.4, gain: 0.05, type: 'highpass', t0: t0 + 0.03 + i * rnd(0.04, 0.09), attack: 0.02 }); },
  leaves() { if (!ctx) return; if (play('leaves')) return; const t0 = now(); for (let i = 0; i < 4; i++) burst(rnd(0.1, 0.3), { f0: rnd(1800, 3800), f1: 1400, q: 0.4, gain: rnd(0.05, 0.09), type: 'highpass', t0: t0 + i * rnd(0.03, 0.1), attack: 0.02 }); for (let i = 0; i < 5; i++) burst(0.012, { f0: rnd(2500, 5000), q: 2, gain: 0.05, t0: t0 + rnd(0, 0.35) }); },
  splash() { if (!ctx) return; if (play('splash')) return; const t0 = now();
    burst(0.12, { f0: 650, f1: 160, q: 0.6, gain: 0.45, type: 'lowpass', t0 }); partial(150, 0.28, 0.24, { f1: 42, t0 });
    burst(0.75, { f0: 1900, f1: 700, q: 0.5, gain: 0.16, attack: 0.05, t0: t0 + 0.03, send: 0.4, lfo: [rnd(7, 11), 0.5] });
    for (let i = 0; i < 6; i++) partial(rnd(1400, 3600), 0.03, 0.04, { f1: 900, t0: t0 + rnd(0.12, 0.55) }); },
  roll() { if (!ctx) return; if (play('roll')) return; burst(0.9, { f0: 320, f1: 140, q: 0.5, gain: 0.2, type: 'lowpass', attack: 0.03, lfo: [rnd(4, 7), 0.6] }); },
  click() { if (!ctx) return; if (play('click', { gain: 0.6 })) return; partial(2300, 0.03, 0.05, { f1: 1600 }); burst(0.012, { f0: 4200, q: 1.5, gain: 0.04 }); },
  applause() { if (!ctx) return; if (play('applause')) return;
    for (let i=0;i<24;i++) burst(.065, {f0:rnd(900,1900),gain:rnd(.04,.11),t0:now()+i*.055+rnd(0,.035),send:.3}); },
  ohh() { if (!ctx) return; if (play('ohh')) return;
    // Wordless descending vowel fallback; never represented as a recording.
    for (const f of [190,238,285]) partial(f,1.3,.035,{f1:f*.66,type:'triangle',send:.45,attack:.12}); },
  fanfare(kind) { if (!ctx) return; if ((['birdie','eagle','ace'].includes(kind) && play('birdie_jingle')) || play('fanfare_' + kind)) return;
    const seq = kind === 'ace' ? [523, 659, 784, 1047, 1319] : kind === 'eagle' ? [523, 659, 784, 1047] : kind === 'birdie' ? [659, 784, 1047] : [523, 659];
    seq.forEach((f, i) => { const t0 = now() + i * 0.12; partial(f, 0.4, 0.13, { t0, send: 0.5 }); partial(f * 4, 0.07, 0.03, { t0, send: 0.3 }); }); },  // marimba-ish
  bad() { if (!ctx) return; if (play('bad')) return; partial(230, 0.35, 0.1, { f1: 140, type: 'triangle', send: 0.3 }); },
};

function ambient() { // wind bed with slow gusts + bird calls (frequency-swept chirps, trills)
  if (play('ambient', { loop: true, gain: 1 })) return;
  const wind = ctx.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.4;
  const g = ctx.createGain(); g.gain.value = 0.03; wind.connect(f); f.connect(g); g.connect(master); wind.start();
  const gust = () => { if (!muted) { f.frequency.setTargetAtTime(rnd(260, 760), now(), 1.2); g.gain.setTargetAtTime(rnd(0.018, 0.06), now(), 1.4); } setTimeout(gust, rnd(1500, 4000)); };
  gust();
  const chirp = () => {
    if (ctx.state === 'running' && !muted) {
      const base = rnd(2000, 3800), notes = 2 + Math.floor(rnd(0, 4)), trill = Math.random() < 0.35;
      for (let i = 0; i < notes; i++) {
        const t0 = now() + i * (trill ? 0.07 : rnd(0.11, 0.2)), f0 = base * rnd(0.9, 1.15);
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.25, 1.6), t0 + 0.04); o.frequency.exponentialRampToValueAtTime(f0 * rnd(0.85, 1.05), t0 + 0.09);
        const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t0); gg.gain.exponentialRampToValueAtTime(0.022, t0 + 0.015); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
        o.connect(gg); out(gg, 0.6); o.start(t0); o.stop(t0 + 0.12);
      }
    }
    setTimeout(chirp, rnd(4000, 14000));
  };
  setTimeout(chirp, 2500);
}

// ---- optional real recordings ----
async function loadSamples() {
  try {
    const m = await fetch('assets/manifest.json').then(r => r.ok ? r.json() : null);
    if (!m?.sfx) return;
    await Promise.allSettled(Object.entries(m.sfx).map(async ([name, url]) => {
      const buf = await fetch('assets/' + url).then(r => r.ok ? r.arrayBuffer() : null); if (!buf) return;
      samples[name] = await ctx.decodeAudioData(buf);
    }));
  } catch { /* Optional recordings retain their synth fallback independently. */ }
}
function play(name, { gain = 1, rate = 1, loop = false, send = 0.25 } = {}) {
  const b = samples[name]; if (!b) return false;
  const s = ctx.createBufferSource(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate * (loop ? 1 : rnd(0.97, 1.03));
  const g = ctx.createGain(); g.gain.value = gain; s.connect(g); out(g, loop ? 0 : send); s.start();
  return true;
}
