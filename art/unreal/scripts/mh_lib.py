# Helpers run inside the ChainsUnreal editor (via art/unreal/uepy.mjs). Loaded into the shared job namespace.
import unreal, random, math, os, json
SUB = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)
SYM_PAIRS = [(1, 2), (5, 6), (7, 8), (9, 10), (11, 12), (14, 15), (20, 21)]

def mh_load(name, create=True):
    path = f"/Game/MetaHumans/{name}.{name}"
    ch = unreal.load_asset(path)
    if ch is None and create:
        ch = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, "/Game/MetaHumans", unreal.MetaHumanCharacter, unreal.new_object(unreal.MetaHumanCharacterFactoryNew))
    if not SUB.is_object_added_for_editing(ch):
        assert SUB.try_add_object_to_edit(ch), "try_add_object_to_edit failed"
    return ch

def coeff_patches(c):
    """Split the flat coefficient array: [npatch, (scale, qx,qy,qz,qw, tx,ty,tz, n, coeffs*n)*npatch]."""
    out, i = [], 1
    for _ in range(int(c[0])):
        n = int(c[i + 8]); out.append((i + 9, n)); i += 9 + n
    return out

def landmarks(ch):
    return [(v.x, v.y, v.z) for v in SUB.get_face_landmarks(ch)]

def set_random_face(ch, seed, scale=1.0, patch_scale=None):
    c = list(SUB.get_face_model_coefficients(ch))
    rng = random.Random(seed)
    for k, (start, n) in enumerate(coeff_patches(c)):
        s = scale * (patch_scale or {}).get(k, 1.0)
        for j in range(n):
            # PCA modes are ordered by variance: damp the tail so the patch reads as a plausible face
            c[start + j] = rng.gauss(0.0, s) * (1.0 / (1.0 + 0.08 * j))
    SUB.set_face_model_coefficients(ch, c)
    SUB.commit_face_state(ch)

def reset_face(ch):
    c = list(SUB.get_face_model_coefficients(ch))
    for start, n in coeff_patches(c):
        for j in range(n): c[start + j] = 0.0
    SUB.set_face_model_coefficients(ch, c)
    SUB.commit_face_state(ch)

OUT_ROOT = os.path.expanduser("~/Documents/chains-disc-golf/art/unreal/metahumans")
SES = unreal.get_editor_subsystem(unreal.SkeletalMeshEditorSubsystem)

def export_head(ch, name, lods=(0, 3), fbx=False, out_dir=None):  # FBX export crashes under -nullrhi (CPU skinning check)
    """Duplicate the editable face mesh to /Game/Export/<name>/<name>_Head and write glTF per LOD (+ FBX with all LODs)."""
    out_dir = out_dir or os.path.join(OUT_ROOT, name)
    os.makedirs(out_dir, exist_ok=True)
    p = unreal.MetaHumanGeometryExportParams()
    p.project_path = f"/Game/Export/{name}"
    p.head_skeletal_mesh = True; p.body_skeletal_mesh = False; p.full_body_skeletal_mesh = False
    p.overwrite_existing_assets = True
    unreal.MetaHumanCharacterExportBlueprintLibrary.export_geometry(ch, p)
    head = unreal.load_asset(f"/Game/Export/{name}/{ch.get_name()}_Head")
    info = {"asset": head.get_path_name(), "lods": []}
    for lod in range(SES.get_lod_count(head)):
        info["lods"].append({"lod": lod, "verts": SES.get_num_verts(head, lod)})
    files = []
    for lod in lods:
        o = unreal.GLTFExportOptions()
        o.default_level_of_detail = lod
        o.bake_material_inputs = unreal.GLTFMaterialBakeMode.DISABLED
        o.export_vertex_skin_weights = False
        o.export_morph_targets = False
        o.export_unlit_materials = False
        o.include_copyright_notice = False
        fn = os.path.join(out_dir, f"{name}_head_lod{lod}.glb")
        msgs = unreal.GLTFExporter.export_to_gltf(head, fn, o, set())
        files.append(fn)
    if fbx:
        t = unreal.AssetExportTask()
        t.object = head; t.filename = os.path.join(out_dir, f"{name}_head_all_lods.fbx")
        t.automated = True; t.prompt = False; t.replace_identical = True
        fo = unreal.FbxExportOption(); fo.level_of_detail = True; fo.export_morph_targets = False; fo.collision = False
        t.options = fo
        ok = unreal.Exporter.run_asset_export_task(t)
        files.append(t.filename if ok else "FBX FAILED")
    info["files"] = files
    return info

# ---- landmark sculpting -------------------------------------------------------------------------------
# Landmarks come back in UE head space (cm): x lateral, y forward (nose tip ~ +13), z up (chin ~149, brow ~162).
# Features pick landmarks by region and move them symmetrically (x mirrored); the MetaHuman model re-solves the face,
# which keeps results plausible far better than raw PCA noise (asymmetric/grotesque even at small scales).
# Selectors are written in the DEFAULT character's landmark space (171.7 cm body). Body height/shape moves and scales the
# head, so landmarks are first mapped to that space: nose tip (65) as anchor, crown (60) to chin (62) as the scale.
REF_NOSE = (0.0, 12.803, 156.08); REF_SPAN = 21.742

def canon(lm):
    n = lm[65]; k = REF_SPAN / (lm[60][2] - lm[62][2])
    return [((x - n[0]) * k + REF_NOSE[0], (y - n[1]) * k + REF_NOSE[1], (z - n[2]) * k + REF_NOSE[2]) for x, y, z in lm], k

def _sel(lm, f):
    return [i for i, (x, y, z) in enumerate(lm) if f(x, y, z)]

