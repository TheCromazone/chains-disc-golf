// Blade carpet: short turf blades around the camera. Clumps are scattered once over square tiles of ground that wrap
// around a point ahead of the camera, so a root that leaves one side of its tile re-enters on the other while its height
// is zero: blades are fixed to the world and never swim or pop. Full runs two tiles (dense to ~7 m, sparse to ~17 m),
// Lite one small tile of single-triangle blades. The vertex shader roots every blade on the terrain's own triangles (a
// float texture of the mesh heights, split like PlaneGeometry) and reads the ground there (the palette, fairway weight
// and splat weights the terrain shader uses, through GROUND_GLSL), so blades carry the ground's colour, stripes and
// straw, stand taller in the rough, and thin out into gravel, litter, sand and the tee pads. The camera is read in
// onBeforeRender, so the only per-frame CPU work is two uniforms.
import * as THREE from 'three';
import { windTime, windVec, GROUND_GLSL } from './materials.js';

export function grassCarpet({ W, H, segX, segZ, pos, colors, splats, turf, pads, lite, seed = 1 }) {
  const nx = segX + 1, nz = segZ + 1, n = nx * nz, f = x => x.toFixed(6);
  const hgt = new Float32Array(n * 4), zone = new Uint8Array(n * 4), spl = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    hgt[i * 4] = pos.getY(i); hgt[i * 4 + 1] = turf[i * 4 + 1]; hgt[i * 4 + 2] = turf[i * 4 + 2]; hgt[i * 4 + 3] = turf[i * 4 + 3];   // height, stripe coordinate, trail offset and wear
    for (let k = 0; k < 3; k++) zone[i * 4 + k] = Math.round(Math.sqrt(Math.min(1, colors[i * 3 + k])) * 255);   // sqrt: finer 8-bit steps where turf albedos live
    zone[i * 4 + 3] = Math.round(turf[i * 4] * 255);
    for (let k = 0; k < 4; k++) spl[i * 4 + k] = Math.round(Math.min(1, splats[i * 4 + k]) * 255);
  }
  const data = (a, type, filter) => { const t = new THREE.DataTexture(a, nx, nz, THREE.RGBAFormat, type); t.minFilter = t.magFilter = filter; t.needsUpdate = true; return t; };
  const maps = [data(hgt, THREE.FloatType, THREE.NearestFilter), data(zone, THREE.UnsignedByteType, THREE.LinearFilter), data(spl, THREE.UnsignedByteType, THREE.LinearFilter)];

  // One clump: single-triangle blades 6-10 cm tall (scaled per clump in the shader) spread over a 12 cm disc, so
  // neighbouring clumps overlap into an even carpet instead of reading as tufts. A 20 px blade barely shows curvature,
  // and one triangle per blade buys three times the blades.
  let s = seed >>> 0 || 1; const rnd = () => (s = Math.imul(s, 1664525) + 1013904223 >>> 0) / 4294967296;
  const B = lite ? 5 : 34, P = [], S = [], N = [], U = [];
  for (let b = 0; b < B; b++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * .12, x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const h = .1 * (.45 + rnd() * .55), w = .0035 + rnd() * .003, fa = rnd() * 3.1416, fx = Math.cos(fa), fz = Math.sin(fa);
    const la = rnd() * 6.283, lean = h * (.12 + rnd() * .5), j = rnd();
    for (const sg of [-1, 1]) { P.push(x0, 0, z0); S.push(fx * w * sg, fz * w * sg); N.push(-fz, 0, fx); U.push(0, j); }
    P.push(x0 + Math.cos(la) * lean, h, z0 + Math.sin(la) * lean); S.push(0, 0); N.push(-fz, 0, fx); U.push(1, j);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(S, 2)); geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(U, 2));
  // Tiles: [size m, anchor distance ahead of the camera m, thinning from, gone at (m from the eye), roots per side].
  // Each clump drops out at its own random distance inside the thinning band, so density falls off smoothly instead of
  // stepping at a fade line; the far tile's clumps spread twice as wide (its spacing is three times the near one's).
  const layers = lite ? [[8, 3.2, 3, 5.8, 22]] : [[11, 4.5, 3.5, 8.5, 80], [34, 14, 9, 19, 60], [76, 39, 24, 62, 80], [130, 66, 55, 95, 48]], roots = [];
  layers.forEach(([, , , , m], l) => { for (let i = 0; i < m; i++) for (let k = 0; k < m; k++) roots.push((i + rnd()) / m, (k + rnd()) / m, rnd(), l); });
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 4)); geo.instanceCount = roots.length / 4;

  const eye = new THREE.Vector3(), fwd = new THREE.Vector2(0, 1), dir = new THREE.Vector3();
  const uniforms = { gHeight: { value: maps[0] }, gZone: { value: maps[1] }, gSplat: { value: maps[2] }, gEye: { value: eye }, gFwd: { value: fwd },
    gLayer: { value: layers.map(([L, a, f0, f1]) => new THREE.Vector4(L, a, f0, f1)) }, gPads: { value: pads.map(p => new THREE.Vector4(...p)) }, windTime, windVec };
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = `${lite ? '#define GROUND_LITE\n' : ''}attribute vec4 aRoot;attribute vec2 aSide,aBlade;uniform sampler2D gHeight,gZone,gSplat;uniform vec3 gEye;uniform vec2 gFwd;
      uniform vec4 gLayer[${layers.length}],gPads[${pads.length}];uniform float windTime;uniform vec2 windVec;varying vec3 vBlade;varying float vTip;${GROUND_GLSL}
      vec4 gHeightAt(vec2 p,out vec3 n){   // the terrain mesh's own triangles: PlaneGeometry splits each cell along b-d
        vec2 g=(p+vec2(${f(W / 2)},${f(H / 2)}))*vec2(${f(segX / W)},${f(segZ / H)}),c=clamp(floor(g),vec2(0.),vec2(${f(segX - 1)},${f(segZ - 1)})),q=g-c;ivec2 i=ivec2(c);
        vec4 a=texelFetch(gHeight,i,0),b=texelFetch(gHeight,i+ivec2(0,1),0),cc=texelFetch(gHeight,i+ivec2(1,1),0),d=texelFetch(gHeight,i+ivec2(1,0),0);
        vec4 h;vec2 grad;
        if(q.x+q.y<1.){h=a+(d-a)*q.x+(b-a)*q.y;grad=vec2(d.x-a.x,b.x-a.x);}else{h=cc-(cc-b)*(1.-q.x)-(cc-d)*(1.-q.y);grad=vec2(cc.x-b.x,cc.x-d.x);}
        grad*=vec2(${f(segX / W)},${f(segZ / H)});n=normalize(vec3(-grad.x,1.,-grad.y));return h;
      }
      void gBlade(out vec3 bladePos,out vec3 bladeNormal){
        vec4 L=gLayer[int(aRoot.w)];vec2 anchor=gEye.xz+gFwd*L.y,rel=aRoot.xy*L.x-anchor;rel-=L.x*floor(rel/L.x+.5);vec2 root=anchor+rel;
        float drop=L.z+(L.w-L.z)*fract(aRoot.z*3.71);   // this clump's own fade distance
        bladeNormal=vec3(0.,1.,0.);vBlade=vec3(0.);vTip=0.;
        if(distance(root,gEye.xz)>drop+.6||max(abs(rel.x),abs(rel.y))>L.x*.5-.02){bladePos=vec3(root.x,-1e3,root.y);return;}   // gone: a zero-area triangle, no fetches
        vec3 gn;vec4 ga=gHeightAt(root,gn);float dCam=distance(vec3(root.x,ga.x,root.y),gEye);
        float k=smoothstep(drop+.6,drop,dCam)*(aRoot.w>2.5?smoothstep(42.,54.,dCam):aRoot.w>1.5?smoothstep(13.,18.,dCam):1.)*smoothstep(L.x*.5,L.x*.5-.8,max(abs(rel.x),abs(rel.y)));   // zero at the wrap edge: roots jump unseen
        vec2 guv=(root+vec2(${f(W / 2)},${f(H / 2)}))*vec2(${f(segX / W / nx)},${f(segZ / H / nz)})+vec2(${f(.5 / nx)},${f(.5 / nz)});
        vec4 zf=texture2D(gZone,guv),sp=texture2D(gSplat,guv);float br=gBreak(root);vec3 cov=gCover(sp,ga.zw,br);
        float through=step(.9,fract(aRoot.z*7.7));   // one clump in ten pushes up through the litter, ragged
        float grow=1.-max(max(cov.x,cov.y),cov.z*(1.-through));
        for(int i=0;i<${pads.length};i++){vec2 d=root-gPads[i].xy;vec2 q=vec2(d.x*gPads[i].z-d.y*gPads[i].w,d.x*gPads[i].w+d.y*gPads[i].z);grow*=smoothstep(.05,.3,max(abs(q.x)-.8,abs(q.y)-1.6));}
        vec2 spot=gSpot(root,gEdge(sp.x,ga.zw));grow*=1.-spot.x*.92;   // bare scuffs keep only a few blades; clover mats hold them low
        float keep=${lite ? '1.' : 'mix(.55,1.,fract(aRoot.z*23.9))'}*mix(1.,.5,through*cov.z);   // each clump drops its own subset of blades: no two share a silhouette
        float sc=k*step(mix(.06,.5,fract(aRoot.z*5.3)),grow)*step(fract(aBlade.y*13.1+aRoot.z*7.3),keep),fair=zf.a,cl=gNoise(root*.8+3.)*.6+gNoise(root*2.9+7.)*.4;   // each clump gives up at its own point of the thinning into path, gravel and litter: a ragged edge of whole tufts, not a fade
        float hs=mix(.9+cl*.8,.55+cl*.4,fair)*(.8+.4*fract(aRoot.z*13.7))*sc;   // x the 4.5-10 cm blades, in 0.3-1 m clumps: rough 3-17 cm, fairway 2-9 cm
        hs*=1.+(1.-smoothstep(.5,.9,grow))*(.6+cl*1.4);
        hs*=mix(1.1,.7,gThin(root))*(1.-spot.y*.55);   // thin patches stand lower as well as paler   // the fringe a mower misses stands taller: tufts to 40 cm along every trail, apron and bed edge
        float yaw=aRoot.z*6.2832,cs=cos(yaw),sn=sin(yaw);mat2 R=mat2(cs,sn,-sn,cs);
        vec3 bp=position*vec3(1.,hs,1.);bp.xz=R*(position.xz*(1.+aRoot.w)+aSide*max(1.,dCam/6.)*mix(.4,1.,sc));   // far blades widen to stay a pixel wide
        float t=aBlade.x,t2=t*hs,gust=.55+.45*sin(windTime*3.1+root.x*.31-root.y*.27);
        bp.x+=(sin(windTime*1.7+root.x*.5+root.y*.3)*.012+windVec.x*.04*gust)*t2;bp.z+=(cos(windTime*1.3+root.y*.4)*.008+windVec.y*.04*gust)*t2;
        bladePos=vec3(root.x,ga.x-.01,root.y)+bp*step(.001,sc);   // a dropped blade collapses to a point
        vec2 bn=R*normal.xz;bladeNormal=normalize(gn+vec3(bn.x,0.,bn.y)*.12);   // a low sun would black out blades tilted away; thin blades pass light anyway
        vec3 c=gTurf(root,zf.rgb*zf.rgb,vec2(fair,ga.y),gDry(sp.w,br))*(.8+.4*fract(aRoot.z*91.7+aBlade.y*7.3));
        c=max(mix(vec3(dot(c,vec3(.3,.59,.11))),c,1.15),0.);   // live blades richer than the turf's average, which includes soil and thatch
        c*=mix(vec3(.9,1.,1.02),vec3(1.12,1.05,.76),fract(aRoot.z*57.3));
        c=mix(c,dot(c,vec3(.3,.59,.11))*vec3(.62,1.02,.72),spot.y*.7);   // clumps range from green to yellow-green
        c=mix(c,dot(c,vec3(.3,.59,.11))*vec3(1.4,1.18,.62),step(.96,fract(aBlade.y*17.3+aRoot.z*5.1))*.6);   // one blade in 25 is dead straw
        float y=fract(aBlade.y*29.1+aRoot.z*3.3);y*=y;   // some tips yellow in the sun, most stay green
        vBlade=c*mix(.8,1.4,t)*mix(vec3(1.),vec3(1.14,1.07,.62),t*y);vTip=t;   // shaded at the root where neighbours crowd it, tips above the turf catch the sun
      }\n` + sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal,bladePos;gBlade(bladePos,objectNormal);').replace('#include <begin_vertex>', 'vec3 transformed=bladePos;');
    sh.fragmentShader = 'varying vec3 vBlade;varying float vTip;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb=vBlade;')
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))   // both faces keep the ground-leaning normal
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        { float back=pow(saturate(dot(-normalize(vViewPosition),directionalLights[0].direction)),4.);   // back-lit tips glow (thin-blade transmission)
          reflectedLight.directDiffuse+=diffuseColor.rgb*directLight.color*back*vTip*.28; }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'chains-grass-' + lite;
  const dispose = mat.dispose.bind(mat); mat.dispose = () => { dispose(); maps.forEach(t => t.dispose()); };
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = true;
  mesh.onBeforeRender = (r, sc, cam) => { cam.getWorldPosition(eye); cam.getWorldDirection(dir); if (Math.hypot(dir.x, dir.z) > .05) fwd.set(dir.x, dir.z).normalize(); };
  return mesh;
}
