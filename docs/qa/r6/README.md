# Round six — photoreal athlete, aim line, wind streamlines

> **Build / commit:** see `git log` for the round-six commit · **Date:** 2026-09-15 · **Tester:** Claude (embedded browser) · **Platform:** Windows 11, RTX 5090, desktop Chromium pane at 800×450, 375×812 and 812×375

## What was tested

The character models were rebuilt from the ultimate frisbee project's Meshy body (the reference the user judges against), re-rigged onto ChainsRig with the existing 32 clips, and made recolourable through region masks. The flight preview was rebuilt as a screen-space dashed ribbon with an aim arrow after the user reported it had become invisible, and the wind streaks were replaced by tapered streamlines after the user called them "weird".

**Acceptance criteria covered:** AC-1 body reads like the frisbee athlete or better · AC-2 every locker colour still applies (skin, shirt, trim, shorts, socks, shoes, hair, eyes, beard, headwear) · AC-3 clips and grip unchanged · AC-4 aim line and direction visible on bright grass · AC-5 wind visible and flowing · AC-6 Lite tier works with the phone LOD · AC-7 layouts stay overlap-free at phone sizes

## Acceptance criteria results

| # | Criterion | Result | Notes |
|---|---|---|---|
| AC-1 | Photoreal body in hub, locker and tee | PASS | `golfer-v3-*` renders below; in-game hub and tee screenshots taken in the pane |
| AC-2 | Locker colours via masks | PASS | Red kit + number on load; yellow hoops, dark skin, beard, green eyes, blue cap, red socks pushed through `setFace`/`makeHero` and all applied |
| AC-3 | 32 clips play on the new rig | PASS | `test/animation.test.mjs` (22 throw clips, exact .62 release), bot throw plays backhand/forehand at the tee |
| AC-4 | Aim line readable | PASS | 3 px white dashes over a 6 px dark outline plus a ground chevron; visible at 800×450 on Gull Point's bright fairway |
| AC-5 | Wind streamlines | PASS | 26 tapered ribbons, spatially sampled (~7 m), fade toward the tail, respawn upwind; visible at 3–7 m/s |
| AC-6 | Lite tier | PASS | Hub hero draws the 6.2k-triangle LOD with 1024/512 textures and no normal map |
| AC-7 | Overlap audit at phone sizes | see below | |

## Evidence

| File | Shows |
|---|---|
| `golfer-v3-cap-front.png`, `-quarter.png` | Workbench turnaround of the straightened Meshy body with cap and short hair |
| `golfer-v3-bare-face.png` | wavy hair shell seated on the real skull, baked face, ears clear |
| `golfer-v3-afro-quarter.png` | thick afro shell |
| `golfer-v3-lod-*.png` | phone LOD (6.2k body, 300-triangle caps) |

## Test conditions

- Fresh load each run (`Cache-Control: no-store`), saved avatar, Full unless stated; Gull Point Bluffs with `world.wind` forced to 6.5 m/s for the streamline check.
- Frame rate in the pane: 60 fps at 800×450 Full during aim; physical phone readings still require `?fps=1` on a device.

## Checks run

- `node test/physics.test.mjs`, `node test/animation.test.mjs`, `node test/assets.test.mjs` (Draco body under 320 KB, LOD under 300 KB, rig extras carry grip/eye line/region luminance, seven body textures in the manifest).
- Blender build: `blender -b -P tools/build-golfer-v3.py -- --preview docs/qa/r6`, then `python tools/pack-body-textures.py`, `blender -b -P tools/author-golfer-clips.py`.

## Observations

- The Meshy albedo carries baked lighting; AO from the high-res bake is folded in at 55%, which reads fine under the real sun but doubles some fold shading on the shirt.
- Hair and headwear caps are smoothed head copies (420 triangles on Full); they are clean at gameplay distance but faceted in the locker close-up. A subdivision pass is the next step if the user wants it.
- Sport glasses are the one remaining decal; they sit on the measured eye line but draw as a wide visor band.