FEATURES = {
    # name: (selector, delta(x,y,z,amount) -> (dx,dy,dz))
    'jaw_width':   (lambda x, y, z: z < 154.5 and abs(x) > 2.5 and 0 < y < 10.0,  # y<10 keeps the mouth corners out
                            lambda x, y, z, a: (math.copysign(a, x), 0, 0)),
    'jaw_drop':    (lambda x, y, z: z < 151.5 and y > 0,                            lambda x, y, z, a: (0, 0, -a)),
    'chin_proj':   (lambda x, y, z: z < 151.5 and abs(x) < 4.5 and y > 5,            lambda x, y, z, a: (0, a, 0)),
    'chin_width':  (lambda x, y, z: z < 151.5 and 1.0 < abs(x) < 4.5 and y > 5,      lambda x, y, z, a: (math.copysign(a, x), 0, 0)),
    'nose_proj':   (lambda x, y, z: abs(x) < 1.0 and 152.5 < z < 158.5 and y > 11.5, lambda x, y, z, a: (0, a, 0)),
    'nose_width':  (lambda x, y, z: 1.2 < abs(x) < 3.2 and 154.5 < z < 158.5 and y > 9, lambda x, y, z, a: (math.copysign(a, x), 0, 0)),
    'nose_drop':   (lambda x, y, z: abs(x) < 3.2 and 153.0 < z < 157.0 and y > 9,    lambda x, y, z, a: (0, 0, -a)),
    'cheekbones':  (lambda x, y, z: 4.5 < abs(x) < 7.8 and 155.5 < z < 159.5 and y > 4, lambda x, y, z, a: (math.copysign(a, x), a * 0.5, 0)),
    'brow_ridge':  (lambda x, y, z: 160.8 < z < 164.5 and abs(x) < 7.5 and y > 6,    lambda x, y, z, a: (0, a, 0)),
    'brow_raise':  (lambda x, y, z: 161.0 < z < 164.5 and 1.5 < abs(x) < 7.5 and y > 6, lambda x, y, z, a: (0, 0, a)),
    'lips_full':   (lambda x, y, z: 150.8 < z < 155.0 and abs(x) < 3.6 and y > 11,  lambda x, y, z, a: (0, a, (z - 152.8) * a * 0.35)),
    'mouth_width': (lambda x, y, z: 150.8 < z < 155.0 and 2.0 < abs(x) < 3.8 and y > 9, lambda x, y, z, a: (math.copysign(a, x), 0, 0)),
    'eye_spacing': (lambda x, y, z: 159.0 < z < 162.0 and 1.0 < abs(x) < 5.5 and y > 8, lambda x, y, z, a: (math.copysign(a, x), 0, 0)),
    'forehead':    (lambda x, y, z: z > 164.5 and y > 4,                             lambda x, y, z, a: (0, a, 0)),
    'face_length': (lambda x, y, z: z < 157.0 and y > 0,                              lambda x, y, z, a: (0, 0, -(157.0 - z) * a)),
}

def sculpt(ch, feats, steps=3):
    """Apply {feature: amount_cm} in a few increments (the solver behaves better with small moves)."""
    for _ in range(steps):
        lm, k = canon(landmarks(ch))
        acc = {}
        for name, amt in feats.items():
            sel, fn = FEATURES[name]
            for i in _sel(lm, sel):
                d = [c / k for c in fn(*lm[i], amt / steps)]
                a = acc.setdefault(i, [0.0, 0.0, 0.0])
                for k in range(3): a[k] += d[k]
        idx = sorted(acc)
        SUB.translate_face_landmarks(ch, idx, [unreal.Vector(*acc[i]) for i in idx])
    SUB.commit_face_state(ch)

def feature_sets(lm):
    c, _ = canon(lm)
    return {k: _sel(c, v[0]) for k, v in FEATURES.items()}

def sculpt_targets(ch, feats, iters=8):
    """Target-seeking version of sculpt(): compute where each landmark should land from the CURRENT face, then
    repeatedly push the landmarks toward those targets (the solver only follows a fraction of each move)."""
    lm0 = landmarks(ch)
    c0, k = canon(lm0)
    tgt = {}
    for name, amt in feats.items():
        sel, fn = FEATURES[name]
        for i in _sel(c0, sel):
            d = [c / k for c in fn(*c0[i], amt)]
            t = tgt.setdefault(i, list(lm0[i]))
            for k in range(3): t[k] += d[k]
    hist = []
    for _ in range(iters):
        lm = landmarks(ch)
        idx = sorted(tgt)
        deltas = [unreal.Vector(*(tgt[i][k] - lm[i][k] for k in range(3))) for i in idx]
        hist.append(round(sum(math.dist(tgt[i], lm[i]) for i in idx) / max(1, len(idx)), 3))
        SUB.translate_face_landmarks(ch, idx, deltas)
    lm = landmarks(ch)
    hist.append(round(sum(math.dist(tgt[i], lm[i]) for i in sorted(tgt)) / max(1, len(tgt)), 3))
    SUB.commit_face_state(ch)
    return hist

def add_face_noise(ch, seed, scale=0.8):
    """Small PCA noise on top of the current face (identity 'grain'); > ~1.5 turns grotesque and asymmetric."""
    c = list(SUB.get_face_model_coefficients(ch))
    rng = random.Random(seed)
    for start, n in coeff_patches(c):
        for j in range(n):
            c[start + j] += rng.gauss(0.0, scale) / (1.0 + 0.08 * j)
    SUB.set_face_model_coefficients(ch, c)
    SUB.commit_face_state(ch)

def save(ch):
    return unreal.EditorAssetLibrary.save_loaded_asset(ch, only_if_is_dirty=False)
