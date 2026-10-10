# Step 2 (editor Python, run with art/unreal/uepy.mjs): give the four MetaHumans distinct faces, save them, export heads.
import os, json
exec(open(os.path.expanduser("~/Documents/chains-disc-golf/art/unreal/scripts/mh_lib.py")).read())
SPECS = {
    # broad, strong jaw, wide nose, full lips, heavy brow, short wide face
    "Chains_M1": dict(seed=11, noise=0.8, feats={"jaw_width": 1.4, "chin_width": 0.5, "chin_proj": 0.5, "nose_width": 0.8, "nose_proj": -0.2,
                                                 "lips_full": 0.6, "mouth_width": 0.3, "brow_ridge": 0.6, "cheekbones": 0.4, "face_length": -0.04}),
    # long narrow face, long projecting nose, strong chin, thin lips, deep-set brow
    "Chains_M2": dict(seed=23, noise=0.6, feats={"face_length": 0.10, "jaw_width": 0.5, "chin_proj": 1.0, "jaw_drop": 0.5, "nose_proj": 1.0,
                                                 "nose_drop": 0.4, "nose_width": -0.3, "lips_full": -0.5, "brow_ridge": 0.55, "cheekbones": -0.4}),  # brow > ~0.6 shuts the lids
    # small soft face: narrow jaw, small short nose, smooth brow, raised brows, fuller lips, soft cheekbones, round forehead
    "Chains_F1": dict(seed=37, noise=0.3, feats={"jaw_width": -1.0, "chin_width": -0.4, "chin_proj": -0.1, "nose_proj": -0.4, "nose_width": -0.35,
                                                 "brow_ridge": -0.6, "brow_raise": 0.4, "lips_full": 0.35, "cheekbones": 0.3, "forehead": 0.25,
                                                 "face_length": -0.04}),
    # heart face: high cheekbones, tapered jaw, defined chin, full wide mouth, narrow nose, smooth brow, lifted brows
    "Chains_F2": dict(seed=41, noise=0.3, feats={"jaw_width": -0.7, "chin_width": -0.6, "chin_proj": 0.45, "cheekbones": 0.8, "lips_full": 0.7,
                                                 "mouth_width": 0.35, "nose_width": -0.45, "nose_proj": 0.3, "brow_ridge": -0.4, "brow_raise": 0.6,
                                                 "face_length": 0.05, "eye_spacing": 0.15}),
}
res = {}
ONLY = globals().get("ONLY") or list(SPECS)
for name, spec in SPECS.items():
    if name not in ONLY: continue
    ch = mh_load(name, create=False)
    reset_face(ch)
    base = landmarks(ch)
    add_face_noise(ch, spec["seed"], spec["noise"])
    hist = sculpt_targets(ch, spec["feats"], iters=12)
    lm = landmarks(ch)
    info = export_head(ch, name, lods=(0, 2, 3, 4))
    res[name] = {"residual_cm": hist[-1], "mean_landmark_shift_cm": round(sum(math.dist(a, b) for a, b in zip(base, lm)) / len(lm), 3),
                 "saved": bool(save(ch)), "lods": info["lods"], "files": [os.path.basename(f) for f in info["files"]], "spec": spec}
rp = os.path.join(OUT_ROOT, "sculpt_report.json")
old = json.load(open(rp)) if os.path.exists(rp) else {}
old.update(res)
json.dump(old, open(rp, "w"), indent=1)
RESULT = {k: {kk: v[kk] for kk in ("residual_cm", "mean_landmark_shift_cm", "saved")} for k, v in res.items()}
