"""Her skin's ambient occlusion, baked from her own body into the free alpha of her mask2 (assets/textures/body-f/mask2[_lod].png).
Run: python tools/patch-female-ao.py   (numpy, scipy, Pillow; Blender for the bake and the texel dump, BLENDER overrides its path)

Why: under the same light and palette tone the male scan's skin shows form (eye sockets, the jaw's shadow, knees, the forearm's
muscle) and hers reads flat and pale. His albedo carries the photographic shading of his scan; her bake was lit evenly, so her
limbs hold 20-27 % less form contrast (the spread of the albedo smoothed over 2.5 cm: forearm .255 against his .325, legs
.398 against .542), and her normal map is unusable (baked off stray scan surfaces, so the body shader leaves it off). Her
masks carry no beard zones (the shader keeps her beard off), so mask2's alpha is free: it takes this AO and body-material.js
folds it into her skin (AO_F there).

How: Blender splits her bind-pose body into torso and head, both arms and both legs (each face to the part its vertices weigh
most) and bakes each part's AO against itself only (Cycles AO, only local, 8 cm), so the arms hanging beside the hips in the
bind pose and the touching thighs do not shade each other in a throw. Her scan's faces wind either way, so each part is baked
with both windings and the brighter is the outside. The texels then take a 1 cm mean in 3D (bake noise and island seams),
gutters copy their nearest island texel, and the value is stored in mask2's 6-bit alpha steps (pack-body-textures.py
posterizes that channel to 6 bits), so a second run gives the same file. Her Lite set shares the full body's UVs: the same
map at half size.
"""
import importlib.util, os, subprocess, sys, tempfile
from pathlib import Path

if '--bake' in sys.argv:   # inside Blender: per-part, two-sided AO of the bind-pose body into <dir>/<part><flip>.npy and coverage
  import bpy, bmesh, numpy as np
  glb, out, size = sys.argv[sys.argv.index('--bake') + 1:][:3]; size = int(size)
  bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
  for arm in (o for o in bpy.context.scene.objects if o.type == 'ARMATURE'):
    for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
  body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.materials and o.data.materials[0].name.startswith('body'))
  groups = {g.index: g.name for g in body.vertex_groups}
  src = bpy.data.meshes.new_from_object(body.evaluated_get(bpy.context.evaluated_depsgraph_get())); mw = body.matrix_world.copy()
  for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o, do_unlink=True)
  PART = {'root': 'torso', 'spine': 'torso', 'head': 'torso', 'shL': 'armL', 'elL': 'armL', 'shR': 'armR', 'elR': 'armR', 'hipL': 'legL', 'knL': 'legL', 'hipR': 'legR', 'knR': 'legR'}
  vpart = []
  for v in src.vertices:
    acc = {}
    for g in v.groups: p = PART.get(groups[g.group]); acc[p] = acc.get(p, 0) + g.weight
    vpart.append(max(acc, key=acc.get) if acc else 'torso')
  sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64; sc.render.bake.margin = 0; sc.render.bake.use_clear = True
  mat = bpy.data.materials.new('ao'); mat.use_nodes = True; nt = mat.node_tree
  for n in list(nt.nodes): nt.nodes.remove(n)
  ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.only_local = True; ao.inputs['Distance'].default_value = .08; ao.samples = 16
  em = nt.nodes.new('ShaderNodeEmission'); tex = nt.nodes.new('ShaderNodeTexImage'); nt.links.new(ao.outputs['AO'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
  for part in sorted(set(PART.values())):
    for flip in (0, 1):
      me = src.copy(); bm = bmesh.new(); bm.from_mesh(me)
      bmesh.ops.delete(bm, geom=[f for f in bm.faces if sum(vpart[v.index] == part for v in f.verts) < 2], context='FACES')
      bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
      if flip: bmesh.ops.reverse_faces(bm, faces=bm.faces)
      bm.to_mesh(me); bm.free()
      for p in me.polygons: p.use_smooth = True
      ob = bpy.data.objects.new(part, me); ob.matrix_world = mw; sc.collection.objects.link(ob); me.materials.clear(); me.materials.append(mat)
      img = bpy.data.images.new(part, size, size, float_buffer=True); img.generated_color = (0, 0, 0, 0); tex.image = img; nt.nodes.active = tex
      bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
      bpy.ops.object.bake(type='EMIT')
      px = np.empty(size * size * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(size, size, 4)[::-1]
      np.save(f'{out}/{part}{flip}.npy', np.where(px[..., 3] > .5, px[..., 0], -1))   # -1: not this part's texel
      bpy.data.objects.remove(ob, do_unlink=True)
  sys.exit(0)

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
ROOT = Path(__file__).resolve().parents[1]
BLENDER = os.environ.get('BLENDER', '/Applications/Blender.app/Contents/MacOS/Blender' if sys.platform == 'darwin' else 'blender')

if __name__ == '__main__':
  spec = importlib.util.spec_from_file_location('patch_hair_mask', ROOT / 'tools/patch-hair-mask.py'); hm = importlib.util.module_from_spec(spec); spec.loader.exec_module(hm); hm.BLENDER = BLENDER
  N = 1024
  with tempfile.TemporaryDirectory() as tmp:
    subprocess.run([BLENDER, '-b', '-P', __file__, '--', '--bake', str(ROOT / 'assets/models/golfer-f.glb'), tmp, str(N)], check=True, capture_output=True)
    bake = np.max([np.load(f) for f in Path(tmp).glob('*.npy')], axis=0)   # parts never share a texel: the brighter winding of the one that owns it
  P, H, Nn, hit = hm.texel_maps(ROOT / 'assets/models/golfer-f.glb', N)
  own = hit & (bake >= 0); t = cKDTree(P[own]); v = bake[own]
  near = t.query_ball_point(P[hit], .01, workers=-1); ao = np.ones((N, N), np.float32)
  ao[hit] = [v[n].mean() if n else v[t.query(p)[1]] for n, p in zip(near, P[hit])]
  idx = ndimage.distance_transform_edt(~hit, return_distances=False, return_indices=True); ao = ao[idx[0], idx[1]]   # gutters copy their nearest island texel
  skin = np.asarray(Image.open(ROOT / 'assets/textures/body-f/mask1.png'))[..., 0] > 0
  ao[~ndimage.binary_dilation(skin, iterations=4)] = 1   # only her skin takes it: elsewhere a flat channel (the PNG grew 10x with it everywhere)
  a = (np.clip(np.round(ao * 63), 0, 63) * 4).astype(np.uint8)   # 6-bit steps, as the packer posterizes this channel
  for sfx, size in (('', N), ('_lod', N // 2)):
    path = ROOT / f'assets/textures/body-f/mask2{sfx}.png'; m2 = Image.open(path).convert('RGBA'); r, g, b, _ = m2.split()
    al = Image.fromarray(a) if size == N else Image.fromarray(a).resize((size, size), Image.BOX).point(lambda x: x // 4 * 4)
    Image.merge('RGBA', (r, g, b, al)).save(path, 'PNG', optimize=True)
    print(f'{path.relative_to(ROOT)}: AO mean {np.asarray(al).mean() / 252:.3f}, {path.stat().st_size} bytes')
