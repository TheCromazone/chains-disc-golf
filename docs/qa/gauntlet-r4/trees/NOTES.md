# Gauntlet r4, round 2: conifer crowns (spruces and Scots pines), both tiers

Branch `r4-trees` from `593eb2a`. Before = `593eb2a` ("base"), "round 1" = this branch at `fedc2cc` (the first fix, which the
verifier kept with fixes), "now" = this branch. Same seed, same commands: `tools/capture.mjs` (phone 844x390 and 390x844 at
dpr 3 `--quality low --mobile`; Desktop 1440x900 dpr 1 `--quality high`; Pine Hollow, Gull Point Bluffs, Meadows, Lake) and
`tools/qa/crown-probe.mjs` (single crowns from a spot 22 m or 1.35 heights off a tree, stands 12-36 m and 48-90 m from the
first tee, a walk across the 3D/impostor swap; HUD hidden). The probe's views match base to 1 cm and 0.1 deg (it reads tree
heights off the impostor cards, rounded). Base and round-1 captures are the verifier's (same commands, same machine).

## 1. Conifer crowns: big lobed paper cards -> layered needle sprays (round 1, kept)

- **Problem.** Spruces and Scots pines read as stacks of big lobed paper cards: each spruce whorl a few leaf-shaped blobs,
  each pine pad a cluster of oak leaves (round 1's world NOTES, "found, not fixed").
- **Cause.** One 1.1-2.6 m frond card per spruce branch (plus a crossing card and a curtain), Scots tuft cards up to 5 m. The
  atlas cells are long-needle sprig photos; at Mobile's 1.5-mip-soft leaf sampling a 2 m card is one soft lobed blob.
- **Fix (`tools/build-trees.py`, geometry only; leaves.webp untouched).** Spruce branches carry feathers of 0.4-1.3 m sprays,
  half open and drooping, half on edge, with a heart, a leading shoot and hanging branchlets; Scots pads draw each old card's
  place as up to five tufts. Every old layout draw stays in its order on `rng`; spray jitter comes from a per-tree `t.fine`,
  so the pines' structure, the bushes and the deciduous trees are unchanged (deciduous.glb, bush.glb, leaves.webp and
  leaves_n.webp byte-identical to base). Shadow proxy: each conifer's old cards ship as a `<variant>-shadow` mesh drawn only in
  the shadow passes, so near-tree shadows, shadow cost and the physics record (TREE_DIMS) are exactly base's.

## 2. Round-2 fixes (the verifier's "ship with fixes")

### 2a. Spruce tops no longer throw "confetti"

- **Problem.** Bright yellow-green sprays floated beside the top third of the stems against the sky (looking-up views, phone
  and Desktop; `confetti-tops-phone.jpg`, `confetti-tops-desktop.jpg`: base, round 1, now). Side on, the impostor silhouettes
  had 47 and 19 pieces apart from the crown (base 4 and 8).
- **Cause.** Measured per card (a Blender dump of every card with the line that placed it, rasterised side on): on the
  0.6-1.2 m top branches each spray was 0.8-1.1 m and fanned up to 48 deg off the branch, so their far ends stood up to 2 m
  out; the first spray started a third of the way out, leaving a gap at the stem; the leading shoot turned up off the
  drooping feather, and it and the hanging branchlets faced along the branch, so from the side they were slivers whose tips
  broke off as specks.
- **Fix.** No spray reaches past 1.1 L + 0.1 m from the stem (`fit()`: the card is shortened, 34 of ~1,300 were) and none is
  over 0.65 L; on short branches the fan narrows with L (`wide`); the feather starts at the stem, and short branches get a heart
  card from the stem, half on edge; the leading shoot lies along the sprays' mean droop and is turned half on edge; the hanging
  branchlets turn ~40 deg across the branch, alternately; two sprays hug the stem above each whorl of the top 30% (a spire);
  the wood runs to 75% on short branches. The rng layout, the proxies and TREE_DIMS are unchanged.
- **Evidence.** Impostor cells side on (alpha > .5, 256 x 512; `impostor-cells.jpg`, detached pieces ringed red):

