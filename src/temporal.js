// Temporal resolve for still frames, both tiers (gauntlet r2 crisp/d-crisp: "hard one-pixel alpha cut-outs on foliage and
// hair, thin chains that break into dots, stepped dash ends"; Disc Golf Masters gets its soft edges from Unreal's TAA).
// While the camera holds still the projection is jittered by a sub-pixel Halton offset each frame and the frame is blended
// into a history, clamped to the current frame's 3x3 neighbourhood: a held frame (aim, putt, a paused flyover) converges
// on a ~10x supersampled image and wind-moved leaves never ghost (on phones the athlete's interior takes a short one: canvas()). No reprojection: the moment the
// camera moves the jitter stops and the frame shows as rendered (MSAA, plus FXAA on Desktop), so motion never smears.
// ponytail: still-camera only; add depth reprojection if moving shots ever need the same edges.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
export const JITTER = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - .5, halton(i + 1, 3) - .5]);   // pixels
// A frame counts as moved when one element of the view or projection matrix changes by more than this (~.02 px)
export const MOVE_EPS = 2e-5;
export const moved = (a, b, eps = MOVE_EPS) => a.some((v, i) => Math.abs(v - b[i]) > eps);
// Athlete surfaces write this into the stencil (the canvas has one: main.js), so the phone resolve can find his outline
export const ATHLETE_STENCIL = { stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp };
// His modelled hands (gltf-player.js hold_/rest_ meshes) add bit 2: a narrower outline ramp (canvas())
export const HAND_STENCIL = { ...ATHLETE_STENCIL, stencilRef: 3 };

