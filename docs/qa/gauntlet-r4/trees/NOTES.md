# Gauntlet r4, round 2: conifer crowns (spruces and Scots pines), both tiers

Branch `r4-trees` from `593eb2a`. Before = `593eb2a`, after = this branch, same seed, same commands:
`tools/capture.mjs` (phone 844x390 and 390x844 at dpr 3 `--quality low --mobile`; Desktop 1440x900 dpr 1 `--quality high`;
Pine Hollow and Gull Point Bluffs, menu/tee/putt) and the new `tools/qa/crown-probe.mjs` (single crowns from a spot 22 m or
1.35 heights off a tree, the stands 12-36 m and 48-90 m from the first tee, and a walk across the 3D/impostor swap; HUD hidden).

## 1. Conifer crowns: big lobed paper cards -> layered needle sprays

- **Problem.** Spruces and Scots pines read as stacks of big lobed paper cards (round 1's `crowns-before-after.jpg`, its
  "found, not fixed"): on a phone every spruce whorl was a few leaf-shaped blobs and every pine pad a cluster of oak leaves.
- **Cause.** Each spruce branch was one frond card 1.1-2.6 m square plus a crossing card and a hanging curtain; each pine pad
  tuft card was up to 5 m. The atlas cells are long-needle sprig photos; at Mobile's leaf sampling (1.5 mips soft) a card is a
  soft blob with the frond's lobed outline, so a 2 m card drew one 2 m "leaf", one flat tone across it.
- **Fix (`tools/build-trees.py`, geometry only; the leaf atlas is untouched).**
  - Spruce: each branch carries a feather of 0.4-1.3 m sprays every ~0.4 m on alternate sides, about half lying open and
    drooping (more on the long low branches), half on edge, hanging or turned up (so a branch is a layer deep from the side, as
    the crossing card stood), a dense heart by the stem on long branches, an upturned leading shoot and one to three hanging
    branchlets under it; the wood stops at 55% inside the sprays; a spire of three sprays covers the stem's tip.
  - Scots pine: each old pad card's place is drawn as up to five 0.9-1.3 m tufts scattered over that card's own plane, so the
    pad keeps its outline from every side but breaks into separate tufts with sky between.
  - The layout keeps every draw of the old build in its old order (`rng`); the sprays' jitter comes from a per-tree stream
    (`t.fine`), so the pines' structure, the bushes and the deciduous trees come out identical (deciduous.glb and bush.glb are
    byte-identical; TREE_DIMS unchanged).
- **Shadow proxy (cost and ground kept).** The old cards are kept as each conifer's `-shadow` mesh (`ghost()`), drawn only in
  the shadow passes (`src/course.js` planted(); main.js's existing shadow-pass wrapper now also shows `course.shadowOnly`), and
  the sprays no longer cast. So the near trees' shadows cost and look exactly as they did (with the old impostors still in,
  the phone tee's bottom half changed 0.01/255 against base, the putt's 0.05), and the physics record is measured off the
  proxy: colliders identical to base, so no fairness run was needed. The far trees cast from their impostor cards, re-rendered
  from the new crowns, so the dapples their shadows lay on open ground shift (final build, phone tee bottom half: mean change
  4.9/255, signed luma +0.4; Desktop tee 0.8).