| pieces apart from the crown (>= 4 texels) / detached m^2 | base | round 1 | now |
|---|---|---|---|
| spruce0 | 4 (0) / .01 | 47 (8) / .96 | 12 (3) / .43 |
| spruce1 | 8 (3) / .02 | 19 (9) / .69 | 11 (2) / .33 |
| scots0 | 11 (8) / 2.07 | 77 (46) / 3.39 | 38 (23) / 2.58 |
| scots1 | 9 (6) / 4.66 | 74 (54) / 4.12 | 23 (17) / 3.92 |
| scots2 | 13 (7) / .31 | 75 (53) / 3.52 | 20 (11) / .74 |

  (Base's Scots pieces are whole pads on limbs too thin to draw at that size; deciduous cells are unchanged.) In the probe
  views the top third is now a narrow spire round the leader (`confetti-tops-*`), and the single crowns hold together
  (`spruce-crowns-mobile.jpg`: Pine 22 m and Lake 25 m).

### 2b. Scots tufts stay over the old cards' needles

- **Problem/cause.** Each tuft was scattered `lat * size * +-.3` across the whole 2-5 m card, its clear corners included, and
  fanned +-22 deg: side on, 74-77 flecks stood off the pads.
- **Fix.** A tuft's needles land inside the old card's opaque part (the tuft cell's .15-.73 along, -.17..+.34 across, narrow
  at the stem): along `.15 + .58 w` of the card's room, across `.085 +- .15 (.4 + .6 w)`, fan +-14 deg. Tufts are 1-1.6 m
  (0.9-1.3 before): 0.9-1.3 m tufts within the footprint still left 34-57 pieces, and 742-796 cards a tree instead of 932-977
  costs fewer triangles. Pieces 20-38 now (`scots-crowns-bluff-mobile.jpg`: base, round 1, now).
- **Tried, not kept.** More tufts per old card (`m = (size/sz)^1.5`, 813-970 cards) moved Bluffs foliage saturation by only
  +.001-.004 (see 2e).

### 2c. Conifer shadows: far cards cast the old cards too (`impostors_s.webp`)

- **Problem.** The far conifers cast through impostor cards rendered from the sparser sprays while the near ones cast the old
  cards, so the dapples on open ground shifted (round 1: phone Pine tee bottom half |d| 5.1/255; after 2a/2b it would have been
  6.3, signed +3.4, 12.9% of pixels > 16) and a conifer's shadow changed shape at the 40 m swap.
- **Fix.** The impostor build renders each conifer's wood plus its `-shadow` proxy side on with the cell's framing and writes
  what each card casts to `assets/textures/foliage/impostors_s.webp` (grey, half size, 62 KB: the shadow maps' texels are 6-12
  cm, its 8; the other trees' own coverage). course.js feeds it to the impostor depth material as its own uniform (three's
  shadow pass sets a depth material's `map` to the object material's). Without the file (or its manifest entry) the depth
  pass casts the impostor's own coverage, as before.
- **Evidence** (`ground-tee-phone.jpg`), bottom half against base, |d| / signed / share > 16:

| frame | round 1 | now |
|---|---|---|
| phone Pine tee | 5.13 / -1.18 / 9.2% | 1.15 / -0.04 / 0.03% |
| portrait Pine tee | 6.63 / -3.09 / 12.6% | 1.40 / +0.00 / 0.01% |
| Desktop Pine tee | 0.74 / +0.22 / 0.27% | 0.66 / +0.02 / 0.03% |
| phone Bluffs putt | 0.69 / +0.32 / 1.3% | 0.47 / +0.21 / 0.8% |
| phone Meadows tee (deciduous only) | 0.00 | 0.51 / +0.04 / 0.04% (their cast is now the half-size copy) |

### 2d. Sets only the lens sees (Mobile cost)

- **Problem.** The sprays cost the main pass for every conifer within 44 m except those 15 m behind the camera: phone Pine putt
  +6.5% triangles (portrait +6.8%) for conifers its frame barely shows.
- **Fix (`src/course.js` treeLod, `src/main.js` passes the camera).** A near set that casts nothing (the conifers' sprays,
  whose proxies cast; Full's woods shrubs) leaves out trees past 8 m whose crown (9 m round the trunk) lies wholly outside the
  view's half-width (widened for the pitch) plus 25 deg. A 12 deg turn, a 4 m move or a lens change refreshes the sets at once
  instead of on the quarter-second tick. Casting sets, proxies and impostors are untouched.
- **Evidence.** Per-frame check over the motion clips (menu, flyover, tee, bot run-up, flight, putt; a culled tree counts as
  a hole when any point of its crown's extent ring projects into the frame within the 3D range): 0 holes in 1,776 phone,
  1,532 portrait and 1,674 Desktop frames (35%, 61% and 45% of the conifer instances culled). Stills with the cull on and off:
  pixel-identical at the menu, tee and putt; the flyover differs only where its fresher LOD eye moves the 3D/impostor ring.

### 2e. What stays from the review

- Colour: no crown went darker (value +.00 to +.04). Bluffs saturation -.02 to -.04 (crown probes .44-.46 -> .40-.42,
  menu top half .291 -> .267, putt .273 -> .263), as in round 1. Not the bake: the leaves' mean baked sky visibility equals
  base's (Scots .81-.85 against .80-.84) and denser pads changed it by under .005; it is the finer crowns' edges mixing with
  the hazy sky. Pine and Desktop frames within .01.
- pine.glb 112 -> 217 KB (round 1 233; the proxies are 40 KB); with impostors_s the tree download is 337 + 62 KB. 12-bit leaf
  UVs saved 2 KB: not kept.

## Cost (exact: draw calls and triangles, one full frame with its shadow passes)

| frame | base | round 1 | now |
|---|---|---|---|
| phone Pine menu / flyover / tee / putt | 944,870 / 874,440 / 931,780 / 974,075 | +0.2 / +3.9 / +2.8 / +6.5% | +0.2 / -0.3 / +2.0 / -0.2% |
| portrait Pine menu / tee / putt | 870,728 / 907,237 / 964,371 | +0.2 / +2.9 / +6.8% | -0.1 / +0.2 / -2.6% |
| Desktop Pine menu / tee / putt | 2,187,795 / 2,292,040 / 2,247,518 | +0.3 / +4.4 / +4.8% | -2.2 / +2.8 / -2.5% |
| phone Bluffs menu / tee / putt | 532,300 / 699,726 / 536,951 | +4.5 / +1.4 / +4.1% | -1.0 / -0.8 / +1.1% |
| portrait Bluffs tee / putt | 682,457 / 537,081 | +1.6 / +4.6% | -1.4 / -0.3% |
| Desktop Bluffs tee / putt | 1,825,522 / 1,587,546 | +3.2 / +4.7% | -1.5 / +0.1% |
| phone Meadows, Lake (6 frames) | | 0.0 to +1.6% | -0.8 to +0.1% |

Draw calls equal to base or 1-4 fewer (a set the lens cull empties is not drawn). Per variant, triangles drawn: spruce0 2,508,
spruce1 1,884, scots0 2,060, scots1 2,168, scots2 1,862 (budget < 3,000; proxies 452-954 < 1,200).
Frame time, phone Pine (844x390 dpr 3, Mobile), base and now interleaved three times on the shared GPU, ms per frame (median):
menu 15.6 / 16.0 / 16.5 (16.0) against 16.0 / 17.2 / 16.6 (16.6); tee 10.8 / 11.7 / 12.0 (11.7) against 11.4 / 12.2 / 11.9
(11.9); putt 13.0 / 14.3 / 15.0 (14.3) against 13.6 / 14.4 / 13.9 (13.9). Within the noise either way.

## 3D/impostor swap (Mobile 40 m, Desktop 62 m)

`crown-probe.mjs --near 0 --far 0 --iso 0 --walk spruce` (0.5 m and one LOD tick per step, 36-44 m), change per step in the
centre 40% of the frame, the swap step (40.0 -> 40.5 m) against the median step: phone base 1.09, now 1.06 (round 1's walk
1.07); Desktop at 62 m 1.00 and 0.99. On the full probe's walk, a tight crop (.45-.55 x .05-.60): phone 1.06 base, 1.09 now,
Desktop .98 and .95, crop luma 89.7 -> 90.2 at the swap now. The walk's own motion is as big as the swap in every build: no
pop beyond base's (`swap-40m-mobile.jpg`: the frames either side of it, base and now). Round 1's 3.14 -> 2.63 came from a
crop I could not reproduce. With 2c a conifer's shadow keeps its shape across the swap (both sides cast the old cards).

Mobile treeNear not lowered (round 1's reasons stand: at 34 m an impostor texel covers ~1.26 phone pixels, the magnified-card
look round 2 moved the swap out for, and one uniform serves every tree; the lens cull already removes most of what a lower
range would). Wind on held frames (`capture-motion --clips idle`, top half): menu hold > 16/255 .158% base, .158% now; tee
hold .202% base, .186% now. No shimmer.

## Tools

- `tools/qa/crown-probe.mjs` (round 1): deterministic crown views, stands, the swap walk, `--swap <m>`.
- `tools/build-trees.py --models-only` writes the GLBs alone (~20 s; the full build with impostors ~8-15 min here).
- `tools/dilate-foliage.py [leaves] [impostors]`: a tree rebuild refills only the impostor atlases.

## Found, not fixed

- The Mobile impostors render darker than the 3D crowns at the swap (round 1's finding; the impostor shader's lift is its
  own round: it changes every far wood on Mobile).
- The atlas sprig itself: each spray is still a cut-out of a long-needle pine-sprig photo, a soft lobed shape at Mobile's
  leaf sampling. A short-needle spruce spray drawn for the job (atlas cell 5 is spare) would read as needles at 20-40 m.
- Scots crowns side on cover 23% less than base (40-44 against 51-58 m^2): lacier pads, and the Bluffs saturation note above.
- A few sprays still stand off the near trees' mid-crowns against the sky in close looking-up views (fewer than round 1).