const VS = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
export function createTemporal() {
  const u = { tCur: { value: null }, tHist: { value: null }, uTexel: { value: new THREE.Vector2() }, uJit: { value: new THREE.Vector2() }, uAlpha: { value: 1 }, uSeed: { value: 0 }, tMask: { value: null }, uMask: { value: 0 } };
  // History clamped into the box of the current frame's 3x3 neighbourhood, then a running mean (1/n, floored at .1). The
  // +-.5 LSB hash dither keeps an 8-bit history (phones) from sticking a few levels off the mean at small blend weights.
  // Each jittered frame enters through Unreal's TAA reconstruction filter, not as its centre sample: the 3x3 samples sit at
  // their offset plus the jitter (a pixel shows the scene at its centre + uJit) and are weighted exp(-4.5 d^2), a Gaussian
  // of sigma ~.33 px (it was ~.47, which smeared mulch and turf detail: blind r1-vs-r2 check, ground 0/4). A box-filtered
  // (centre-sample) supersample still ends silhouettes, hair and wire in a one-pixel step
  // that critics read as "crisp and slightly stepped, pasted on"; the Gaussian lands them over ~2 px, Disc Golf Masters' edge.
  const resolve = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tCur,tHist,tMask;uniform vec2 uTexel,uJit;uniform float uAlpha,uSeed,uMask;varying vec2 vUv;
      float M(vec2 o){ return texture2D(tMask,vUv+o*uTexel).r; }
      void main(){ vec3 c=vec3(0.),lo=vec3(1e4),hi=vec3(-1e4); float ws=0.,al=uAlpha;
        if(uMask>.5) al=mix(al,mix(max(al,.34),1.,texture2D(tMask,vUv).g),smoothstep(.55,1.,min(min(min(M(vec2(-1.5)),M(vec2(1.5,-1.5))),min(M(vec2(-1.5,1.5)),M(vec2(1.5)))),M(vec2(0.)))));   // phones: his interior takes a short history, his hands none, his outline all of it (canvas())
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec3 s=texture2D(tCur,vUv+vec2(x,y)*uTexel).rgb; vec2 d=vec2(x,y)+uJit; float k=exp(-4.5*dot(d,d));
          c+=s*k; ws+=k; lo=min(lo,s); hi=max(hi,s); }
        c/=ws; vec3 o=mix(clamp(texture2D(tHist,vUv).rgb,lo,hi),c,al);
        gl_FragColor=vec4(o+(fract(sin(dot(gl_FragCoord.xy+uSeed,vec2(12.9898,78.233)))*43758.5453)-.5)/255.,1.); }` }));
  const copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tCur: u.tCur }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D tCur;varying vec2 vUv;void main(){gl_FragColor=texture2D(tCur,vUv);}' }));
  // Phones: the resolved frame is shown through a 5-tap sharpen clamped to its own neighbourhood (no halos), the way Unreal
  // sharpens after TAA. The blind check against round 1 had the resolve winning edges (crisp 3/4) but losing texture: mulch,
  // turf and leaf clusters read "slightly smeared" (ground 0/4, trees 0/4). Drawn after the history is saved, so it never compounds.
  // The taps sit 2 px out, not 1: a 1 px Laplacian has its peak gain (2.6x) at the pixel grid's own frequency, so it blew
  // every near-Nyquist residue (the jersey knit, grass and leaf speckle, chain links, the last step of a silhouette) back up
  // into a hard pixel checker that critics read as "crisp hard-cut edges, stippled dots". At 2 px the gain is 1.4x on 4 px
  // texture detail (what the turf and bark carry), 1.2x at 8 px and exactly 1x at the pixel grid: texture sharp, edges as resolved.
  // Edges only, the same pass softens instead (r4 crisp: "hard one-pixel cut-out outline on the athlete's hair, ear and forearm,
  // stair-stepped flag pole, stepped long shadow diagonals"; Disc Golf Masters lands a silhouette over 3-4 px). A silhouette is
  // a strong step (.07+ luma) that survives a 2x2 box: the luma gradient of four 2x2 means 1.5 px out on the diagonals (bilinear
  // taps) carries most of the 2 px neighbourhood's range, where turf speckle, bark plates and leaf texture average away (ratio
  // < .5); and it is a contour, not a cluster: the same gradient 3 px either way along the edge still points across it with
  // most of the strength. That last test keeps leaf clumps, turf tufts and mulch out (their outlines turn every pixel or two),
  // so the athlete's outline and hair, the pole, trunks and the arch soften while foliage and ground keep their texture (cycle
  // 1's ungated ramp softened crown edges and moved twice the guard pixels). There the pixel blends toward a blur laid along
  // the edge (+-1, +-2 px: no stair steps) and across it (+-2, +-4 px: a ~4 px ramp), unsharpened. Guard view (1280 x 720):
  // ~4% of pixels move more than 8/255, all on outlines. r4's global wider resolve won crisp but softened turf and leaves (ground 0/4, trees 0/4).
  // Then the athlete's outline, which the luma gate mostly misses (his hair against mid-tone trees, the forearm against turf:
  // r3 crisp 0/4, "the athlete looks pasted in, a hard one-pixel outline round the hair, ear, neck, shoulder and arm"). Every
  // athlete surface tags its pixels in the stencil (ATHLETE_STENCIL, main.js); canvas() turns that into a coverage mask (the
  // multisampled stencil test resolves to sub-pixel coverage), so the band is his silhouette against the scene and nothing
  // else: no turf, bark, leaf or jersey texture. There the pixel blends toward a blur across the outline (+-1.5..4.5 px) and a
  // little along it, peaking on the outline and gone three pixels either side: a ~5 px ramp, the way Disc Golf Masters' player
  // sits in its frame. Interior outlines (the arm over the torso) stay crisp, as in the reference.
  const sharpen = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tCur: u.tCur, tMask: u.tMask, uTexel: u.uTexel }, vertexShader: VS, depthTest: false, depthWrite: false,
    defines: { DBG: String(typeof location !== 'undefined' && /[?&]edgedbg/.test(location.search)) },   // QA: ?edgedbg shows the soften mask in white
    fragmentShader: `uniform sampler2D tCur,tMask;uniform vec2 uTexel;varying vec2 vUv;
      vec2 M(vec2 o){ return texture2D(tMask,vUv+o*uTexel).rg; }
      vec3 T(vec2 o){ return texture2D(tCur,vUv+o*uTexel).rgb; } float L(vec3 c){ return dot(c,vec3(.299,.587,.114)); }
      vec2 G(vec2 p){ float a=L(T(p+vec2(-1.5))),b=L(T(p+vec2(1.5,-1.5))),f=L(T(p+vec2(-1.5,1.5))),g=L(T(p+vec2(1.5))); return vec2(b+g-a-f,f+g-a-b)*.5; }
      void main(){
      vec3 c=T(vec2(0.)),n=T(vec2(0.,2.)),s=T(vec2(0.,-2.)),e=T(vec2(2.,0.)),w=T(vec2(-2.,0.)),lo=min(c,min(min(n,s),min(e,w))),hi=max(c,max(max(n,s),max(e,w)));
      vec3 o=clamp(c+(4.*c-n-s-e-w)*.1,lo,hi);
      vec2 gr=G(vec2(0.)); float m=length(gr),k=smoothstep(.07,.16,m)*smoothstep(.5,.8,m/max(L(hi)-L(lo),1e-3));
      if(k>0.){ vec2 x=gr/m,t=vec2(-x.y,x.x),y=2.*x;
        k*=smoothstep(.45,.8,min(dot(G(3.*t),x),dot(G(-3.*t),x))/m);
        vec3 bl=c+T(t)+T(-t)+.5*(T(2.*t)+T(-2.*t))+2.*(T(y)+T(-y))+T(2.*y)+T(-2.*y);
        o=mix(o,bl/10.,k); }
      vec2 ma=M(vec2(-2.5)),mbb=M(vec2(2.5,-2.5)),mf=M(vec2(-2.5,2.5)),mg4=M(vec2(2.5));
      float a=ma.r,b=mbb.r,f=mf.r,g=mg4.r,mb=(a+b+f+g)*.25,ka=4.*mb*(1.-mb);   // 16 texels round the pixel: 1 on the outline, 0 three pixels out
      ka*=1.-.9*min(1.,(ma.g+mbb.g+mf.g+mg4.g)*.5);   // round his hands a tenth of the ramp: the full ~5 px one blurred the fist into a mitten (.5 kept a halo); MSAA still lands their edge over ~2 px
      if(ka>.02){ vec2 mg=vec2(b+g-a-f,f+g-a-b),x=1.5*mg/max(length(mg),1e-4),t=vec2(-x.y,x.x)/1.5;
        vec3 ab=.2*c+.15*(T(x)+T(-x))+.1*(T(2.*x)+T(-2.*x))+.05*(T(3.*x)+T(-3.*x))+.1*(T(t)+T(-t));
        o=mix(o,ab,ka*ka); }
      gl_FragColor=vec4(DBG?vec3(k,ka,0.):o,1.); }` }));
  // canvas(): the stencil-tagged athlete pixels drawn white over black, read back as the mask
  const tag = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'void main(){gl_FragColor=vec4(1.,0.,0.,1.);}', depthTest: false, depthWrite: false,
    stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: ATHLETE_STENCIL.stencilRef, stencilFuncMask: 1, stencilWriteMask: 0 }));
  const handTag = new FullScreenQuad(new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'void main(){gl_FragColor=vec4(1.);}', depthTest: false, depthWrite: false,
    stencilWrite: true, stencilFunc: THREE.EqualStencilFunc, stencilRef: HAND_STENCIL.stencilRef, stencilWriteMask: 0 }));
  const black = new THREE.Color(0), clear = new THREE.Color();
  const lastW = new THREE.Matrix4(), lastP = new THREE.Matrix4(), held = new THREE.Matrix4(), size = new THREE.Vector2();
  // A putt (ease: its swipe, windup and flight under the locked lens) no longer drops to the raw MSAA frame: the whole frame
  // snapped from resolved and sharpened to raw as the swipe began (21% of pixels moved > 8/255 in that one frame, r4 putt
  // clip). The history hands over to the live frame over FADE frames, unjittered, then the frame keeps the resolve's filter
  // and the sharpen with no history, so nothing moving can streak. Costs what the aim frame before it did. FADE is 3 because
  // the hand-over has to end before the body moves: over 12 (5) frames the history still held 75% (40%) four (three) frames
  // in and doubled the jersey lettering on a player's own 150 ms (83 ms) putt swipe at 60 fps; 3 is clean on both and still
  // splits the step into three of under 10%. Every other throw drops the history at once: a drive's windup turns the whole
  // body to the lens (the 12-frame hand-over doubled the face, the number and the arm, r4 verify), and a live resolve kept
  // through it only moved the snap to the flight camera's first move.
  const FADE = 3;
  let n = 0, fade = 0, w = 0, h = 0, cur = null, hist = null, mask = null;
  const draw = (renderer, quad) => { const auto = renderer.autoClear; renderer.autoClear = false; quad.render(renderer); renderer.autoClear = auto; };
  const t = {
    get frames() { return n; },
    // Call with the frame's final, unjittered camera; hold false drops the history (fast action in front of a held camera),
    // unless ease (a putt): then it hands over to the live frame (see FADE).
    // Returns true when the camera holds still: the frame is jittered (or live, see FADE) and goes through the resolve.
    begin(renderer, camera, hold = true, ease = false) {
      renderer.getDrawingBufferSize(size); camera.updateMatrixWorld();
      const steady = size.x === w && size.y === h && !moved(camera.matrixWorld.elements, lastW.elements) && !moved(camera.projectionMatrix.elements, lastP.elements);
      w = size.x; h = size.y; lastW.copy(camera.matrixWorld); lastP.copy(camera.projectionMatrix);
      if (hold && steady) { n++; fade = 0; } else if (ease && steady && n) { n++; fade = Math.min(fade + 1, FADE); } else n = fade = 0;
      if (!n) return false;
      const [jx, jy] = fade ? [0, 0] : JITTER[n % JITTER.length], e = camera.projectionMatrix.elements; held.copy(camera.projectionMatrix);
      e[8] += jx * 2 / w; e[9] += jy * 2 / h; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      u.uTexel.value.set(1 / w, 1 / h); u.uJit.value.set(jx, jy); u.uSeed.value = n % 97;
      u.uAlpha.value = n === 1 ? 1 : Math.max(1 / n, .1, fade && 1 / (FADE + 1 - fade));   // the hand-over takes an even share of the history each frame (a linear ramp left most of it to the last two)
      return true;
    },
    end(camera) { if (!n) return; camera.projectionMatrix.copy(held); camera.projectionMatrixInverse.copy(held).invert(); },
    // Desktop's composer pass: current (display space) and history textures in, the resolved frame into the bound target.
    resolve(renderer, curTex, histTex) { u.tCur.value = curTex; u.tHist.value = histTex; draw(renderer, resolve); },
    copy(renderer, tex) { u.tCur.value = tex; draw(renderer, copy); },
    // Mobile: the frame was drawn straight to the canvas. Copy it out, resolve back over it, keep the result as history.
    // Three RGB8 textures at the drawing-buffer size (the canvas is RGB: alpha false), four full-screen passes (the athlete and
    // hand tags, stencil-culled to his pixels; resolve; sharpen), four blits. Linear
    // filtering: the sharpen's edge taps sit between texels; every other tap lands on a texel centre, where it reads the same.
    canvas(renderer) {
      if (!cur || cur.image.width !== w || cur.image.height !== h) {
        cur?.dispose(); hist?.dispose(); mask?.dispose(); u.uAlpha.value = 1;
        cur = new THREE.FramebufferTexture(w, h); hist = new THREE.FramebufferTexture(w, h); mask = new THREE.FramebufferTexture(w, h);
        for (const x of [cur, hist, mask]) Object.assign(x, { format: THREE.RGBFormat, internalFormat: 'RGB8', minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });   // copyTexSubImage2D may only drop channels, never add alpha
      }
      // The athlete's interior takes a short history: his idle arms and hands move every frame and skinned meshes carry no motion
      // vectors, so the running mean dragged them into a smear the colour box could not reject (g11 athlete: "arms and hands
      // soft, smeared, blurred mush next to his sharp face"). With none, his shirt showed one frame's single sample per pixel
      // beside a supersampled scene (g19 crisp: "grainy high-frequency speckle on the jersey shoulder and upper arm"): each
      // frame now takes at least a third (about three frames' mean, too short to drag the idle sway), his hands still none. His outline keeps it: with one frame's MSAA the hand and forearm
      // against the grass stepped in hard facets (g13 crisp 0/4: "hard, faceted stair-steps", "a sticker cut-out edge"), and a
      // spatial band could not match the jittered supersample (g14: "the previous build's hair and shoulder blend more softly").
      // So his mask comes first (R all of him, his hands too; G his hands): clear colour only, the stencil keeps his tags. The
      // resolve reads it 1.5 px out on the diagonals (bilinear: the 4x4 texels round the pixel) and drops the history only
      // where all of them are his, so a ~2 px band inside his silhouette, and every scene pixel, accumulates as before.
      renderer.copyFramebufferToTexture(cur);
      renderer.getClearColor(clear); const ca = renderer.getClearAlpha(); renderer.setClearColor(black, 1); renderer.clear(true, false, false); renderer.setClearColor(clear, ca);
      draw(renderer, tag); draw(renderer, handTag); renderer.copyFramebufferToTexture(mask);
      u.tMask.value = mask; u.uMask.value = 1; t.resolve(renderer, cur, hist); u.uMask.value = 0;
      renderer.copyFramebufferToTexture(hist);
      u.tCur.value = hist; draw(renderer, sharpen);
    },
    dispose() { cur?.dispose(); hist?.dispose(); mask?.dispose(); cur = hist = mask = null; },
  };
  return t;
}
