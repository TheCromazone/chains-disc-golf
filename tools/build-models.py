"""Reproducible Blender source. blender -b --python tools/build-models.py"""
import bpy, math, json, random
from pathlib import Path
from mathutils import Vector, Quaternion

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/models'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'art/blender'
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(73)
REPORT = {}

def xyz(p): return (p[0], -p[2], p[1])
def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)

def material(name, color, rough=.75, metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m

def finish(o,name,mat,bone=None):
    o.name=name; o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in o.data.polygons: p.use_smooth=True
    if bone:
        vg=o.vertex_groups.new(name=bone); vg.add(list(range(len(o.data.vertices))),1,'REPLACE')
    return o

def ell(name,pos,scale,mat,bone=None,seg=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=xyz(pos))
    o=bpy.context.object; o.scale=(scale[0],scale[2],scale[1]);return finish(o,name,mat,bone)

def box(name,pos,scale,mat,bone=None,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(pos));o=bpy.context.object
    o.scale=(scale[0],scale[2],scale[1]);finish(o,name,mat,bone)
    if bevel:
        mod=o.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return o

def rod(name,a,b,r1,r2,mat,bone=None,vertices=10):
    a,b=Vector(xyz(a)),Vector(xyz(b));d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,name,mat,bone)

def torus(name,pos,r,t,mat,bone=None,vertical=False,angle=0,major=24,minor=4):
    bpy.ops.mesh.primitive_torus_add(major_segments=major,minor_segments=minor,location=xyz(pos),major_radius=r,minor_radius=t)
    o=bpy.context.object
    if vertical: o.rotation_euler=(math.pi/2,0,angle)
    return finish(o,name,mat,bone)

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    o=objects[0];o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    return o

def meshes():return [o for o in bpy.context.scene.objects if o.type=='MESH']

def export(name,draco=True):
    objs=meshes(); tris=0
    for o in objs:
        o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles)
    REPORT[name]={'triangles':tris,'meshCount':len(objs)}
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,
        export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
        export_frame_range=False,export_skins=True,export_all_influences=False,
        export_draco_mesh_compression_enable=draco,export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,export_draco_normal_quantization=10,
        export_extras=True)
    REPORT[name]['bytes']=(OUT/(name+'.glb')).stat().st_size
    print('CHAINS_EXPORT',name,REPORT[name],flush=True)

