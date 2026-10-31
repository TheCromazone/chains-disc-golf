# Gauntlet r4 — female athletes (Ricky, Paige, the female body in the locker)

Branch `r4-female` from `593eb2a`. Problem (real iPhone 17, Mobile, Ricky's run-up on Pine Hollow 1): her skin read pale and
flat, almost unlit beside the male hero in the same light, and her red/blue sash had ragged, torn-looking edges on the sleeve
and across the back; round 1's fix left a ragged sash edge across the upper back, a dark patch near the nape and pale scratches
on the front of the sash.

Captures: `tools/capture.mjs` and `tools/capture-motion.mjs` (Mobile `--size 390x844 --dpr 3 --quality low --mobile` and
`844x390`; Desktop `1440x900 --dpr 1 --quality high`), and a new staged probe, `tools/qa/athlete-closeup.mjs`: each round
athlete alone on hole 1's tee in his aim stance, frozen, shot from four sides at full height and torso, in sun and in shade (the
key off), plus the first bot's run-up through the game camera; `--avatar` puts either body in the other's palette, `--iso`
paints everything but the skin green on black for measuring. "Before" is `593eb2a` shot the same way. Note: ports 8483, 8486
and 8489 on this Mac answer from stale Oct 17 servers of the main checkout; a capture there silently shoots that code (the
probe now refuses a taken port).

## 1. Pale scratches and dark patches in her shirt and shorts: her normals pointed into the body

- Cause: her scan's own normals point inward over whole patches, and `relaxNormals` oriented every face to agree with them.
  Measured against the outward direction off the nearest bone, 48 % of her drawn vertex normals pointed into the body (50 % of
  the torso; his 14 %, a measure that also counts armpits, crotch and inner thighs). Lit from inside, a patch goes pale in
  the sun and dark in shade. Raycasting the pale quads on her back hit ordinary back faces whose vertex normals pointed down
  and in (`-.44, -.72, -.54`).
- Fix (`gltf-player.js orientFaces`, female body only): faces are oriented by the mesh itself, a flood fill across shared
  edges, then each connected piece (her scan is ~4,400 of them, joined at folds) turned the way most of its area faces off
  the nearest bone. Drawn normals pointing inward: 48 % -> 30 %. Rewinding the faces as well changed nothing visible (her shirt
  has an inner layer the culling hides) and was left out.
- Evidence: `02-sash.jpg` (front: the pale patch across her left chest is gone), `03-nape-shoulders.jpg` (Paige's yellow
  shoulder), `05-desktop.jpg` (back).

## 2. Ragged spurs off the sash across her back: her number printed in the sash's colour

- Cause: the chest mark and number print in the trim colour, which on a sash shirt is the sash itself; Ricky's 42 crossed the
  sash's edge and ran off it as red spurs (bind-pose render with the print blanked: the spurs vanish).
- Fix (`materials.js` exports the trim share, `body-material.js`): over the trim the print knocks out to the shirt colour, as
  kits do. Every body, but the 'pro' and solid shirts never reach the knock-out (male frames identical, below).

## 3. The sash torn into shards in the stance: the cloth at her shoulder blade folds with the arm

