# Round seven — female athlete, grip, hats, glasses, seam-free bake, photo-leaf trees

> **Build / commit:** see `git log` for the round-seven commit · **Date:** 2026-09-16 · **Tester:** Claude (embedded browser) · **Platform:** Windows 11, RTX 5090, desktop Chromium pane at 800×754

## What was tested

The user's round-seven list: "rings around the hands", "a little bit choppy", clothes and hats overlapping the body, the disc "stuck in the hand", glasses and hats protruding, female character models, "weird lines" when changing facial features, "skin tones look muddied and have shirt lines going through them", "the glasses look terrible and some are broken", and "replicate how Disc Golf Masters looks" (YouTube reference `Q2iM-s0O7tk`, watched through the claude-video skill's captions plus in-pane frames: photoreal Unreal scene, large leafy trees, low chase camera, arc preview, hole card, wind and elevation readouts).

**Acceptance criteria:** AC-1 wristbands sit on the wrists · AC-2 face and hands keep their detail at both LODs · AC-3 no shirt colour on skin, no white or black specks at seams, skin at the scan's real brightness · AC-4 fingers curl around the disc rim · AC-5 hats sit over hair, no hair through domes · AC-6 glasses are geometry on the eye line, all three styles · AC-7 a female body with every locker option · AC-8 facial hair fades instead of ending in a rectangle · AC-9 course trees read as real trees at tee distance · AC-10 tests green, Lite tier still boots

## Acceptance criteria results

| # | Criterion | Result | Notes |
|---|---|---|---|
| AC-1 | Wristbands | PASS | measured from the hand's own vertices (the thigh had been included), ring radius clamped to 2.5–4.5 cm |
| AC-2 | Face and hand detail | PASS | two-pass decimation pins face+hands (30 % of the budget) then the body; female LOD head no longer collapses |
| AC-3 | Clean recolouring | PASS | bakes run in the scan's A-pose before straightening (arms clear of the torso), fresh smart-projected UVs packed to the whole atlas, 16 px margin, AO misses treated as open, neighbourhood-vote classifier with forearm and upper-arm maps from bone weights, albedo now sRGB-encoded (it had shipped linear: every skin tone was too dark); skin tones shift the scan's own skin rather than painting over it. Regression check: forearm faces sampling the wrong region 117 -> 8 slivers of 1,619 |
| AC-4 | Grip | PASS | three hinges per finger (38°, 62°, 34°) bent toward the palm on both hands before the bake; the disc rim sits in the hook |
| AC-5 | Hats over hair | PASS | dome offset clears every everyday shell; curly, wavy, sidepart, afro and mohawk hide under dome hats; "short" is now the scan's own hair recoloured |
| AC-6 | Glasses | PASS | round, square (rim scale about its own centre — it had landed on the chest) and a thin tinted sport shield with temples to the ears |
| AC-7 | Female body | PASS | concept image + Meshy 7 image-to-3D with rig through Higgsfield (48 credits), same builder with `--variant f`, same rig and clips, hip drops scaled by leg length (`legScale` .97) |
| AC-8 | Beard feather | PASS | beard channel carries zone id + softness (64 levels), 1.4 cm fade |
| AC-9 | Trees | PASS | Blender trunks with branch tubes and crossed photo leaf cards (deciduous ×3, pine ×3, bush ×2), alpha-tested with cut-out shadows, instanced per spot with tint; transparent texels dilated so distant mips stop turning pink |
| AC-10 | Tests / Lite | PASS | physics, animation, assets (104 entries) and feedback suites green; Lite keeps embedded crowns and the 6.2k LOD |

## Evidence

| File | Shows |
|---|---|
| `golfer-v3-cap-face.png`, `golfer-v3-bare-face.png` | male face with cap over short hair, wavy hair with round glasses |
| `golfer-v3-bare-hand.png` | curled fingers and the slimmer wristband |
| `golfer-v3-lod-face.png` | phone LOD keeps the face |
| `golfer-v3-f-*.png` | female body: front, face, cap + glasses, LOD face |
| `trees-deciduous.png`, `trees-pine.png`, `trees-bush.png` | tree variants (workbench, flat colours; textures apply in-game) |

## Test conditions

- Fresh load each run (`Cache-Control: no-store`), Full tier, Pine Hollow for the forest check, Gull Point for wind.
- Frame rate in the pane: 60 fps at 800×754 during aim with the new trees; physical phone readings still require `?fps=1` on a device.

## Checks run

- `node test/physics.test.mjs`, `node test/animation.test.mjs`, `node test/assets.test.mjs` (both figures: Draco, byte budgets, rig extras incl. `chestY`/`legScale`, glasses nodes, seven textures per figure; trees: Draco, no embedded images, < 3.2k triangles), `node test/feedback.test.mjs`.
- Blender builds: `build-golfer-v3.py` (m and f), `pack-body-textures.py` (m and f), `build-trees.py`.

## Observations

- The pine cards read sparse within a few metres of the camera during flight; the tee and fairway views are where they matter and those are convincing. More cards per whorl is the knob (`tools/build-trees.py`, `cards`).
- Shell hair styles remain stylised caps over a photoreal face; "short" (the scan's hair) is the natural default and is now what a fresh avatar gets.
- The reference game is Unreal on desktop; matching its water, long grass and depth of field on phones is out of scope for this round.