def golfer():
    reset()
    M={k:material(k,c,r) for k,c,r in [
      ('skin',(.64,.36,.22),.65),('hair',(.05,.025,.012),.9),('jersey',(1,1,1),.82),
      ('trim',(1,1,1),.7),('shorts',(.035,.047,.06),.9),('shoes',(.8,.84,.82),.65),
      ('headwear',(.04,.055,.07),.8),('eyes',(.012,.018,.018),.3),('white',(.85,.85,.8),.5),('lips',(.25,.075,.06),.8)]}
    # A tailored torso: shoulders wider than waist, no capsule silhouette.
    verts=[];faces=[];rings=[(1.03,.155,.105),(1.10,.158,.108),(1.28,.185,.115),(1.43,.215,.105),(1.48,.15,.085),(1.51,.062,.06)]
    for y,rx,rz in rings:
      for i in range(16):
        a=i*math.tau/16;verts.append(xyz((math.cos(a)*rx,y,math.sin(a)*rz)))
    for j in range(len(rings)-1):
      for i in range(16):a=j*16+i;b=j*16+(i+1)%16;faces.append((a,b,b+16,a+16))
    faces += [tuple(reversed(range(16))),tuple(range(80,96))]
    me=bpy.data.meshes.new('tailored_jersey');me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new('torso',me);bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);finish(ob,'torso',M['jersey'],'spine')
    ell('pelvis',(0,.96,0),(.172,.12,.11),M['shorts'],'root')
    torus('collar',(0,1.50,0),.061,.013,M['trim'],'spine')
    rod('neck',(0,1.49,0),(0,1.59,0),.046,.049,M['skin'],'head')
    ell('head',(0,1.69,-.008),(.112,.145,.112),M['skin'],'head',24,16)
    ell('jaw',(0,1.62,-.027),(.081,.068,.083),M['skin'],'head',16,10)
    ell('nose',(0,1.675,-.112),(.022,.031,.028),M['skin'],'head')
    for side in [-1,1]:
      ell('ear',(side*.112,1.69,0),(.024,.036,.018),M['skin'],'head')
      ell('eye_white',(side*.043,1.715,-.1),(.025,.017,.016),M['white'],'head')
      ell('iris',(side*.043,1.714,-.114),(.011,.012,.006),M['eyes'],'head')
      ell('eye_glint',(side*.04,1.719,-.119),(.003,.003,.002),M['white'],'head',8,4)
      rod('eyebrow',(side*.023,1.745,-.107),(side*.065,1.744,-.099),.005,.006,M['hair'],'head',6)
      sh='shR' if side==1 else 'shL';el='elR' if side==1 else 'elL';hip='hipR' if side==1 else 'hipL';kn='knR' if side==1 else 'knL'
      ell('shoulder',(side*.20,1.435,0),(.073,.085,.075),M['jersey'],sh)
      rod('sleeve',(side*.20,1.43,0),(side*.20,1.21,0),.066,.055,M['jersey'],sh)
      torus('sleeve_trim',(side*.20,1.23,0),.055,.008,M['trim'],sh)
      ell('elbow',(side*.20,1.17,0),(.045,.052,.046),M['skin'],el)
      rod('forearm',(side*.20,1.17,0),(side*.20,.91,0),.047,.03,M['skin'],el)
      ell('hand',(side*.20,.88,-.01),(.043,.05,.03),M['skin'],el)
      ell('thumb',(side*.166,.895,-.032),(.015,.03,.015),M['skin'],el)
      rod('short_leg',(side*.10,.91,0),(side*.10,.59,0),.091,.075,M['shorts'],hip)
      ell('knee',(side*.10,.49,0),(.06,.075,.063),M['skin'],kn)
      rod('calf',(side*.10,.50,0),(side*.10,.12,0),.061,.035,M['skin'],kn)
      rod('sock',(side*.10,.20,0),(side*.10,.07,0),.044,.041,M['white'],kn)
      ell('shoe',(side*.10,.065,-.047),(.061,.065,.146),M['shoes'],kn,16,8)
      box('sole',(side*.10,.023,-.044),(.12,.033,.28),M['white'],kn,.012)
      for z in [-.01,-.034,-.058]: rod('laces',(side*.10-.024,.115,z),(side*.10+.024,.115,z),.003,.003,M['trim'],kn,4)
      box('side_panel',(side*.169,1.23,0),(.013,.25,.12),M['trim'],'spine',.004)
    rod('smile',(-.029,1.635,-.096),(.029,1.635,-.096),.004,.004,M['lips'],'head',8)
    body=join(meshes(),'golfer_body')
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
    # All wardrobe alternatives remain separately addressable skinned meshes.
    accessories=[]
    for style in ['short','buzz','curly','long','bun']:
      before=set(meshes());rad=.12 if style!='buzz' else .114
      ell('hair',(0,1.778,.005),(rad,.077,rad),M['hair'],'head',16,8)
      if style=='curly':
        for i in range(9):
          a=i*math.tau/9;ell('curl',(math.cos(a)*.09,1.81,math.sin(a)*.09),(.041,.04,.041),M['hair'],'head',8,6)
      if style=='long':ell('ponytail',(0,1.62,.105),(.06,.18,.042),M['hair'],'head')
      if style=='bun':ell('bun',(0,1.78,.108),(.052,.053,.047),M['hair'],'head')
      ob=join([o for o in meshes() if o not in before],'hair_'+style);ob['variant']='hair';accessories.append(ob)
    for style in ['cap','backcap','beanie','visor']:
      before=set(meshes())
      if style!='visor':ell('crown',(0,1.80,0),(.125,.09,.125),M['headwear'],'head',16,8)
      torus('hat_band',(0,1.78,0),.12,.012 if style!='beanie' else .019,M['headwear'],'head')
      if style in ['cap','backcap','visor']:
        ell('brim',(0,1.78,.115 if style=='backcap' else -.115),(.119,.009,.088),M['headwear'],'head',16,6)
      ob=join([o for o in meshes() if o not in before],'headwear_'+style);ob['variant']='headwear';accessories.append(ob)
    shades=box('shades',(0,1.714,-.117),(.17,.032,.025),M['eyes'],'head',.008);accessories.append(shades)
    # Rest bones use the same local coordinate axes as the procedural joints.
    rigdata=bpy.data.armatures.new('ChainsRig');rig=bpy.data.objects.new('ChainsRig',rigdata);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    spec={'root':(None,(0,.93,0)), 'spine':('root',(0,1.01,0)), 'head':('spine',(0,1.51,0)),
      'shR':('spine',(.2,1.45,0)), 'elR':('shR',(.2,1.17,0)), 'shL':('spine',(-.2,1.45,0)), 'elL':('shL',(-.2,1.17,0)),
      'hipR':('root',(.1,.91,0)), 'knR':('hipR',(.1,.49,0)), 'hipL':('root',(-.1,.91,0)), 'knL':('hipL',(-.1,.49,0))}
    for name,(parent,p) in spec.items():
      bone=rigdata.edit_bones.new(name);bone.head=xyz(p);bone.tail=xyz((p[0],p[1]+.12,p[2]));bone.roll=0
      if parent:bone.parent=rigdata.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in [body]+accessories:
      mod=o.modifiers.new('ChainsRig','ARMATURE');mod.object=rig;o.parent=rig
    bpy.context.scene.render.fps=60
    poses=json.loads((ROOT/'tools/poses.json').read_text());idle=poses['idle']
    clips=dict(poses['throws'])
    def key(t,**kw):return {'t':t,**kw}
    clips['idle_weight']=[key(0),key(.25,root=[0,0,.025],spine=[.04,0,-.02],rootY=.008),key(.75,root=[0,0,-.025],spine=[.04,0,.02]),key(1)]
    clips['idle_look']=[key(0),key(.35,head=[-.06,.45,.02]),key(.7,head=[0,-.3,0]),key(1)]
    clips['idle_practice']=[key(0),key(.4,root=[0,-.35,0],shR=[.7,0,.7],elR=[1.2,0,0]),key(.7,root=[0,.2,0],shR=[1.2,0,-.2],elR=[.6,0,0]),key(1)]
    clips['celebrate']=[key(0),key(.25,shR=[2.5,0,.4],elR=[1,0,0],shL=[2.5,0,-.4],elL=[1,0,0],rootY=.07),key(.5,shR=[2.9,0,.4],elR=[.4,0,0],shL=[2.9,0,-.4],elL=[.4,0,0],rootY=.12),key(.8,shR=[1.8,0,.4],elR=[1.5,0,0]),key(1)]
    clips['slump']=[key(0),key(.25,spine=[.28,0,0],head=[.35,0,0],shR=[.1,0,.15],elR=[.1,0,0]),key(.75,spine=[.28,0,0],head=[.35,-.2,0]),key(1)]
    rig.animation_data_create()
    for name,keys in clips.items():
      action=bpy.data.actions.new(name);rig.animation_data.action=action
      duration=1 if name in poses['throws'] else 4 if name.startswith('idle') else 2.4
      for k in keys:
        frame=round(k['t']*duration*60)+1
        for j in spec:
          b=rig.pose.bones[j];r=k.get(j,idle[j]);b.rotation_mode='QUATERNION'
          b.rotation_quaternion=Quaternion((1,0,0),r[0]) @ Quaternion((0,1,0),r[1]) @ Quaternion((0,0,1),r[2])
          b.keyframe_insert('rotation_quaternion',frame=frame,group=j)
        b=rig.pose.bones['root'];b.location=(0,k.get('rootY',0),0);b.keyframe_insert('location',frame=frame,group='root')
      action.use_fake_user=True
    rig.animation_data.action=None
    for b in rig.pose.bones:b.rotation_quaternion=(1,0,0,0);b.location=(0,0,0)
    rig['forward']='-Z';rig['windupEnd']=.5;rig['releasePhase']=.62
    export('golfer')
    assert REPORT['golfer']['triangles']<12000,REPORT['golfer']
    REPORT['golfer']['bones']=list(spec);REPORT['golfer']['clips']=list(clips)

