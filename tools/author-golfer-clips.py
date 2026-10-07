"""Blender-author 32 positive-scale clips (16 motions x two hands) on the athlete v3 rig; never rebuild body/LOD here.
Run node tools/extract-poses.mjs, then blender -b -P tools/author-golfer-clips.py.
Source becomes art/blender/golfer-motion-r6.blend; runtime files contain no mesh.
"""
from pathlib import Path
import bpy, json, copy, math
from mathutils import Quaternion, Vector
ROOT=Path(__file__).resolve().parents[1]
RIGSPEC=json.loads((ROOT/'tools/golfer-rig.json').read_text());GR=RIGSPEC['ground']
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'art/blender/golfer-v3-source.blend'))
rig=bpy.data.objects['ChainsRig'];rig.animation_data_clear()
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
data=json.loads((ROOT/'tools/poses.json').read_text());idle=data['idle'];joints=data['joints'];clips=data['throws']
def key(t,**kw):return dict(t=t,**kw)
clips['idle']=[key(0),key(.16,root=[0,0,.008],spine=[.052,-.01,-.008],elR=[.52,0,0]),key(.32,head=[.01,.06,0],shL=[.17,0,-.2]),key(.5,root=[0,0,-.008],spine=[.03,.012,.008],head=[-.008,.04,0]),key(.68,head=[.006,-.05,0],elL=[.42,0,0]),key(.84,spine=[.052,0,-.005]),key(1)]
clips['practice']=[key(0),key(.18,root=[-.04,.18,0],spine=[-.06,.2,0],shR=[.65,.25,.15],elR=[1.25,0,0]),key(.38,root=[-.06,.5,0],spine=[-.08,.4,.03],shR=[.4,1.2,.65],elR=[.5,0,0]),key(.55,root=[-.04,.24,0],spine=[-.08,.3,0],shR=[.9,.5,.8],elR=[1.45,0,0]),key(.7,root=[-.04,-.2,0],spine=[-.04,-.15,0],shR=[1.2,.7,.75],elR=[.35,0,0]),key(.85,root=[0,-.18,0],shR=[.8,.6,.4],elR=[.6,0,0]),key(1)]
clips['celebrate']=[key(0),key(.13,spine=[-.06,0,0],shR=[.65,0,.15],elR=[1.8,0,0],shL=[.12,0,-.15],elL=[.35,0,0]),key(.3,root=[0,-.10,-.025],spine=[-.02,-.12,.035],head=[.05,.10,0],shR=[1.65,0,.25],elR=[1.65,0,0],shL=[.15,0,-.18],elL=[.3,0,0]),key(.45,shR=[1.95,0,.25],elR=[1.1,0,0],shL=[.12,0,-.12],elL=[.3,0,0]),key(.62,root=[0,-.1,0],shR=[1.4,0,.2],elR=[1.7,0,0]),key(.82,shR=[.6,0,.15],elR=[1.0,0,0]),key(1)]
clips['slump']=[key(0),key(.2,spine=[-.14,0,0],head=[-.22,0,0],shR=[.06,0,.08],elR=[.22,0,0],shL=[.04,0,-.08],elL=[.2,0,0]),key(.55,spine=[-.18,0,0],head=[-.26,-.12,0]),key(.8,spine=[-.09,0,0],head=[-.1,-.04,0]),key(1)]
clips['walk']=[key(0,root=[0,.04,.015],hipR=[.32,0,0],knR=[-.18,0,0],hipL=[-.3,0,0],knL=[-.45,0,0],shR=[-.25,0,.12],shL=[.25,0,-.12]),key(.25,root=[0,0,-.015],hipR=[-.03,0,0],knR=[-.08,0,0],hipL=[.12,0,0],knL=[-.8,0,0],shR=[0,0,.12],shL=[0,0,-.12]),key(.5,root=[0,-.04,-.015],hipR=[-.3,0,0],knR=[-.45,0,0],hipL=[.32,0,0],knL=[-.18,0,0],shR=[.25,0,.12],shL=[-.25,0,-.12]),key(.75,root=[0,0,.015],hipR=[.12,0,0],knR=[-.8,0,0],hipL=[-.03,0,0],knL=[-.08,0,0],shR=[0,0,.12],shL=[0,0,-.12]),key(1,root=[0,.04,.015],hipR=[.32,0,0],knR=[-.18,0,0],hipL=[-.3,0,0],knL=[-.45,0,0],shR=[-.25,0,.12],shL=[.25,0,-.12])]
mirror={'shR':'shL','shL':'shR','elR':'elL','elL':'elR','hipR':'hipL','hipL':'hipR','knR':'knL','knL':'knR'}
def sample(keys,t,ground=True):
    n=0
    while n<len(keys)-2 and t>keys[n+1]['t']:n+=1
    h=keys[n+1]['t']-keys[n]['t'];u=(t-keys[n]['t'])/h
    def value(k,j,c):return keys[k].get('rootY',0) if j=='rootY' else keys[k].get(j,idle[j])[c]
    def tangent(k,j,c):
        if k==0 or k==len(keys)-1:return 0
        h0=keys[k]['t']-keys[k-1]['t'];h1=keys[k+1]['t']-keys[k]['t']
        d0=(value(k,j,c)-value(k-1,j,c))/h0;d1=(value(k+1,j,c)-value(k,j,c))/h1
        if d0*d1<=0:return 0
        w1=2*h1+h0;w2=h1+2*h0
        return (w1+w2)/(w1/d0+w2/d1)
    def interpolate(j,c):return (2*u*u*u-3*u*u+1)*value(n,j,c)+(u*u*u-2*u*u+u)*h*tangent(n,j,c)+(-2*u*u*u+3*u*u)*value(n+1,j,c)+(u*u*u-u*u)*h*tangent(n+1,j,c)
    out={j:[interpolate(j,i) for i in range(3)] for j in joints};out['rootY']=interpolate('rootY',0)
    def rotate(v,r):return (Quaternion((1,0,0),r[0]) @ Quaternion((0,1,0),r[1]) @ Quaternion((0,0,1),r[2])) @ Vector(v)
    heights=[]
    for side in ['R','L']:
        hip=out['hip'+side];kn=out['kn'+side];root=out['root']
        def foot(v):return rotate(rotate(rotate(v,kn),hip),root)
        # Athlete v2 leg lengths (tools/golfer-rig.json) so every clip plants the sole on the floor for this rig.
        knee=rotate((0,-GR['thigh'],0),hip);sole=rotate(rotate(tuple(GR['sole']),kn),hip)
        center=rotate(((1 if side=='R' else -1)*GR['hipX']+knee.x+sole.x,-GR['hipDrop']+knee.y+sole.y,knee.z+sole.z),root)
        rx,ry,rz=GR['soleRadii'];radius=math.sqrt(sum(foot(v).y**2 for v in [(rx,0,0),(0,ry,0),(0,0,rz)]))
        heights.append(GR['root']+center.y-radius)
    if ground:out['rootY']=-min(heights)
    return out
