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

## Checked and left alone
- Landing camera on a portrait drive: the disc rests at 46% of the half-width, inside the 60% the plan allows.
- The swipe hint over the athlete's ankles: only before the first throw of a round (`body.thrown` fades it).

## Still open
- Tone at the swap: the far spruce card is still darker and bluer than the 3D crown (value .19-.29 against .29-.32).
  The shape no longer changes; the remaining step needs an impostor-shader round.
- Carried from r4: female shoulders (Blender re-rig), flat cloud interiors (Unreal re-render), PR #36 (putt feet).

## Tool
`tools/qa/crown-probe.mjs --eval "<js>"` runs statements in the page before the stills (to try a material change live)
and prints `window.__evalOut`.

## Suites
`npm test` 15/15, `npm run build`, `tools/verify-browser.mjs --dist` and `tools/verify-matches.mjs` all pass.
