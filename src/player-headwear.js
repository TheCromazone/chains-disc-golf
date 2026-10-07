import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { model } from './models.js';

// Hat hair (tools/build-headwear.py, node hw_<fig>_tuck): per direction from his skull centre, the radius his locks are
// pulled down to while a covering hat is on; decoded once per figure into a half-float texture for body-material.js.
const tucks = new Map();
function tuckField(fig) {
  const hats = model('headwear'); if (!hats) return null;
  if (!tucks.has(fig)) {
    const raw = hats.scene.getObjectByName(`hw_${fig}_tuck`)?.userData.tuck, t = raw && JSON.parse(raw);
    let field = null;
    if (t) {
      const bytes = Uint8Array.from(atob(t.r), c => c.charCodeAt(0)), radii = new Uint16Array(bytes.buffer), half = new Uint16Array(radii.length);
      for (let i = 0; i < radii.length; i++) half[i] = THREE.DataUtils.toHalfFloat(radii[i] / 1e5);
      const texture = new THREE.DataTexture(half, t.nphi, t.nth, THREE.RedFormat, THREE.HalfFloatType);
      texture.wrapS = THREE.RepeatWrapping; texture.magFilter = texture.minFilter = THREE.LinearFilter; texture.needsUpdate = true;
      field = { texture, centre: t.c, keep: t.keep };
    }
    tucks.set(fig, field);
  }
  return tucks.get(fig);
}

