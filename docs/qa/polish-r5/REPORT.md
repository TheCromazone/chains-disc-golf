# Polish r5 (2026-11-09)

One scored round on master c6d23b9, phone first (390x844 @2x, Mobile tier), checked on Desktop too.
Captured: the five gauntlet moments on Pine (both tiers), flyover/tee/putt on Meadows, Lakes and Bluffs (phone),
the idle/drive/putt motion clips (phone) and `tools/qa/crown-probe.mjs` stills and its walk across the 3D/impostor swap.

## What works
Menu, HUD, tee and putt framing, the athlete, the basket and the scorecard hold up on all four courses. No console or
shader errors, phone frames at 0.52-0.91M triangles and 69-105 draw calls.

## Problems named and fixed

### 1. Near spruces were bare poles that filled out at the swap (5 -> 7.5)
`spruce-before-after-impostor.jpg` (before, after, the same view as an impostor) and `swap-walk-before-after.jpg`
(39 m, 39.5 m in 3D, 40 m, 40.5 m as the far card; before then after).

A 3D spruce had a bare top third with stubs, half its outer sprays missing and loose flakes beside the crown; 0.5 m
further back the same tree was a full, pointed spruce. Cause: the sky holes and crown pockets that open a broadleaf's
shell (`SKY_HOLES`, the `crownN` cut) work on crown depth, and a conifer's boughs *are* its envelope: every outer spray
sits at depth ~1, and the tip lies past the envelope. The geometry was there (10% of a spruce's leaf vertices are
above 16 m); the shader cut it. The far cards are rendered in Blender without those cuts, hence the pop.

Fix (`src/course.js`): a per-variant `treeOpen` uniform, 0 for spruce and Scots pine, gates both cuts. The clumps the
holes used to remove were also the brightest ones (the clump light, the back light and Mobile's wrap light all rise
with the same per-clump random), so on a conifer those three take `CONIFER_LIGHT` (.35): without it the whole crown
went lime.

Measured in the crown box of the probe stills (foliage pixels: hue 35-170 deg with chroma):

| view (phone)   | coverage before | after | impostor | value before | after | impostor |
|----------------|-----------------|-------|----------|--------------|-------|----------|
| near, 25 m     | .38             | .57   | .52      | .27          | .29   | .19      |
| alone, 33 m    | .54             | .63   | .64      | .32          | .32   | .29      |
| alone, 22 m    | .71             | .85   | .81      | .29          | .31   | .29      |

Desktop: coverage .10/.06/.19 -> .24/.15/.46, value unchanged (.38/.47/.35 -> .38/.47/.33). Scots pines barely change
(their pads sit inside the envelope). Same geometry: triangles and draw calls are identical to the build before.

### 2. The lie ring filled the foot of a phone putt (7.5 -> 8)
`putt-ring-before-after.jpg` (Pine and Bluffs, before then after). The thrower's own lie ring (unlit, his colour, .8
opacity) lay 3 m from the putt camera, a thick red arc under the swipe pad on every course. It now fades out within
4-9 m of the lens (`src/main.js`); the other players' rings, and his own once the camera leaves, show as before.

### 3. The colour step at the swap, phone (second PR, 2026-11-09)
`swap-tone-3d-before-after.jpg`: three trees against the sun, each as its 3D crown, its far card before and its far card
after, from the same spot half a metre inside the 3D range (Pine spruce, Meadows broadleaf, Pine broadleaf).

Measured with `tools/qa/crown-probe.mjs --ring <kind>` (8 bearings round clear trees, each shot in 3D and as the far
card) and `tools/qa/swap-tone.py` (foliage pixels of the crown box). The step was largest looking toward the sun: 20-28
degrees of hue on the back-lit bearings. Cause: Mobile's 3D crowns take a wrap and back light (r4, against "flat, dark
paper cut-outs") and the clump light on their sun-side shell; the far cards took neither.

Fix (`src/course.js`, Mobile only): the far card takes the same wrap and back light, gated to views toward the sun and
half under its own self-shadow, and broadleaves take a shell light by the card's crown normal. Each species has its
share (`FAR_LIGHT`): broadleaf 1, birch .25 (in full its sparse card stepped brighter), conifers their 3D share and no
shell light. `scene.userData.sun.far` holds the three gains for a live A/B.

Mean absolute step over 8 bearings, far card against 3D crown (hue in degrees / saturation / value):

| ring (phone)        | before          | after          |
|---------------------|-----------------|----------------|
| Pine spruce         | 10.2 / .06 / .05 | 1.4 / .03 / .04 |
| Bluffs spruce       | 8.4 / .03 / .04  | 4.3 / .02 / .03 |
| Pine broadleaf      | 9.3 / .05 / .08  | 3.5 / .06 / .03 |
| Meadows broadleaf   | 13.8 / .06 / .07 | 4.9 / .07 / .06 |
| Pine birch          | 2.9 / .05 / .03  | 1.5 / .07 / .03 |
| Bluffs Scots pine   | 5.2 / .02 / .02  | 5.5 / .02 / .02 |

The walk off Pine's first tee (a spruce, 39.5 m then 40 m): hue +19.4 -> +1.3, saturation -.11 -> -.07, value -.07 -> -.05.
Top-half foliage of the phone gauntlet frames moves by at most +.03 saturation and +.03 value. Desktop: its flyover, tee
and putt on Pine are pixel-identical to master (the block is Mobile's), and its own swap showed no step (broadleaf
1.9 / .01 / .01).

Tried and dropped: the shell light on conifers (Pine's value step -.04 -> -.02, but Bluffs' hue 4.3 -> 6.8), a larger
conifer back light (.55: the same trade), the wrap light on every bearing (side-lit cards went 9-13 degrees yellow).

Capture note: frames shot while two other captures ran differed from the same build shot alone in 12-18% of pixels.
Compare builds only from runs made alone.

## Checked and left alone
- Landing camera on a portrait drive: the disc rests at 46% of the half-width, inside the 60% the plan allows.
- The swipe hint over the athlete's ankles: only before the first throw of a round (`body.thrown` fades it).

## Still open
- Tone at the swap: closed in problem 3 to 1-5 degrees of hue; the far cards are still .03-.06 darker or lighter by bearing.
- A far broadleaf card is one even mass: its 3D crown has sky holes and clump contrast (coverage +.04 to +.09 at the swap).
- Mobile culls every shrub card within 40 m of the eye and has no 3D shrub to take its place (the cards' 3D-range cut
  is shared with the trees since the phones got 3D near trees, 2026-10-12): the woods understory starts 40 m out.
- Carried from r4: female shoulders (Blender re-rig), flat cloud interiors (Unreal re-render), PR #36 (putt feet).

## Tool
`tools/qa/crown-probe.mjs --eval "<js>"` runs statements in the page before the stills (to try a material change live)
and prints `window.__evalOut`.

## Suites
`npm test` 15/15, `npm run build`, `tools/verify-browser.mjs --dist` and `tools/verify-matches.mjs` all pass.
