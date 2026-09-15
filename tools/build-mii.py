"""Original toy golfer: Blender source, body + LOD. Run blender -b -P tools/build-mii.py.
Motion comes from the game's authored eleven-joint poses; no licensed character geometry.
Then run python tools/split-golfer-clips.py to ship animation-only files.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[1]
# Reuse the verified export/rig utility functions, never execute the old model builders.
exec((ROOT/'tools/build-models.py').read_text().split('def golfer():')[0])
reset()
M={k:material(k,c) for k,c in [('skin',(.64,.36,.22)),('hair',(.05,.025,.012)),('jersey',(1,1,1)),('trim',(1,1,1)),('shorts',(.035,.047,.06)),('shoes',(.8,.84,.82)),('headwear',(.04,.055,.07)),('gloves',(1,1,1)),('sole',(.48,.58,.64))]}
# Rounded, short body, large clean head, tube limbs: deliberately no muscle/cloth detail.
ell('shirt',(0,.91,0),(.235,.285,.15),M['jersey'],'spine',20,12)
box('shorts',(0,.62,0),(.36,.18,.235),M['shorts'],'root',.055)
rod('collar',(0,1.10,0),(0,1.17,0),.075,.075,M['trim'],'spine')
ell('head',(0,1.39,0),(.275,.295,.255),M['skin'],'head',32,20)
for side in [-1,1]:
    ell('ear',(side*.272,1.385,.005),(.035,.052,.04),M['skin'],'head',12,8)
    sh='shR' if side==1 else 'shL';el='elR' if side==1 else 'elL';hip='hipR' if side==1 else 'hipL';kn='knR' if side==1 else 'knL'
    ell('sleeve',(side*.24,1.02,0),(.073,.125,.08),M['jersey'],sh)
    rod('upper_arm',(side*.24,.98,0),(side*.24,.83,0),.045,.045,M['skin'],sh)
    ell('elbow',(side*.24,.82,0),(.045,.045,.045),M['skin'],el)
    rod('forearm',(side*.24,.82,0),(side*.24,.66,0),.04,.038,M['skin'],el)
    rod('cuff',(side*.24,.675,0),(side*.24,.645,0),.047,.047,M['gloves'],el)
    ell('glove',(side*.24,.615,-.012),(.062,.065,.055),M['gloves'],el)
    ell('thumb',(side*.19,.63,-.043),(.028,.04,.031),M['gloves'],el)
    rod('short_leg',(side*.115,.63,0),(side*.115,.37,0),.079,.070,M['shorts'],hip)
    ell('knee',(side*.115,.36,0),(.046,.05,.046),M['skin'],kn)
    rod('shin',(side*.115,.38,0),(side*.115,.12,0),.045,.044,M['skin'],kn)
    ell('sole',(side*.115,.027,-.052),(.083,.027,.154),M['sole'],kn,20,10)
    ell('shoe',(side*.115,.075,-.052),(.079,.063,.15),M['shoes'],kn,20,10)
body=join(meshes(),'golfer_body')
accessories=[]
for style in ['short','buzz','curly','long','bun']:
    before=set(meshes())
    # Hemisphere hair shell sits above the face rather than a second complete sphere.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=xyz((0,1.405,.009)))
    ob=bpy.context.object;ob.scale=(.285,.27,.30);finish(ob,'shell',M['hair'],'head')
    import bmesh
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<(.10 if style=='buzz' else .11)],context='VERTS')
    bm.to_mesh(ob.data);bm.free()
    if style=='short':
        ell('fringe',(-.10,1.585,-.17),(.14,.055,.078),M['hair'],'head')
    if style=='curly':
        for i in range(7):
            a=i*math.tau/7;ell('curl',(math.cos(a)*.205,1.625,math.sin(a)*.19),(.085,.07,.082),M['hair'],'head')
    if style=='long':ell('tail',(0,1.24,.24),(.12,.24,.06),M['hair'],'head')
    if style=='bun':ell('bun',(0,1.60,.25),(.1,.095,.092),M['hair'],'head')
    accessories.append(join([o for o in meshes() if o not in before],'hair_'+style))
for style in ['cap','backcap','beanie','visor']:
    before=set(meshes())
    if style!='visor':ell('crown',(0,1.62,.01),(.288,.105,.272),M['headwear'],'head',24,10)
    torus('band',(0,1.575,0),.263,.026,M['headwear'],'head')
    if style in ['cap','backcap','visor']:ell('brim',(0,1.577,.235 if style=='backcap' else -.235),(.265,.018,.13),M['headwear'],'head',20,6)
    accessories.append(join([o for o in meshes() if o not in before],'headwear_'+style))
rigdata=bpy.data.armatures.new('ChainsRig');rig=bpy.data.objects.new('ChainsRig',rigdata);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
spec={'root':(None,(0,.64,0)), 'spine':('root',(0,.72,0)), 'head':('spine',(0,1.16,0)),
 'shR':('spine',(.24,1.06,0)), 'elR':('shR',(.24,.82,0)), 'shL':('spine',(-.24,1.06,0)), 'elL':('shL',(-.24,.82,0)),
 'hipR':('root',(.115,.62,0)), 'knR':('hipR',(.115,.36,0)), 'hipL':('root',(-.115,.62,0)), 'knL':('hipL',(-.115,.36,0))}
for name,(parent,p) in spec.items():
    b=rigdata.edit_bones.new(name);b.head=xyz(p);b.tail=xyz((p[0],p[1]+.12,p[2]));b.roll=0
    if parent:b.parent=rigdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for o in [body]+accessories:
    mod=o.modifiers.new('ChainsRig','ARMATURE');mod.object=rig;o.parent=rig
bpy.context.scene.render.fps=30
poses=json.loads((ROOT/'tools/poses.json').read_text());idle=poses['idle'];clips=dict(poses['throws'])
def key(t,**kw):return {'t':t,**kw}
clips['idle']=[key(0),key(.25,root=[0,0,.025],spine=[.04,0,-.02],rootY=.008),key(.75,root=[0,0,-.025],head=[0,.20,0]),key(1)]
clips['practice']=[key(0),key(.4,root=[0,-.35,0],shR=[.7,0,.7],elR=[1.2,0,0]),key(.7,root=[0,.2,0],shR=[1.2,0,-.2],elR=[.6,0,0]),key(1)]
clips['celebrate']=[key(0),key(.25,shR=[2.5,0,.4],elR=[1,0,0],shL=[2.5,0,-.4],elL=[1,0,0],rootY=.07),key(.5,shR=[2.9,0,.4],elR=[.4,0,0],shL=[2.9,0,-.4],elL=[.4,0,0],rootY=.12),key(.8,shR=[1.8,0,.4],elR=[1.5,0,0]),key(1)]
clips['slump']=[key(0),key(.25,spine=[.28,0,0],head=[.35,0,0],shR=[.1,0,.15],elR=[.1,0,0]),key(.75,spine=[.28,0,0],head=[.35,-.2,0]),key(1)]
clips['walk']=[key(0,hipR=[.45,0,0],hipL=[-.45,0,0],shR=[-.4,0,.2],shL=[.4,0,-.2]),key(.5,hipR=[-.45,0,0],hipL=[.45,0,0],shR=[.4,0,.2],shL=[-.4,0,-.2],rootY=.015),key(1,hipR=[.45,0,0],hipL=[-.45,0,0],shR=[-.4,0,.2],shL=[.4,0,-.2])]
rig.animation_data_create()
for name,keys in clips.items():
    action=bpy.data.actions.new(name);rig.animation_data.action=action
    duration=1 if name in poses['throws'] or name=='walk' else 4 if name=='idle' else 2.4
    for k in keys:
        frame=round(k['t']*duration*30)
        for j in spec:
            b=rig.pose.bones[j];r=k.get(j,idle[j]);b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion((1,0,0),r[0]) @ Quaternion((0,1,0),r[1]) @ Quaternion((0,0,1),r[2]);b.keyframe_insert('rotation_quaternion',frame=frame,group=j)
        b=rig.pose.bones['root'];b.location=(0,k.get('rootY',0),0);b.keyframe_insert('location',frame=frame,group='root')
    action.use_fake_user=True
rig.animation_data.action=None
for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0)
rig['forward']='-Z';rig['releasePhase']=.62;rig['style']='original round-head sports avatar'
export('golfer-mii-source',draco=False)
for o in meshes():
    bpy.context.view_layer.objects.active=o
    mod=o.modifiers.new('Distant silhouette','DECIMATE');mod.ratio=.30;bpy.ops.object.modifier_apply(modifier=mod.name)
export('golfer-lod-source',draco=False)
(ROOT/'assets/models/golfer-build-report.json').write_text(json.dumps(REPORT,indent=2))