- **Evidence.** `spruce-crowns-mobile.jpg` (phone, crop of a stand 25 m off the first tee), `spruce-stands-phone.jpg` (two
  stands at the phone's own size), `scots-crowns-bluff-mobile.jpg` (Bluffs Scots pines, 22 and 28 m), `crowns-desktop.jpg`,
  `impostor-cells.jpg` (the far-tree atlas cells, side on), `moments-phone.jpg` (Pine tee, Bluffs putt and menu: the far
  spruces through the putt's haze now read as layered tiers; the Pine tee's conifers sit behind the HUD). Before left (or
  top), after right (or bottom).

| per variant | spruce0 | spruce1 | scots0 | scots1 | scots2 |
|---|---|---|---|---|---|
| cards drawn, before -> after | 293 -> 868 | 226 -> 627 | 477 -> 932 | 464 -> 977 | 418 -> 824 |
| triangles drawn | 1284 -> 2434 | 1018 -> 1820 | 1530 -> 2440 | 1504 -> 2530 | 1352 -> 2164 |
| shadow proxy (= the old cards) | 586 | 452 | 954 | 928 | 836 |
| side-on drawn area, m^2 (impostor cell) | 55.2 -> 49.3 | 40.2 -> 34.5 | 51.3 -> 41.9 | 53.4 -> 43.2 | 57.7 -> 47.4 |

pine.glb 6,688 -> 15,144 triangles (with the proxies), 112 -> 233 KB. `test/assets.test.mjs` now budgets the tree GLBs per
variant (< 3k drawn, < 1.2k proxy, < 240 KB a file) instead of < 8k and < 120 KB for all variants together.

### Cost (exact: draw calls and triangles; one full frame with its shadow passes)

| frame | menu | tee | putt |
|---|---|---|---|
| phone landscape, Pine Hollow | 944,870 -> 946,822 (+0.2%) | 931,780 -> 957,852 (+2.8%) | 974,075 -> 1,037,311 (+6.5%) |
| phone portrait, Pine Hollow | 870,728 -> 872,680 (+0.2%) | 907,237 -> 933,763 (+2.9%) | 964,371 -> 1,030,117 (+6.8%) |
| phone landscape, Gull Point Bluffs | 532,300 -> 556,274 (+4.5%) | 699,726 -> 709,450 (+1.4%) | 536,951 -> 558,771 (+4.1%) |
| Desktop, Pine Hollow | 2,187,795 -> 2,195,149 (+0.3%) | 2,292,040 -> 2,393,786 (+4.4%) | 2,247,518 -> 2,355,806 (+4.8%) |

Draw calls identical in every frame (the proxies take the sprays' place in the shadow passes). With an earlier, lighter spray
set casting its own shadows (no proxy) the phone putt was +14.0%. The conifer leaves' main pass at the phone Pine putt: 55k ->
119k triangles (65 instances submitted within the 40 m range). Frame time, phone Pine putt, interleaved base/after x3 on a
shared GPU: 25.5 / 27.1 / 14.9 ms against 27.1 / 28.0 / 17.1 (median 25.5 -> 27.1, +1.6 ms; the tee runs were bimodal noise,
13.0 / 24.6 / 11.9 against 24.4 / 24.6 / 13.4).

### Colour (foliage only, top half: hue 35-170, chroma > .06)

| frame | sat before | after | value before | after | value < .15 before | after |
|---|---|---|---|---|---|---|
| phone Pine menu / tee / putt | .51 / .52 / .36 | .51 / .52 / .36 | .43 / .41 / .62 | .43 / .42 / .62 | 1.1 / 4.9 / 0.4% | 1.1 / 4.6 / 0.4% |
| phone Bluffs menu / tee / putt | .29 / .43 / .27 | .27 / .43 / .27 | .39 / .53 / .81 | .41 / .53 / .80 | 0.1 / 4.1 / 0.9% | 0.1 / 4.1 / 0.8% |
| Desktop Pine menu / tee / putt | .34 / .26 / .24 | .34 / .25 / .24 | .45 / .59 / .72 | same | 0 / 0.2 / 0.3% | same |
| phone spruce views, Pine (5) | .44-.57 | .43-.56 | .35-.43 | .37-.45 | 1.1-4.2% | 1.3-4.0% |
| phone Scots views, Pine (4) | .41-.51 | .36-.51 | .40-.45 | .40-.46 | 0.9-4.7% | 0.9-4.4% |
| phone Scots views, Bluffs (4) | .44-.46 | .40-.42 | .36-.40 | .39-.43 | 2.0-4.5% | 2.4-3.8% |
| phone spruce views, Bluffs (4) | .35-.43 | .33-.41 | .30-.45 | .32-.47 | 1.8-3.8% | 1.7-2.6% |

No crown went darker (value +.01 to +.04; the near-black share moved within half a point either way, 0.9-4.9% before,
0.9-4.6% after). Spruce saturation moved -.01 to -.03; the Scots crowns lost .04-.05 (Bluffs .41-.42, inside Disc Golf
Masters' .40-.54; Pine Hollow's densest Scots view .36). Tested at runtime: a greener Scots tint and a steeper sky-visibility
curve each moved it under .005, so it is most likely the finer edges mixing with the sky, not the albedo or the ambient bake.

### The 3D/impostor swap (Mobile 40 m)

The impostors are re-rendered from the new models (cells 4-8; `tools/dilate-foliage.py impostors` refilled the hidden texels
afterwards; the leaf atlas is byte-identical; the deciduous and bush cells, re-rendered from unchanged models, moved by
noise only: 2.3-4.1/255 mean, signed under .8, alpha under .011). Walk across the swap (`crown-probe.mjs --walk spruce`,
0.5 m and one LOD tick per step), change on the walked tree's own crop, swap step against the median step: phone 40 m base
3.14 (crop luma 87.0 -> 69.9 at the swap), after 2.63 (94.7 -> 82.4); Desktop 62 m 2.60 -> 2.66 (121.0 -> 118.5, 123.9 -> 122.6). `swap-40m-mobile.jpg`: frames either side of the swap, base then
after. The pop is smaller than before, not larger. (Round 1's 1.15-1.28 was over the whole frame, where the walk's own
motion dominates; on the tree's crop the swap shows.)

**Could Mobile's treeNear drop?** At 34 m (`--swap 34`) the walk measures 2.92 base and 2.44 after, the same as at 40 m, and
it would cut the conifers' submitted instances by about a quarter. Not changed: at 34 m an impostor texel lands on ~1.26 phone
pixels (1.07 at 40 m), the magnified-card look round 2 moved the swap out to 40 m for, and the swap shares one uniform with
the deciduous trees.

Wind on held frames (eight probe views, two frames 1/60 s apart, top half): mean change .22-.37 -> .25-.45 per frame (finer
foliage moving), pixels changing > 16/255 at most .02% before and after: no shimmer.

## Tools

- `tools/qa/crown-probe.mjs` (new): deterministic crown views (stands from the tee, single trees seen alone, framed by each
  kind's nominal height so two builds shoot the same views), the swap walk, `--swap <m>` to try another 3D range.
- `tools/build-trees.py --models-only`: the GLBs alone, for iterating in the game (the impostor renders took 15-20 min here).
- `tools/dilate-foliage.py [leaves] [impostors]`: a tree rebuild refills only the impostor atlases; refilling the leaf atlas
  again re-encoded it for nothing (1.2/255 mean drift per pass).

## Found, not fixed

- **The Mobile impostors sit darker than the 3D crowns at the swap** (crop luma -12 after, -17 before; Desktop -1 to -3). Round
  1 lifted the Mobile 3D crowns (wrap, transmission, lighter core) but not the billboards; a matching lift in the impostor
  shader would shrink the pop further but changes every far wood on Mobile, so it needs its own measured round.
- **The atlas sprig itself.** The spruce frond and pine tuft cells are long-needle pine-sprig photos; at Mobile's 1.5-mip-soft
  leaf sampling each card is still a soft lobed blob, just a smaller one. A short-needle spruce spray drawn for the job (atlas
  cell 5 is spare) or a conifer-only sharper sampling would read as needles at 20-40 m; both touch the leaf atlas or the shared
  leaf shader, out of this round's scope.
- **The putt pays +6.5% triangles for conifers its frame barely shows.** The near-tree sets draw every tree within 44 m
  except those 15 m behind the lens. Now that the sprays cast nothing, their main-pass set could also drop trees outside the
  view cone (the proxies keep the shadow set), which should more than pay the sprays back.
- pine.glb doubled (112 -> 233 KB; the proxies are 40 KB of it). Lower Draco quantization for the leaf UVs and normals was
  not tried.
