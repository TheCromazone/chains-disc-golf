# Handoff prompt for Codex (GPT-6 Astra) — take Chains to AAA

Paste everything between the rules into a Codex session opened in this repository folder. It assumes Codex has image generation, a shell, and may launch Blender, Unity or Unreal on this machine.

---

You are taking over **Chains**, a mobile-first 3D disc golf game in this folder. Read `README.md`, `docs/superpowers/specs/2026-09-14-disc-golf-design.md`, `docs/codex-asset-prompts.md` and skim every file in `src/` before you change anything. Then run `node test/physics.test.mjs` and `node serve.mjs`, open http://localhost:8093 in a browser and play one full hole against the bots so you know what exists.

What exists and must keep working: Three.js 0.170 loaded from a CDN import map with no build step, ES modules only, deployable as static files on GitHub Pages; a headless flight model in `src/physics.js` with a Node test; three procedural courses in `COURSES` in `src/course.js`; a procedural rigged golfer with a locker-room avatar editor in `src/player.js` (joint names `root spine head shR elR shL elL hipR knR hipL knL`, five keyframed throws, phase 0–0.5 windup scrubbed by the swipe, 0.5–1 release); swipe gestures in `src/input.js`; bots in `src/bot.js`; a PeerJS online mode in `src/net.js`; synthesized sound with sample overrides in `src/audio.js`; and an asset manifest loader in `src/assets.js` that lets any file under `assets/` replace a procedural texture, course card, disc stamp or sound. The game must still boot and play with an empty `assets/` folder. Do not change the numbers in `physics.js` unless the test still passes, keep the localStorage keys `chains.avatar` and `chains.course`, and keep the online message shapes (`lobby`, `start`, `throw`, `next`, `botify`) backward compatible.

Your goal is to make it look and feel like a AAA mobile title while keeping it a web game. Work in this order and commit after each milestone with a short message and before/after screenshots in `docs/qa/`:

1. **Generate the full asset set** described in `docs/codex-asset-prompts.md` with your image model, using the exact prompts, sizes and file names, then write `assets/manifest.json`. Verify in the browser that every entry loads and nothing 404s.

2. **Build real 3D assets in Blender** (use `bpy` headless or the GUI; Blender is installed or install it). Deliver glTF binaries under `assets/models/`: a low-poly stylised golfer (under 12k triangles) rigged with bones named exactly like our joints so `player.js` can drive it, with separate material slots for skin, hair, jersey, trim, shorts, shoes and headwear so the locker-room colours still apply, plus hair and headwear variants as toggleable meshes; five throw animation clips (backhand, forehand, tomahawk, scoober, putt) that match our phase convention; a disc, a basket with individual chains, a tee sign, pine and deciduous trees, bushes and grass cards with baked albedo, normal and roughness. Compress with Draco and KTX2 if the CDN loaders support it. Add a GLB code path in `player.js` and `course.js` that uses these when present and falls back to the procedural meshes when absent.

3. **Rendering upgrades inside Three.js**, gated behind the existing Full graphics setting: PBR terrain with a splat of the generated grass, dirt and sand tiles; a vertex-shader wind sway on foliage; better water with reflections; a cloud layer; volumetric-looking sun shafts at Cedar Meadows' golden hour; screen-space ambient occlusion and a gentle bloom via the postprocessing addons; a contact shadow under the disc. Keep the Lite setting at today's cost.

4. **Animation and camera**: replace the keyframe tables with the Blender clips, add an idle set (weight shift, practice swing, looking down the fairway), a celebration on a birdie or better, a slump on a bogey, and a cinematic intro per hole that starts at the basket and pulls back to the tee like a broadcast. Add slow-motion on chain hits.

5. **Unreal or Unity**: use them only for what a web build can consume, such as rendering the three course hero cards and a 360° HDRI sky for each course's time of day, or baking lightmaps you then convert to textures. Do not port the game; it has to stay a static web app.

6. **Budget and QA**: 60 fps on a mid-range Android and an iPhone 12 at Lite, 45 fps at Full; initial payload under 10 MB; no console errors; run the physics test; test at 360×740, 430×932, 812×375, 568×320, 768×1024 and 1366×768 and confirm no buttons overlap, using the overlap check described in `docs/qa/README.md` if present or writing your own. Update `README.md` and this document's status at the end.

Ask nothing; make reasonable decisions and record them in `docs/decisions.md`.

---

## Why these boundaries

- The game is a static site so friends can open a link on their phone. Unreal and Unity are great for baking, terrible for that distribution model.
- The procedural fallbacks are the safety net: every generated asset is a replacement, never a dependency.
- The physics test is the guard against "made it prettier, broke the flight".
