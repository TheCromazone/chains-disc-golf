# App icon: the game's own basket (art/blender/basket.blend) with a disc flying into the chains, rendered in Cycles.
#   blender --background --python tools/render-icon.py -- [--out art/icon/icon-render.png] [--size 1024] [--samples 96]
# tools/pack-icons.mjs then crops/scales the render into the PWA, apple-touch and favicon sizes.
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, arg('--out', 'art/icon/icon-render.png'))
SIZE, SAMPLES = int(arg('--size', '1024')), int(arg('--samples', '96'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def append(blend, name):
    with bpy.data.libraries.load(os.path.join(ROOT, blend), link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n == name]
    ob = dst.objects[0]; scene.collection.objects.link(ob); return ob

basket = append('art/blender/basket.blend', 'basket')
disc = append('art/blender/disc-v2.blend', 'disc')

# basket stands at the origin, ~1.47 m tall; the disc hits the chains just under the band, banked and tilted toward camera
basket.location = (0, 0, 0)
disc.scale = (1.6, 1.6, 1.6)
disc.location = (-0.27, -0.34, 1.08)
disc.rotation_euler = (math.radians(22), math.radians(-30), math.radians(30))

# the disc's plastic: the game's coral, a touch of clearcoat
m = bpy.data.materials.new('icon_disc'); m.use_nodes = True
b = m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (1.0, 0.075, 0.045, 1)
b.inputs['Roughness'].default_value = .32
if 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = .4
disc.data.materials.clear(); disc.data.materials.append(m)

# basket: galvanised steel, the band's yellow wrap above 1.3 m (the baked game textures aren't needed for a render)
bm = bpy.data.materials.new('icon_basket'); bm.use_nodes = True; bn = bm.node_tree
bp = bn.nodes['Principled BSDF']; bp.inputs['Metallic'].default_value = .85; bp.inputs['Roughness'].default_value = .3
tco = bn.nodes.new('ShaderNodeTexCoord'); sep = bn.nodes.new('ShaderNodeSeparateXYZ'); band = bn.nodes.new('ShaderNodeMath'); band.operation = 'GREATER_THAN'; band.inputs[1].default_value = 1.33
mix = bn.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.inputs['A'].default_value = (0.78, 0.8, 0.82, 1); mix.inputs['B'].default_value = (1.0, 0.55, 0.0, 1)
met = bn.nodes.new('ShaderNodeMath'); met.operation = 'MULTIPLY_ADD'; met.inputs[1].default_value = -0.75; met.inputs[2].default_value = 0.85
bn.links.new(tco.outputs['Object'], sep.inputs['Vector']); bn.links.new(sep.outputs['Z'], band.inputs[0])
bn.links.new(band.outputs['Value'], mix.inputs['Factor']); bn.links.new(mix.outputs['Result'], bp.inputs['Base Color'])
bn.links.new(band.outputs['Value'], met.inputs[0]); bn.links.new(met.outputs['Value'], bp.inputs['Metallic'])
basket.data.materials.clear(); basket.data.materials.append(bm)

# backdrop: a big curved card behind the basket, lit as a deep pine-green to teal gradient
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 3.2, 1.0), rotation=(math.radians(90), 0, 0))
card = bpy.context.object
cm = bpy.data.materials.new('icon_card'); cm.use_nodes = True
nt = cm.node_tree; nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
tc = nt.nodes.new('ShaderNodeTexCoord'); grad = nt.nodes.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (-0.03, -0.07, 0); mp.inputs['Scale'].default_value = (0.24, 0.24, 1)
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.002, 0.012, 0.008, 1)
ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.07, 0.30, 0.21, 1)
mid = ramp.color_ramp.elements.new(0.5); mid.color = (0.018, 0.10, 0.065, 1)
nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], grad.inputs['Vector'])
nt.links.new(grad.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
em.inputs['Strength'].default_value = 1.0; nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
card.data.materials.append(cm)
card.visible_shadow = False

# lights: warm key from upper left (late sun), cool rim from behind right, soft fill
def light(name, kind, loc, energy, color, size=1.0, target=(0, 0, 1.0)):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == 'AREA': d.size = size
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.location = loc
    dirv = Vector(target) - Vector(loc); o.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler(); return o
light('key', 'AREA', (-2.4, -2.6, 3.2), 520, (1.0, 0.86, 0.68), 2.0)
light('rim', 'AREA', (2.2, 1.6, 2.4), 420, (0.62, 0.86, 1.0), 1.2)
light('fill', 'AREA', (1.8, -2.8, 0.6), 90, (0.8, 0.9, 1.0), 3.0)
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.02, 0.05, 0.04, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6

# camera: a little below the band looking up, the basket's top half filling the square
cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 72
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (-0.5, -2.35, 0.92)
look = Vector((-0.06, 0, 1.1)) - cam.location; cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
cam_data.dof.use_dof = True; cam_data.dof.focus_object = basket; cam_data.dof.aperture_fstop = 5.6

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for dev in prefs.devices: dev.use = True
    scene.cycles.device = 'GPU'
except Exception as e: print('GPU unavailable, CPU render', e)
scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'; scene.view_settings.exposure = -0.35
scene.render.image_settings.file_format = 'PNG'
os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('icon render ->', OUT)