- Cause: her scan weights 40-70 % of the cloth round the shoulder blade to the arm; with the arm drawn across in the stance it
  folds over itself (posed torso triangles folded: 767, 6.6 % of the torso's area; his 3.4 %), and a pattern carried with the
  cloth showed every fold. Read in the bind pose, the sash on her back covered 1.39x its own area in the stance (a wedge).
- Fix (`body-material.js vPatPos`, female shader only): her shirt's pattern and print are read where the cloth is now, undone
  by her torso bones alone (the vertex's skinning without its arm bones, inverted); sleeves (arm weight .55-.95 and past) keep
  the bind pose so their trim rides the arm. The band now covers 1.00x its area on her back (front .98x -> .97x); the "42"
  reads. The folds themselves are geometry: the area where the pattern runs mirrored is unchanged (6.3 % -> 6.6 %), and shards remain where an arm-
  weighted layer of the fold shows (back view in `02-sash.jpg`).

## 4. Pale, flat skin: stale means, a bright face bake, and a bake with no form

- Causes (same palette, same light, same pose, `--avatar`):
  - Her skin means were the build report's pre-clean ones (lum .251, rgb .350/.227/.186) against the shipped bake's .208 and
    .340/.179/.115 (the male carries a fix for the same thing): her limbs rendered 7-11 % paler than his.
  - Her face and neck are baked 1.43x her limbs' brightness (his 1.15x): her face ~30 % paler than his.
  - Her bake was lit evenly: the spread of its skin albedo smoothed over 2.5 cm (form) is 20-27 % below his on the limbs
    (forearm .255 vs .325, legs .398 vs .542); her normal map is unusable (baked off stray surfaces, rightly left off). Not the
    tone mapping (shared) and not her geometry's lighting (with a flat grey albedo both bodies shade alike).
  - Candidates ruled out: the region masks (skin texels are clean, 15/15 skin on limbs; her neckline mask is a clean line in
    3D, the ragged collar is geometry).
- Fixes (`body-material.js`, all under `CHAINS_F`, her shader only): means re-measured on her bake (MEAN_FIX/SKIN_FIX, holding
  his shares); her head keeps .80 of its tone (HEAD_TONE); her skin AO, baked from her own body by `tools/patch-female-ao.py`
  (each limb and the torso against itself only, both windings, 8 cm, 3D-smoothed) into her mask2's free alpha (her masks have
  no beard zones), folded into her skin's bake at .6 (AO_F) and also occluding the indirect light on her skin.
- Result, skin-only frames (`--iso`, Mobile portrait, hero palette #d9a382; median linear luminance; form = mean |blur 3 px -
  blur 31 px| / mean):

  | view | male | female before | female after |
  |---|---|---|---|
  | front, sun: lum / form | .437 / .096 | .447 / .084 | .434 / .095 |
  | front, shade: lum / form | .142 / .110 | .185 / .115 | .168 / .138 |
  | back, sun: lum / form | .186 / .095 | .245 / .109 | .240 / .131 |
  | torso close, sun: form | .053 | .054 | .059 |

  In Ricky's palest tone (#f6dcc4) the same: front sun .667 -> .655 (male .664), shade .347 -> .337 (male .293). Evidence:
  `01-skin-same-tone.jpg`, `05-desktop.jpg` (shade). Still lighter than him in shade (+18 %) and from behind (+29 %): below.

## 5. Dark smudges at the nape of light hair

- Cause: her hair region caught stray skin and near-black scan texels (8.5 % past 1.8x its mean, 4.7 % under .25x); keeping
  .7 of the bake like his, blond hair went near-black in patches at the nape and pale in streaks.
- Fix: her hair keeps .45 of the bake, its mean raised (.0062 -> .0092) so the bulk sits where it did. `03-nape-shoulders.jpg`.

## Torso twisting with the throwing arm (not fixed: needs the re-rig)

In Ricky's aim stance (runtime weights and bone matrices dumped from the page):
- Fading arm weight with distance off the arm bones (kept within 4.5-6 cm, gone by 9-14 cm): torso vertices with arm
  weight > .4 35.5 % -> 11-32 %, but p99 edge stretch 2.07 -> 2.30-3.98, as round 1's cap.
- Extra weight diffusion (10-80 passes over the shoulder band): p99 stretch 2.07 -> 1.85, folded torso triangles 292 -> 251
  (|x| < .11); no visible change.
- Dual-quaternion skinning (offline, same pose): folded torso triangles 767 -> 745, p99 stretch 2.24 -> 2.33. The folds are
  not candy-wrapper collapse but cloth at ~.56 arm weight swung by a shoulder joint inside her body (x .131/.150, his .17).
Section 3 hides the folds from the sash and print; the shape needs the shoulder joints moved out and the torso re-skinned in
Blender (`tools/build-golfer-v3.py`).

## Male body and cost

- Male: pixel-identical in the staged Mobile frames (portrait and landscape, four views each; two pixels off by one level in
  one frame). `capture.mjs`'s phone tee frame (the male hero on the tee) differs from base by as much as from itself on a
  second run (0.03 % of pixels past 4 levels, max 11; its frames do not reproduce between runs in general, base against
  base 18.6 %, likely the Mobile full-body swap landing on a load-timed frame). Desktop staged frames differ by <= 7 levels
  over 85 % of the frame, sky included and equally off the body: the post chain's time-seeded grain at a slightly different
  game time, not his shader.
  (An unguarded multiply by an exact 1. in the shared shader had moved 0.4 % of his pixels by up to 87 levels; her code sits
  behind a define.)
- Draw calls and triangles identical at every moment (menu, flyover, tee, putt, scorecard; Mobile portrait and landscape,
  Desktop), e.g. Mobile portrait tee 112 / 907,237 before and after, landscape 125 / 931,780, Desktop 158 / 2,292,040.
- Download: her mask2 28.8 -> 152 KB, mask2_lod 14.9 -> 80 KB (the AO, kept to her skin).
- GPU: her vertex shader inverts one 4x4 per vertex (her body only). Frame time, Mobile portrait, base and head alternated
  three times (shared GPU): tee 28.8 / 34.7 / 27.9 ms vs 5.0 / 29.2 / 27.7 ms, putt 50.7 / 53.1 / 32.6 vs 50.1 / 35.6 / 43.6:
  no measurable change.
- `npm test`: 14/14 pass.

## Found, not fixed

- The torso folds at her shoulder blade (above): shards remain where an arm-weighted layer of a fold shows.
- Her collar edge is ragged at close range: the mask's neckline is a clean line in 3D (jersey top and skin bottom never
  overlap by more than 7 %), so it is the scan's frayed collar geometry.
- Her legs are low-poly as drawn (1,440 leg vertices against his 7,253): polygon facets show at the knee close up.
- Her skin is still lighter than his in shade (+18 %) and seen from behind (+29 %) in one palette tone, and Ricky wears the
  palest tone in the locker; her face keeps more form than his (.58 vs .45 by the bake measure) at AO .6.
- A fresh `tools/pack-body-textures.py` run writes beard zones (none for her) into her mask2 alpha: re-run
  `tools/patch-female-ao.py` after it (noted in the packer).
- `capture-motion.mjs` drive clips differ between builds on the flight camera (same throw and event frames): the Mobile
  full-body swap lands on a load-timing-dependent frame; the staged probe waits for the bodies before the round instead.
