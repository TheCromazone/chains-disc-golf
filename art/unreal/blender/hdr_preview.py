# Tone-map equirect .hdr panoramas to JPEG previews with Blender's AgX view (auto exposure from the median luminance).
#   blender -b --factory-startup --python art/unreal/blender/hdr_preview.py -- <out_dir> <width> a.hdr b.hdr ...
import bpy, sys, os, math
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:]
out_dir, width, files = args[0], int(args[1]), args[2:]
os.makedirs(out_dir, exist_ok=True)
sc = bpy.context.scene
sc.view_settings.view_transform = "AgX"
sc.render.image_settings.file_format = "JPEG"
sc.render.image_settings.quality = 88
for f in files:
    img = bpy.data.images.load(f)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    lum = px[h // 2:, :, :3] @ np.array([.2126, .7152, .0722], np.float32)   # upper hemisphere (Blender rows are bottom-up)
    med = float(np.median(lum[lum > 0])) if (lum > 0).any() else 1.0
    sc.view_settings.exposure = math.log2(.18 / max(med, 1e-6)) + .5
    img.scale(width, width // 2)
    out = os.path.join(out_dir, os.path.splitext(os.path.basename(f))[0] + ".jpg")
    img.save_render(out, scene=sc)
    print(f"{f}: {w}x{h} median {med:.4g} exposure {sc.view_settings.exposure:+.2f} -> {out}")