def bake_model(name):
    ob=join(meshes(),name)
    bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.03);bpy.ops.object.mode_set(mode='OBJECT')
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.bake.margin=4
    maps={}
    for kind in ['albedo','normal','roughness']:
      img=bpy.data.images.new(name+'_'+kind,256,256,alpha=False)
      img.colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
      for m in ob.data.materials:
        node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=img;m.node_tree.nodes.active=node
      if kind=='albedo':
        scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
        bpy.ops.object.bake(type='DIFFUSE')
      else:bpy.ops.object.bake(type='NORMAL' if kind=='normal' else 'ROUGHNESS')
      img.filepath_raw=str(OUT/(name+'_'+kind+'.png'));img.file_format='PNG';img.save();maps[kind]=img
    mat=material(name+'_baked',(1,1,1));nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
    for kind,img in maps.items():
      n=nodes.new('ShaderNodeTexImage');n.image=img
      if kind=='normal':
        normal=nodes.new('ShaderNodeNormalMap');links.new(n.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal'])
      else:links.new(n.outputs['Color'],bs.inputs['Base Color' if kind=='albedo' else 'Roughness'])
    if name=='basket':bs.inputs['Metallic'].default_value=.8
    ob.data.materials.clear();ob.data.materials.append(mat)
    for p in ob.data.polygons:p.material_index=0
    export(name)

def props():
    for name in ['disc','basket','tee_sign','pine','deciduous','bush','grass']:
      reset();wood=material('wood',(.18,.09,.035),.95);leaf=material('leaf',(.19,.38,.075),.87);leaf2=material('leaf_light',(.32,.49,.11),.88)
      silver=material('steel',(.57,.63,.67),.27,.85);yellow=material('yellow',(.95,.56,.025),.45);white=material('sign_face',(.85,.88,.77),.75)
      if name=='disc':
        # Lathed profile, dimensions match the physics radius.
        profile=[(0,.017),(.03,.0165),(.06,.0145),(.085,.0095),(.1,.003),(.105,-.004),(.104,-.012),(.098,-.014),(.088,-.012),(.086,-.004),(.086,.004),(.06,.006),(.03,.007),(0,.007)]
        vv=[];ff=[];n=48
        for r,y in profile:
          for i in range(n):a=i*math.tau/n;vv.append(xyz((math.cos(a)*r,y,math.sin(a)*r)))
        for j in range(len(profile)-1):
          for i in range(n):a=j*n+i;b=j*n+(i+1)%n;ff.append((a,b,b+n,a+n))
        me=bpy.data.meshes.new('disc');me.from_pydata(vv,[],ff);me.update();o=bpy.data.objects.new('disc',me);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);finish(o,'disc',material('plastic',(1,1,1),.3))
      elif name=='basket':
        rod('pole',(0,0,0),(0,1.47,0),.025,.025,silver)
        rod('band',(0,1.34,0),(0,1.45,0),.278,.278,yellow,vertices=32)
        for h in [.62,.79]:torus('tray_ring',(0,h,0),.34,.012,silver,major=32)
        for i in range(24):
          a=i*math.tau/24;x,z=math.cos(a)*.34,math.sin(a)*.34
          rod('tray_wire',(x,.62,z),(x,.79,z),.004,.004,silver,vertices=4)
          rod('tray_spoke',(0,.62,0),(x,.62,z),.004,.004,silver,vertices=4)
        # Individually modelled interlocking links: 20 strands, 12 links per strand.
        for strand in range(20):
          a=strand*math.tau/20
          for link in range(12):
            t=link/11;r=.24*(1-t)+.045*t;y=1.32-.50*t
            o=torus(f'chain_{strand:02}_{link:02}',(math.cos(a)*r,y,math.sin(a)*r),.017,.003,silver,vertical=True,angle=a+(link%2)*math.pi/2,major=8,minor=3);o.scale.z=1.3
        torus('top_ring',(0,1.32,0),.24,.012,silver)
      elif name=='tee_sign':
        for s in [-1,1]:rod('post',(s*.40,0,0),(s*.40,1.55,0),.05,.05,wood)
        box('frame',(0,1.35,0),(1.1,.72,.1),wood,bevel=.025)
        box('face',(0,1.35,-.059),(.98,.59,.012),white)
        box('header',(0,1.56,-.07),(.98,.10,.012),yellow)
      elif name in ['pine','deciduous']:
        h=6 if name=='pine' else 4.2;rod('trunk',(0,0,0),(0,h,0),.32,.13,wood,vertices=9)
        if name=='pine':
          for tier in range(6):
            y=3.1+tier*1.13;r=2.35-tier*.30
            for j in range(5):
              a=j*math.tau/5+tier*.7
              rod('branch',(0,y,0),(math.cos(a)*r,y-.25,math.sin(a)*r),.055,.008,wood,vertices=5)
              ell('needles',(math.cos(a)*r*.5,y+.5,math.sin(a)*r*.5),(r*.65,.85,r*.65),leaf if tier%2 else leaf2,seg=8,rings=5)
        else:
          for j in range(7):
            a=j*2.4;r=1.6+(j%2)*.5;y=4.8+(j%3)*.65
            rod('branch',(0,2.9,0),(math.cos(a)*r,y,math.sin(a)*r),.12,.035,wood,vertices=6)
            ell('canopy',(math.cos(a)*r,y+.8,math.sin(a)*r),(1.9,1.6,1.8),leaf if j%2 else leaf2,seg=10,rings=6)
      elif name=='bush':
        for i in range(5):
          a=i*2.4;ell('shrub',(math.cos(a)*.48,.55+(i%2)*.18,math.sin(a)*.48),(.68,.60,.65),leaf if i%2 else leaf2,seg=10,rings=6)
      else:
        # Six gently curved grass ribbons; baked cards retain a small silhouette budget.
        for i in range(10):
          a=i*2.4;height=.48+random.random()*.34;w=.022;vs=[];fs=[]
          for j in range(5):
            t=j/4;x=math.cos(a)*(.08+.18*t*t);z=math.sin(a)*(.08+.18*t*t)
            for sign in [-1,1]:vs.append(xyz((x+sign*w*(1-t),height*t,z)))
          for j in range(4):fs.append((j*2,j*2+1,j*2+3,j*2+2))
          me=bpy.data.meshes.new('blade');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('grass_card',me);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);finish(o,'grass_card',leaf2)
      bake_model(name)

golfer();props()
(OUT/'model-report.json').write_text(json.dumps(REPORT,indent=2))
print('CHAINS_MODELS_COMPLETE',flush=True)
