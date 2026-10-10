# Conform fresh MetaHumans to the game's two scanned heads (HeadOnly target, no portrait/curves), locally in the editor.
import os, json
exec(open(os.path.expanduser("~/Documents/chains-disc-golf/art/unreal/scripts/mh_lib.py")).read())
WORK = os.path.expanduser("~/Documents/chains-disc-golf/art/unreal/work/gamehead")
res = {}
for tag, name in (("f", "Chains_FitGameF"), ("m", "Chains_FitGameM")):
    d = json.load(open(os.path.join(WORK, f"head_{tag}.json")))
    V = d["verts"]
    ch = unreal.load_asset(f"/Game/MetaHumans/{name}.{name}")
    if ch is None:
        ch = unreal.AssetToolsHelpers.get_asset_tools().create_asset(name, "/Game/MetaHumans", unreal.MetaHumanCharacter, unreal.new_object(unreal.MetaHumanCharacterFactoryNew))
    if not SUB.is_object_added_for_editing(ch): assert SUB.try_add_object_to_edit(ch)
    lm = landmarks(ch)
    mh_nose = max(lm, key=lambda p: p[1]); mh_top = max(p[2] for p in lm)
    g_nose = max((p for p in V if abs(p[0]) < 1.5), key=lambda p: p[1]); g_top = max(p[2] for p in V)
    s = (mh_top - mh_nose[2]) / (g_top - g_nose[2])
    Vt = [unreal.Vector3f((p[0] - g_nose[0]) * s + mh_nose[0], (p[1] - g_nose[1]) * s + mh_nose[1], (p[2] - g_nose[2]) * s + mh_nose[2]) for p in V]
    params = unreal.ConformTargetParams()
    tm = params.conform_target_mesh
    tm.target_parts_type = unreal.TargetPartsType.HEAD_ONLY
    tm.head_vertices = Vt
    tm.head_vertex_indices = d["tris"]
    params.conform_target_mesh = tm
    params.auto_solve = True
    bs = params.body_conform_solve_settings; bs.pipeline_name = "head_only"; params.body_conform_solve_settings = bs
    key = unreal.MetaHumanCharacterTargetMeshKey()
    t0 = time.time() if 'time' in globals() else 0
    ok = SUB.conform_to_target_meshes(ch, key, params)
    lm2 = landmarks(ch)
    res[name] = {"ok": bool(ok), "scale": s, "mean_landmark_shift_cm": sum(math.dist(a, b) for a, b in zip(lm, lm2)) / len(lm)}
    if ok:
        SUB.commit_face_state(ch)
        res[name]["files"] = export_head(ch, name, lods=(0,))["files"]
        save(ch)
RESULT = res