// Closed, fitted headwear replaces cut-up scan shells; natural source hair stays.
// Coordinates below are in the model's bind space, then mounted to the head bone.
export function createPlayerHeadwear(head, skin, spec, avatar, lod) {
  const bone = skin.skeleton.bones.indexOf(head), bind = new THREE.Matrix4().copy(skin.skeleton.boneInverses[bone]).invert();
  const centre = new THREE.Vector3(...spec.headCentre), radii = new THREE.Vector3(...spec.headRadii), eye = spec.eyeY - .018;
  const origin = new THREE.Vector3().setFromMatrixPosition(bind), group = new THREE.Group(); group.name = 'fitted_player_headwear'; group.position.copy(origin).multiplyScalar(-1); head.add(group);
  const geometries = new Set(), materials = new Set();
  const material = (color, roughness=.8) => { const m = new THREE.MeshStandardMaterial({color,roughness});materials.add(m);return m; };
  const hatMat=material(avatar.headwearColor,.88),frameMat=material('#171d25',.38),lensMat=material('#172431',.2);lensMat.metalness=.12;
  const add = (geo,mat,name) => {if(!mat.vertexColors)geo.deleteAttribute('color');geometries.add(geo);const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const sphere = (pos,scale,mat,name) => {const g=new THREE.SphereGeometry(1,lod?16:28,lod?10:16);g.scale(...scale);g.translate(...pos);return add(g,mat,name);};
  const segments=lod?28:48,rings=lod?10:18;
  function dome(rx,ry,rz,baseY,topY) {
    const p=[],uv=[],index=[];
    for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
      const phi=i/segments*Math.PI*2;
      const line=baseY;
      const cy=topY-ry,maxTheta=Math.acos(THREE.MathUtils.clamp((line-cy)/ry,-.97,.97)),theta=j/rings*maxTheta;
      const radius=Math.sqrt(Math.sin(theta));
      p.push(centre.x+rx*radius*Math.cos(phi),cy+ry*Math.cos(theta),centre.z+rz*radius*Math.sin(phi));uv.push(i/segments,j/rings);
    }
    for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;index.push(a,b,c,b,d,c);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(index);geo.computeVertexNormals();const normal=geo.attributes.normal;for(let i=0;i<normal.count;i++)if(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))<1e-6)normal.setXYZ(i,0,1,0);return geo;
  }
  function band(y,height,rx,rz,mat,name){const g=new THREE.CylinderGeometry(1,1,height,segments,1,true);g.scale(rx,1,rz);g.translate(centre.x,y,centre.z);return add(g,mat,name);}
  function brim(y,back=false){const z=centre.z+(back?1:-1)*(radii.z+.036),rx=radii.x+.018;const g=new THREE.SphereGeometry(1,lod?24:40,8);g.scale(rx,.0035,.084);g.translate(centre.x,y,z);return add(g,hatMat,'cap_brim');}
  const hat=avatar.headwear||'none',covered=['cap','backcap','beanie','bucket'].includes(hat);
  // Blender-fitted hats (tools/build-headwear.py): grown on this figure's own skull and hair, AO in the vertex colours,
  // already in bind space. The procedural set below stays as the fallback until the file has loaded.
  const fitted=hat!=='none'&&model('headwear')?.scene.getObjectByName(`hw_${avatar.figure==='female'?'f':'m'}_${hat}`);
  // A covering fitted hat was grown on hat hair, so it hands the body its tuck field (the visor and headband show the locks).
  const tuck=fitted?.isMesh&&covered?tuckField(avatar.figure==='female'?'f':'m'):null;
  if(fitted?.isMesh){const g=fitted.geometry.clone();g.applyMatrix4(fitted.matrixWorld);if(!g.attributes.normal)g.computeVertexNormals();const m=material(avatar.headwearColor,.86);m.vertexColors=!!g.attributes.color;add(g,m,'fitted_'+hat);}
  else if(hat!=='none'){
    const y=eye+.048,rx=radii.x+.015,rz=radii.z+.02;
    if(covered){add(dome(rx,radii.y*.72,rz,y,centre.y+radii.y+.025+(hat==='beanie'?.018:0)),hatMat,'hat_crown');band(y+.007,hat==='beanie'?.035:.016,rx*1.008,rz*1.008,hatMat,'hat_band');}
    else band(y,.024,rx,rz,hatMat,'hat_band');
    if(['cap','backcap','visor'].includes(hat))brim(y+.004,hat==='backcap');
    if(hat==='cap'||hat==='backcap')sphere([centre.x,centre.y+radii.y+.027,centre.z],[.008,.0035,.008],hatMat,'cap_button');
    if(hat==='bucket'){const g=new THREE.RingGeometry(1,1.35,segments);g.rotateX(-Math.PI/2);g.scale(rx,1,rz);g.translate(centre.x,y-.007,centre.z);const m=hatMat.clone();m.side=THREE.DoubleSide;materials.add(m);add(g,m,'bucket_brim');}
    // Thin sewn panels follow the dome instead of separate floating trim.
    if(covered){const seamMat=material(avatar.headwearColor,.95);seamMat.color.multiplyScalar(.84);for(let s=0;s<6;s++){const phi=s*Math.PI/3,pts=[];const top=centre.y+radii.y+.025+(hat==='beanie'?.018:0),ry=radii.y*.72,cy=top-ry,max=Math.acos(THREE.MathUtils.clamp((y-cy)/ry,-1,1));for(let k=1;k<=12;k++){const t=k/12*max,r=Math.sqrt(Math.sin(t));pts.push(new THREE.Vector3(centre.x+(rx+.0007)*r*Math.cos(phi),cy+ry*Math.cos(t)+.0007,centre.z+(rz+.0007)*r*Math.sin(phi)));}add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),12,.00065,3,false),seamMat,'cap_seam');}}
  }
  // Lens surfaces stand vertically over the eyes; the scan's old sport shield
  // was a horizontal ellipsoid that read as a floating black blade.
  const glasses=[],styles=['round','square','sport'];
  for(const style of styles){const parts=[];const lensParts=[];const ex=Math.min(.034,radii.x*.4),z=spec.faceZ+.008,lensEye=spec.eyeY-.012;
    for(const side of [-1,1]){const rx=style==='sport'?.027:.021,ry=style==='sport'?.014:style==='square'?.017:.021,shape=new THREE.Shape();shape.absellipse(0,0,rx,ry,0,Math.PI*2,false);const lens=new THREE.ShapeGeometry(shape,24);lens.rotateY(Math.PI-side*.16);lens.translate(centre.x+side*ex,lensEye,z);if(style==='sport')lensParts.push(lens);else{const pts=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;pts.push(new THREE.Vector3(centre.x+side*ex+Math.cos(a)*rx,lensEye+Math.sin(a)*ry,z));}parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),32,.0018,6,false));}
    const earX=centre.x+side*(radii.x+.002);parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(centre.x+side*(ex+rx),lensEye,z),new THREE.Vector3(earX,lensEye+.002,centre.z-.03),new THREE.Vector3(earX,lensEye-.012,centre.z+.035)]),10,.0018,6,false));}
    parts.push(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(centre.x-.014,lensEye+.002,z),new THREE.Vector3(centre.x+.014,lensEye+.002,z)),2,.0018,6,false));
    const frame=add(mergeGeometries(parts),frameMat,'fitted_glasses_'+style);parts.forEach(g=>g.dispose());glasses.push([style,frame]);if(lensParts.length){const lens=add(mergeGeometries(lensParts),lensMat,'sport_lenses');lensParts.forEach(g=>g.dispose());glasses.push([style,lens]);}
  }
  // Merge permanent parts by material; a cap's six seams cost one draw.
  for(const mat of materials){const meshes=group.children.filter(m=>m.material===mat&&!glasses.some(([,g])=>g===m));if(meshes.length<2)continue;const combined=mergeGeometries(meshes.map(m=>m.geometry));if(!combined)continue;for(const m of meshes){group.remove(m);geometries.delete(m.geometry);m.geometry.dispose();}add(combined,mat,'fitted_headwear_parts');}
  const setFace=a=>{const style=a.glasses!==undefined?a.glasses:a.shades?'sport':'none';for(const [id,m]of glasses)m.visible=id===style;};setFace(avatar);
  return{setFace,tuck,dispose(){group.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