bpy.context.scene.render.fps=50
# Dense sampling uses LINEAR to match the runtime's quaternion interpolation without Bezier overshoot (Blender 5 slotted actions expose no fcurves list).
bpy.context.preferences.edit.keyframe_new_interpolation_type='LINEAR'
rig.animation_data_create()
for base,keys in clips.items():
    for left in [False,True]:
        name=base+('_left' if left else '');action=bpy.data.actions.new(name);rig.animation_data.action=action
        duration=4 if base=='idle' else 2.4 if base in ['practice','celebrate','slump'] else 1
        for frame in range(round(duration*50)+1):
            pose=sample(keys,frame/(duration*50),base in data['throws'] and base not in ['idle','practice','celebrate','slump','walk'])
            for j in joints:
                r=pose[mirror.get(j,j) if left else j];r=[r[0],-r[1],-r[2]] if left else r
                b=rig.pose.bones[j];b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion((1,0,0),r[0]) @ Quaternion((0,1,0),r[1]) @ Quaternion((0,0,1),r[2]);b.keyframe_insert('rotation_quaternion',frame=frame,group=j)
            b=rig.pose.bones['root'];b.location=(0,pose['rootY'],0);b.keyframe_insert('location',frame=frame,group='root')
        action.use_fake_user=True
rig.animation_data.action=None
for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0)
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/blender/golfer-motion-r6.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'art/blender/golfer-motion-r6.glb'),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_skins=True,export_extras=True)
# Reuse the byte-preserving repacker without invoking its source-model conversion step.
exec((ROOT/'tools/split-golfer-clips.py').read_text().split('src,bin=read(')[0])
src,binary=read(ROOT/'art/blender/golfer-motion-r6.glb');report={'skeleton':'ChainsRig eleven-joint v3 (meshy athlete)','sampleHz':50,'phase':{'windup':[0,.5],'release':.62,'followThrough':[.5,1]},'clips':{}}
for a in src['animations']:
    doc=copy.deepcopy(src);doc['animations']=[copy.deepcopy(a)]
    for key in ['meshes','materials','textures','images','skins']:doc.pop(key,None)
    for n in doc['nodes']:n.pop('mesh',None);n.pop('skin',None)
    path=OUT/f"golfer-{a['name']}.glb";write(path,doc,binary)
    report['clips'][a['name']]={'file':f'assets/models/{path.name}','bytes':path.stat().st_size,'duration':max(src['accessors'][s['input']]['max'][0] for s in a['samplers']),'meshes':0}
for name in ['golfer.glb','golfer-lod.glb']:report[name]={'bytes':(OUT/name).stat().st_size}
(OUT/'golfer-clips.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
