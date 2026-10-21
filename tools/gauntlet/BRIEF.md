# Gauntlet builder brief (r3)

You are one builder in a gauntlet loop on **Chains**, a three.js disc golf game (CDN import map, no build step) played
mostly on phones, also on desktop. Blind critics compare our frames with **Disc Golf Masters** (Unreal, YouTube
1oKuHnueZTI, Nokia "Beast" course) and pick a winner per piece. Your group owns a few pieces; make ours win them without
losing anyone else's.

## Step 0
`git merge --ff-only gauntlet-r3` (worktrees start from master; gauntlet-r3 is the integration branch: master's mobile polish
plus round 2's unshipped work). If it is not a fast-forward, stop and say so in your report; never merge gauntlet-r2.

## Look at the bar first
- 1080p reference frames: `art/reference/dgm-1080/frames/*.jpg` (main checkout: `C:\Users\matth\OneDrive\Documents\disc golf mobile\art\reference\dgm-1080\frames`; copy what you need, the folder is gitignored and absent from worktrees). The 1080p60 video is `beast-1080.mp4` beside it; motion events in `art/qa/dgm-motion/events.json`.
- The latest verdicts for your pieces are in your task prompt. They name what the critics saw. Fix causes, not wording.

## Tiers (both matter; phones matter most)
- **Mobile** (`quality: 'low'`, phones by default): what most players see. Rendered straight to the canvas, MSAA from
  `antialias: true`, colour grade folded into `CustomToneMapping` (src/main.js). Phone frames are judged at 1920x1080
  from a 960x540 CSS viewport at 2x. Budget at any moment: <= 1.0M triangles, <= 125 draw calls (the baseline already draws ~0.8-0.93M / 109-119), no extra full-screen
  render targets except one cheap pass if it buys a visible win; it must hold 30 fps on a mid-range phone.
- **Desktop** (`quality: 'high'`): effects.js post chain (4x MSAA scene target, shafts, bloom, grade). Budget: tee
  <= 2.3M, putt <= 2.4M triangles; must hold 60 fps on a desktop GPU.
- The pieces `crisp` and `d-crisp` judge 1:1 native crops for jaggies, pixelation and hard alpha edges. Never trade them away.

## Capture and judge yourself
`bash tools/gauntlet/capture-all.sh art/qa/<your-dir> <your base port> [stills|motion|all]` (ports: your task prompt;
uses base..base+2 and +1000) captures phone/, desktop/ and motion/. Then
`python tools/gauntlet/prep.py <label> art/qa/<your-dir> --pieces <yours> --k 2` writes the same blind pairs the critics
get (prompt.md + A.jpg + B.jpg under art/qa/judge/<label>/, key on stdout). Look at them with the Read tool and be harsh:
if the reference still wins, keep working. `art/qa/` is gitignored. Stats per moment (draw calls, triangles, frame ms,
console errors) are in each capture's stats.json: zero console errors, budgets held.

## Tools you may use
- **Blender 5.2** (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe -b -P script.py -- args`): the asset
  pipeline (tools/build-*.py, tools/build-golfer-v3.py + tools/pack-body-textures.py for athletes, tools/build-trees.py).
  Builds take minutes; run them in the background.
- Local image generation (ComfyUI at C:\ComfyUI, Qwen-Image 2.1 for textures, TRELLIS.2 for meshes) if a texture or mesh
  is the real gap. Standalone ComfyUI scripts need torch.set_grad_enabled(False), init_extra_nodes, staged model loading.
- `window.__chains` in the page exposes G, renderer, scene, camera, course, hero, startGame, nextTurn, setupTurn, THREE.

## Rules
- Files are CRLF for main.js, physics.js, materials.js; most others LF. Match the surrounding code: dense, commented with
  the reason, no new dependencies.
- Keep every test green: `node test/<name>.test.mjs` for each file in test/.
- Stay inside your files where you can; if you must touch another group's file, keep the change minimal and say so.
- Commit on your branch with `git commit --author="TheCromazone <matthewcromaz37@gmail.com>"`, message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not merge into gauntlet-r3 or master, do not push.
- Never delete reference material or other people's captures.

## Final answer (structured)
branch, head commit, one-paragraph summary of what changed and why, which pieces you expect to win, budgets at tee and
putt for both tiers (from stats.json), test results, and anything you tried that failed (so the next cycle skips it).
