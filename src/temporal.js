// Temporal resolve for still frames, both tiers (gauntlet r2 crisp/d-crisp: "hard one-pixel alpha cut-outs on foliage and
// hair, thin chains that break into dots, stepped dash ends"; Disc Golf Masters gets its soft edges from Unreal's TAA).
// While the camera holds still the projection is jittered by a sub-pixel Halton offset each frame and the frame is blended
// into a history, clamped to the current frame's 3x3 neighbourhood: a held frame (aim, putt, a paused flyover) converges
// on a ~10x supersampled image and wind-moved leaves or the idling athlete never ghost. No reprojection: the moment the
// camera moves the jitter stops and the frame shows as rendered (MSAA, plus FXAA on Desktop), so motion never smears.
// ponytail: still-camera only; add depth reprojection if moving shots ever need the same edges.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
export const JITTER = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - .5, halton(i + 1, 3) - .5]);   // pixels
// A frame counts as moved when one element of the view or projection matrix changes by more than this (~.02 px)
export const MOVE_EPS = 2e-5;
export const moved = (a, b, eps = MOVE_EPS) => a.some((v, i) => Math.abs(v - b[i]) > eps);

const VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
export function createTemporal() {
  const u = { tCur: { value: null }, tHist: { value: null }, uTexel: { value: new THREE.Vector2() }, uJit: { value: new THREE.Vector2() }, uAlpha: { value: 1 }, uSeed: { value: 0 } };
  // History clamped into the box of the current frame's 3x3 neighbourhood, then a running mean (1/n, floored at .1). The
  // +-.5 LSB hash dither keeps an 8-bit history (phones) from sticking a few levels off the mean at small blend weights.
  // Each jittered frame enters through Unreal's TAA reconstruction filter, not as its centre sample: the 3x3 samples sit at
  // their offset plus the jitter (a pixel shows the scene at its centre + uJit) and are weighted exp(-2.29 d^2), a Gaussian
  // of sigma ~.47 px. A box-filtered (centre-sample) supersample still ends silhouettes, hair and wire in a one-pixel step
  // that critics read as "crisp and slightly stepped, pasted on"; the Gaussian lands them over ~2 px, Disc Golf Masters' edge.
  const resolve = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tCur,tHist;uniform vec2 uTexel,uJit;uniform float uAlpha,uSeed;varying vec2 vUv;
      void main(){ vec3 c=vec3(0.),lo=vec3(1e4),hi=vec3(-1e4); float ws=0.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec3 s=texture2D(tCur,vUv+vec2(x,y)*uTexel).rgb; vec2 d=vec2(x,y)+uJit; float k=exp(-2.29*dot(d,d));
          c+=s*k; ws+=k; lo=min(lo,s); hi=max(hi,s); }
        c/=ws; vec3 o=mix(clamp(texture2D(tHist,vUv).rgb,lo,hi),c,uAlpha);
        gl_FragColor=vec4(o+(fract(sin(dot(gl_FragCoord.xy+uSeed,vec2(12.9898,78.233)))*43758.5453)-.5)/255.,1.); }` }));
  const copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tCur: u.tCur }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D tCur;varying vec2 vUv;void main(){gl_FragColor=texture2D(tCur,vUv);}' }));
  const lastW = new THREE.Matrix4(), lastP = new THREE.Matrix4(), held = new THREE.Matrix4(), size = new THREE.Vector2();
  let n = 0, w = 0, h = 0, cur = null, hist = null;
  const draw = (renderer, quad) => { const auto = renderer.autoClear; renderer.autoClear = false; quad.render(renderer); renderer.autoClear = auto; };
  const t = {
    get frames() { return n; },
    // Call with the frame's final, unjittered camera; hold false drops the history (fast action in front of a held camera).
    // Returns true when the frame is held still and was jittered.
    begin(renderer, camera, hold = true) {
      renderer.getDrawingBufferSize(size); camera.updateMatrixWorld();
      const still = hold && size.x === w && size.y === h && !moved(camera.matrixWorld.elements, lastW.elements) && !moved(camera.projectionMatrix.elements, lastP.elements);
      w = size.x; h = size.y; lastW.copy(camera.matrixWorld); lastP.copy(camera.projectionMatrix);
      n = still ? n + 1 : 0; if (!n) return false;
      const [jx, jy] = JITTER[n % JITTER.length], e = camera.projectionMatrix.elements; held.copy(camera.projectionMatrix);
      e[8] += jx * 2 / w; e[9] += jy * 2 / h; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      u.uTexel.value.set(1 / w, 1 / h); u.uJit.value.set(jx, jy); u.uAlpha.value = n === 1 ? 1 : Math.max(1 / n, .1); u.uSeed.value = n % 97;
      return true;
    },
    end(camera) { if (!n) return; camera.projectionMatrix.copy(held); camera.projectionMatrixInverse.copy(held).invert(); },
    // Desktop's composer pass: current (display space) and history textures in, the resolved frame into the bound target.
    resolve(renderer, curTex, histTex) { u.tCur.value = curTex; u.tHist.value = histTex; draw(renderer, resolve); },
    copy(renderer, tex) { u.tCur.value = tex; draw(renderer, copy); },
    // Mobile: the frame was drawn straight to the canvas. Copy it out, resolve back over it, keep the result as history.
    // Two RGB8 textures at the drawing-buffer size (the canvas is RGB: alpha false), one full-screen pass, two blits.
    canvas(renderer) {
      if (!cur || cur.image.width !== w || cur.image.height !== h) {
        cur?.dispose(); hist?.dispose(); u.uAlpha.value = 1;
        cur = new THREE.FramebufferTexture(w, h); hist = new THREE.FramebufferTexture(w, h);
        for (const x of [cur, hist]) Object.assign(x, { format: THREE.RGBFormat, internalFormat: 'RGB8' });   // copyTexSubImage2D may only drop channels, never add alpha
      }
      renderer.copyFramebufferToTexture(cur); t.resolve(renderer, cur, hist); renderer.copyFramebufferToTexture(hist);
    },
    dispose() { cur?.dispose(); hist?.dispose(); cur = hist = null; },
  };
  return t;
}
