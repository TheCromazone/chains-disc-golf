// One shared original atlas, five persistent decal planes. Choices only change UVs.
import * as THREE from 'three';
export const FACE_OPTIONS = {
  eyes: ['round', 'oval', 'happy', 'focused'], brows: ['soft', 'straight', 'arched', 'bold'],
  nose: ['dot', 'button', 'angle', 'round'], mouth: ['smile', 'grin', 'calm', 'open'],
  glasses: ['none', 'round', 'square', 'sport'],
};
export const FACE_DEFAULTS = { eyes: 'round', brows: 'soft', nose: 'button', mouth: 'smile', glasses: 'none' };
let atlas = null;
export function setFaceAtlas(texture) { atlas = texture; atlas.colorSpace = THREE.SRGBColorSpace; atlas.__shared = true; }
// The same deterministic paths compile into the on-disk PNG/KTX2. Canvas is the zero-asset fallback.
export function drawFaceAtlas(canvas) {
  canvas.width = canvas.height = 640; const c = canvas.getContext('2d');
  const line = (points, width=7) => { c.lineWidth=width;c.beginPath(); points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke(); };
  const oval = (x,y,rx,ry,fill=true) => { c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);fill?c.fill():c.stroke(); };
  Object.keys(FACE_OPTIONS).forEach((part,row)=>FACE_OPTIONS[part].forEach((id,col)=>{
    c.save();c.translate(col*128,row*128);c.fillStyle=c.strokeStyle='#292633';c.lineCap=c.lineJoin='round';c.lineWidth=7;
    if(part==='eyes') for(const x of [35,93]) {
      if(id==='happy'){c.beginPath();c.arc(x,70,13,Math.PI,Math.PI*2);c.stroke();}
      else {oval(x,64,id==='focused'?14:11,id==='oval'?22:id==='focused'?8:16); c.fillStyle='white';oval(x-3,58,3,4);c.fillStyle='#292633';}
    }
    if(part==='brows')for(const [x,dir] of [[35,-1],[93,1]]) {
      if(id==='arched'){c.beginPath();c.moveTo(x-18,70);c.quadraticCurveTo(x,48,x+18,65);c.stroke();}
      else line([[x-17,64+(id==='soft'?dir*3:0)],[x+17,64-(id==='soft'?dir*3:0)]],id==='bold'?12:7);
    }
    if(part==='nose') {
      c.strokeStyle=c.fillStyle='#a2644b';
      if(id==='dot')oval(64,64,7,6);
      if(id==='button'){c.beginPath();c.arc(64,64,11,0,Math.PI);c.stroke();}
      if(id==='angle')line([[66,49],[55,70],[69,70]],5);
      if(id==='round'){oval(64,64,13,10,false);}
    }
    if(part==='mouth') {
      c.fillStyle=c.strokeStyle='#843f3f';
      if(id==='smile'){c.beginPath();c.moveTo(38,54);c.quadraticCurveTo(64,88,90,54);c.stroke();}
      if(id==='grin'){c.beginPath();c.moveTo(34,50);c.lineTo(94,50);c.quadraticCurveTo(64,104,34,50);c.fill();c.fillStyle='white';c.fillRect(42,53,44,10);}
      if(id==='calm')line([[44,64],[84,64]],6);
      if(id==='open')oval(64,64,13,19);
    }
    if(part==='glasses' && id!=='none') {
      for(const x of [34,94]) {
        if(id==='round')oval(x,64,24,27,false);
        else {c.beginPath();c.roundRect(x-25,41,50,45,9);id==='sport'?c.fill():c.stroke();}
      }
      line([[58,60],[70,60]],6);
    }
    c.restore();
  }));
  return canvas;
}
function getAtlas() {
  if(!atlas){atlas=new THREE.CanvasTexture(drawFaceAtlas(document.createElement('canvas')));atlas.colorSpace=THREE.SRGBColorSpace;atlas.__shared=true;}
  return atlas;
}
export function createFaceParts(head, avatar, { centerY=.23, radius=.255 }={}) {
  const group=new THREE.Group();group.name='face_decals';head.add(group);
  // Broad decals stay forward of the round head. Unlit ink is legible in every light.
  const dimensions={ eyes:[.36,.20,.045], brows:[.38,.12,.115], nose:[.13,.12,-.017], mouth:[.24,.15,-.105], glasses:[.41,.19,.045] };
  const parts={};
  Object.keys(FACE_OPTIONS).forEach((part,row)=>{
    const [w,h,y]=dimensions[part];const geometry=new THREE.PlaneGeometry(w,h,12,8);
    const position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){const x=position.getX(i),py=position.getY(i)+y;position.setZ(i,Math.sqrt(Math.max(.01,1-(x/.275)**2-(py/.295)**2))*radius+.003+row*.0005);}
    geometry.computeVertexNormals();
    const mat=new THREE.MeshBasicMaterial({map:getAtlas(),transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false});
    const mesh=new THREE.Mesh(geometry,mat);mesh.name='face_'+part;mesh.rotation.y=Math.PI;mesh.position.set(0,centerY+y,0);mesh.renderOrder=5+row;group.add(mesh);parts[part]=mesh;
  });
  const setFace = value => Object.keys(parts).forEach((part,row)=>{
    let id=value[part] || (part==='glasses' && value.shades?'sport':FACE_DEFAULTS[part]);
    const col=Math.max(0,FACE_OPTIONS[part].indexOf(id));const uv=parts[part].geometry.attributes.uv;
    // Plane's four UV corners address the tile without changing its mesh or material.
    const u0=(col*128+1)/640,u1=((col+1)*128-1)/640,v0=1-((row+1)*128-1)/640,v1=1-(row*128+1)/640;
    const compressed=parts[part].material.map.isCompressedTexture;
    for(let i=0;i<uv.count;i++){const x=i%13,y=Math.floor(i/13),v=v1-(v1-v0)*y/8;uv.setXY(i,u0+(u1-u0)*x/12,compressed?1-v:v);}uv.needsUpdate=true;
    parts[part].visible=part!=='glasses'||id!=='none';
  });
  setFace(avatar);
  return { group,parts,setFace,dispose(){for(const mesh of Object.values(parts)){mesh.geometry.dispose();mesh.material.dispose();}group.removeFromParent();} };
}
