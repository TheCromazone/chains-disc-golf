# Gauntlet r4 round 2: the ground guides and the sky on a phone

Branch `r4-guides` from `593eb2a`. Captures: `tools/capture.mjs` (Mobile 844x390 and 390x844 at dpr 3 `--quality low --mobile`,
Desktop 1440x900 dpr 1 `--quality high`, all four courses, menu / flyover / tee / putt) and the new `tools/qa/guides-probe.mjs`
(tee, a 36 m approach, 3 m and 9.4 m putts on hole 1, 9.4 m putts on holes 2 and 3, a 40 m approach on hole 2; each frame
also drawn with the dome swapped for its own cloud mask, so sky numbers are measured on cloud and clear sky separately).
Before on `593eb2a`, after on this branch, same seed, same frames. "Round 2" below is the verifier's follow-up on top of the
first pass (`e0836b3`): the putt hand-over by lens, the chevrons' gating and placement, and the sky's low heaps (each marked).

| image | what |
|---|---|
| sky-panorama-before-after.jpg | each course's Mobile panorama (the 2048 file phones load) through Mobile's tone map and grade |
| sky-flyover-before-after.jpg | in game, upright: the Pine and Lakeshore flyovers, Gull Point's 36 m approach, Pine's flyover cloud at 2x |
| ring-before-after.jpg | the landing ring: upright tee (61 m) and 36 m approach, on its side, Desktop |
| arrow-before-after.jpg | the ground arrow: upright approach and 9.4 m putt (gone), 3 m putt (chevrons), on its side |
| putt-handover-before-after.jpg | round 2, upright: Pine 3 / 5 / 6.9 m and Meadows 3 / 5 m putts, `e0836b3` over this branch (hint pill hidden) |
| sky-round2.jpg | round 2: sky-only renders through Mobile's tone map, base / first pass / round 2 (Pine's big heap, Gull Point's and Lakeshore's low heaps) |

The two sky images above `ring-` show the first pass (base vs `e0836b3`); `sky-round2.jpg` adds round 2.

## 1. Sky: grey-brown smears instead of clouds

- **Problem.** On Pine Hollow's putt (lead's iPhone, `ios-8-putt-cloud`) a cloud filled the top left of the frame as a dark
  grey-brown smear; `pine-sky.jpg` shows the whole panorama's heaps as blobby grey-brown shapes.
- **Cause: the panorama itself, not the downscale or the dome.** Measured on the shipped files through Mobile's tone map and
  grade (`CustomToneMapping`): from 5 to 30 deg up the clouds sat at the clear sky's own luminance (median cloud/sky .90-1.07)
  and 35-71% of cloud texels were darker than the sky behind them. Unreal's thin multiple scattering left backlit cores a flat
  grey (sky-webp.py's LIFT already patched half of it), and Mobile's warm grade (gain 1.13/1.08/1, the warm highlight split)
  turns a neutral mid-grey tan: grey-brown. The Mobile 2048 file carries the same statistics as the 4096 one (cloud/sky
  within .01 in every band), and a 2x crop of both is the same soft blob: the cores have no structure at any resolution, so a
  bigger texture would not have helped. The dome adds only the haze below 7 deg and the sun's lobe.
- **Fix: a cumulus step in `tools/sky-webp.py`.** Each cloud's luminance, relative to the clear sky at its elevation (the
  median of the clear texels in that band of rows), goes through `sky * 1.6 * (Y / sky)^.6`, measured over the cloud's 10 px
  neighbourhood so a silver rim keeps its lead over the core it frames; its shade takes 30% of the sky's own blue (sky light
  fills a cloud's shade) so the warm grade lands it on blue-grey, not brown; rims keep their gold. It is applied as the change
  the cloud's core takes, times the cloud mask, so soft edges composite into the sky (applied per texel it left a dark outline);
  a grey closing fills the line inside a heap where the mask dropped to 0 (cloud as bright as the sky), and a thin cirrus
  streak keeps its own faint mask (a hard closing or a colour test turned Gull Point's cirrus into opaque cut-outs). The HDRs
  live on the Windows box, so `--from-webp` regrades the shipped 4096 WebPs (the first pass rewrote both sizes; round 2, below,
  keeps the 4096 as the untouched source and writes only the phones' file). Same sizes (2048x512 on Mobile), 174-198 KB.
- **Measured** (Mobile panorama, base -> after; cloud = alpha < .75, clear = alpha > .985):

| course | band | cloud/sky luminance | cloud darker than the sky | cloud r-b (sRGB) |
|---|---|---|---|---|
| Pine Hollow | 5-15 / 15-30 / 30-60 deg | .97 / 1.00 / 1.45 -> 1.13 / 1.25 / 1.68 | 58 / 52 / 1% -> 2 / 4 / 0% | +28 / +8 / +25 -> +32 / +3 / +14 |
| Cedar Meadows | same | .96 / .99 / 1.20 -> 1.11 / 1.25 / 1.47 | 62 / 52 / 11% -> 3 / 4 / 0% | +34 / +15 / +14 -> +36 / +10 / +4 |
| Lakeshore Links | same | .97 / .90 / 1.18 -> 1.12 / 1.17 / 1.46 | 62 / 70 / 11% -> 3 / 4 / 0% | +29 / +8 / -16 -> +34 / +5 / -24 |
| Gull Point Bluffs | same | .92 / 1.07 / 1.49 -> 1.09 / 1.33 / 1.72 | 71 / 35 / 2% -> 3 / 0 / 0% | +22 / +8 / +1 -> +28 / +5 / -5 |

  The low band stays warm on purpose (the golden horizon and the gold rims toward the low sun); above 15 deg the shade cools.

  In game, the probe's cloud pixels (dome mask) on every frame with sky:

| tier | frames with cloud | cloud/sky luminance (median) | cloud darker than the sky and r >= b | e.g. a cloud's median sRGB |
|---|---|---|---|---|
| upright 390x844 | 25 | 1.03 -> 1.20 | 35% -> 9% | Bluff tee (184, 180, 167) -> (221, 215, 197) |
| on its side 844x390 | 13 | .94 -> 1.05 | 80% -> 22% | Lakeshore 36 m (190, 184, 167) -> (229, 221, 202) |
| Desktop 1440x900 | 0 | gradient dome, no clouds | | |

  What stays "darker" is mostly low heaps against the sun's bright aureole (the hole 2-3 putts on Pine, Lakeshore and Gull Point, 72-90%), the
  dome's own glow drawn over both: a backlit heap toward a low sun reads as a soft silhouette with a gold rim, as it should.

- **Look kept.** The sun disc, aureole, shafts and the warm horizon band are the dome's and untouched; the rims toward the sun
  keep their gold. Desktop draws the gradient dome, not the panorama (main.js: "on Desktop the bloom, shafts and aerial pass
  blew a sunlit cloud in the tee's canopy gap into a warm smudge"). I tried the regraded 4096 panorama there: the flyover gains
  clouds, but the tee's canopy gap goes to the same milky cream wash, so Desktop stays on the gradient.

### Round 2: low heaps, heap bases, the 4096 source

- **Problem (verifier).** Sky-only renders at 8 azimuths: lifted whole, the low heaps (Lakeshore and Gull Point 5-15 deg up)
  went to a milky wash that melted into the bright horizon, with grey holes where the cloud mask missed a heap's body; big
  heaps (Lakeshore e12, Pine's az 270 heap) read as flat pale cut-outs, Pine's with a blotchy blue-grey band through its
  middle. And the first pass regraded the shipped lossy 4096 WebPs in place and shipped them, though nothing loads them.
- **Measured** (the Mobile panorama through Mobile's tone map, display luminance, clear sky per 13-row band; "volume" is the
  p90/p10 spread of cloud luminance over the sky's, i.e. how much light-and-shade a heap keeps): the first pass took the
  5-15 deg band's volume from 1.74-2.00 to 1.30-1.39 and the 15-30 band's from 2.95-3.31 to 1.75-1.89. The render's heaps have
  little structure, and lifting their shade toward their lit faces spent most of what they had.
- **Fix (`tools/sky-webp.py`).** (1) Toward the horizon only part of the change: 30% at 5 deg, all of it from 18 deg
  (`HORIZON`), so low heaps keep the render's gold tops over darker bases, seen through the haze; the putt lens's view up into
  the frame's top (the `ios-8` smear, 20-40 deg) keeps the whole lift. (2) Heap bases: a texel with more cloud 36 px above it
  than below gives back up to 45% of its lift and a dome gains up to 15% (`BASES`), so a big heap has a darker flat base under
  a brighter dome instead of one flat tone. (3) The lit/shade split that picks the shade's blue is taken over the 10 px
  neighbourhood, not per texel (the blotches). (4) The 4096 files are back to `593eb2a`'s (the render as graded, never loaded:
  Desktop draws the gradient) and are the source: `--from-webp` now writes only `<id>-mobile.webp` from them, so a re-run starts
  from the same pixels (byte-identical output) and the phones' file is compressed once more, not twice; a 4096 that carries
  the step is refused. Mobile files 175-198 KB, 2048x512 as before.

| course | 5-15 / 15-30 / 30-60 deg | base | first pass | round 2 |
|---|---|---|---|---|
| Pine Hollow | cloud/sky | .87 / .99 / 2.28 | 1.20 / 1.62 / 3.06 | 1.07 / 1.54 / 2.90 |
| | cloud darker than the sky | 74 / 53 / 6% | 1 / 0 / 0% | 35 / 4 / 0% |
| | volume | 1.96 / 3.25 / 5.65 | 1.32 / 1.88 / 3.22 | 1.60 / 2.07 / 3.70 |
| Cedar Meadows | cloud/sky | .90 / .96 / 1.66 | 1.15 / 1.57 / 2.65 | 1.03 / 1.54 / 2.39 |
| | darker | 69 / 58 / 10% | 5 / 0 / 0% | 43 / 3 / 0% |
| | volume | 2.00 / 2.95 / 5.59 | 1.39 / 1.75 / 3.36 | 1.67 / 1.87 / 4.08 |
| Lakeshore Links | cloud/sky | .85 / .92 / 1.29 | 1.13 / 1.47 / 2.19 | 1.03 / 1.43 / 2.10 |
| | darker | 78 / 57 / 1% | 1 / 0 / 0% | 43 / 10 / 0% |
| | volume | 1.74 / 3.21 / 2.14 | 1.30 / 1.89 / 1.62 | 1.56 / 2.11 / 1.84 |
| Gull Point Bluffs | cloud/sky | .86 / .99 / 2.15 | 1.18 / 1.56 / 2.92 | 1.07 / 1.53 / 2.67 |
| | darker | 77 / 52 / 1% | 1 / 0 / 0% | 35 / 2 / 0% |
| | volume | 1.90 / 3.31 / 2.64 | 1.36 / 1.89 / 1.90 | 1.61 / 1.96 / 2.22 |

  The trade is deliberate and confined to the low band: 35-43% of the 5-15 deg cloud is again a little darker than the bright
  horizon sky behind it (base 69-78%), as darker heap bases, while from 15 deg up the first pass's lift stands (0-10% darker,
  base 52-58%). In game (the probe's dome mask, clear sky per 60-row band): upright, 24 frames, cloud/sky median 1.21 base, 1.65
  first pass, 1.61 round 2; cloud darker than the sky behind it, median 79% / 6% / 12% (mean 73 / 11 / 21%); median cloud
  colour (191, 186, 169) / (226, 219, 199) / (221, 212, 193). On its side, 9 frames: 0.93 / 1.16 / 1.09; 73% / 10% / 27% (mean
  69 / 15 / 36%); (193, 185, 167) / (223, 215, 196) / (213, 206, 187). The frames that went back up (Gull Point's 36 m approach
  and hole 2 putt on its side, 54% and 90%; Lakeshore hole 3 upright, 79%) look along the horizon through the haze, where the
  heaps were already faint; at phone size those frames are indistinguishable from the first pass (`sky-round2.jpg` shows the
  renders where it matters). A cut-out look in mid-sky heaps remains (Gull Point 12 deg az 90): the render has no structure
  there to keep.

## 2. Landing reticle: a hairline nobody saw

- **Problem.** At 30-60 m the landing ring was invisible on phones; only the landing tag's 6 px dot marked the spot.
- **Cause.** A `LineLoop` (and a cross) is 1 buffer px: half a css px on a phone's 2x buffer, the ground seen at 2-6 deg, mint
  on grass.
- **Fix (`src/shot-guide.js`).** The ring is drawn the way aim-line.js draws the line: one closed screen-space strip, a 2.4 css
  px mint core in the same soft dark halo (shared `HALO`, `HALO_COLOR` and stroke function), constant on screen at any range,
  over the turf like a drive's line (no depth test). The landing's 1.25 m circle on the ground's tangent plane is projected
  about its centre; its long axis never under 15 css px, its short axis opened to at least .36 of the long one, so a grazing
  view down a fairway shows a ring round the tag's dot instead of a dash. Salmon out of bounds, on the water's surface over a
  pond. One draw (the ring and the cross were two).
- **Result.** `ring-before-after.jpg`. Upright tee at 61 m: an ellipse ~30 x 11 css px round the dot (before: nothing
  visible). Desktop: the same 2.4 px stroke on a 1440 px screen, a quiet ring.

## 3. The ground arrow: a white sticker beside the new aim line

- **Problem.** The flat white arrow (0.68 x 1.15 m, .82 opacity, on every throw, 1.7 m in front of him) read as a decal
  pasted on the grass (`ios-7-arrow`, `ios-6-crop`, `ios-8` lower right) and pulled the eye off round 1's aim line.
- **What it communicated.** Aim direction while dragging. The first-round coach does not use it (coach.js never references it);
  on every drive the aim line carries the direction, and on its side so does every putt from 4 m. Upright it does not (the
  first pass said it did; corrected in round 2, below): the portrait putt lens stands .6 m aside, the depth-tested line leaves
  his hand behind his back, and only a stub reaches the chains until ~7 m. Inside 4 m main.js hides the putt line in both lenses
  (its stub stood up from behind his shoulder like a pole), and there the arrow was the only aim cue.
- **Fix.** The arrow is gone where the line aims. Where the line stands down (first pass: putts inside 4 m), two chevrons in the line's
  own hand (white core 3.4 css px, the same dark halo, constant width at any slant: the quad's fragment turns metres into
  pixels along each arm's normal with the plane's screen derivatives), depth tested so his shoes and the tufts stand in front,
  lie at the basket's foot (far apex .45 m short of the pole) and swing with the aim, green while charging like the line. Both
  putt lenses stand behind him, so the turf within ~2 m of him is behind his legs: the old arrow showed only its two barbs
  upright and a sliver under the frame on its side.
- **Result.** `arrow-before-after.jpg`. Screen area changed round the old arrow's spot (css px^2, frames identical otherwise):

| frame | base | after |
|---|---|---|
| upright 36 m approach / 9.4 m putt / hole 2 40 m approach | 1083 / 2306 / 2685 px^2 of white decal beside his legs | 0 (gone) |
| on its side 36 m / 40 m approach | 1523 / 2389 | 0 |
| Desktop 36 m approach / 9.4 m putt | 8481 / 6300 | 0 |
| upright 3 m putt (Pine, Meadows) | 2565 / 2867 (the arrow) | the chevrons at the basket's foot, ~60 x 20 css px |
| tees | 0 (hidden behind the pad) | 0 |

  On its side the 3 m chevrons sit just under the basket's base plate, where the capture's first-throw hint pill covers them.

### Round 2: the hand-over by lens, gated on the putt, the chevrons clear of his legs

- **Problem (verifier).** Upright, putts from 4 to ~7 m had no aim cue left: the line showed a 10 px stub (101 css px^2 at
  5 m) and the chevrons only came in under 4 m; the old arrow had shown its barb there. The chevrons were gated on
  `!aimLine.mesh.visible`, and `aimLine.set()` hides the line whenever fewer than two points survive, which would have laid
  them at the basket's foot on a drive. Upright at 3 m his shorts covered the chevrons' right arms: two thin white sticks.
- **Measured.** `putt-probe` (scratch; every lie on hole 1-3 of all four courses, hint pill hidden, the frame shot with each
  guide shown and hidden): css px^2 of putt line on screen by distance, median of 12 lies:

| | 4 m | 5 m | 6 m | 7 m | 8 m | 9.4 m |
|---|---|---|---|---|---|---|
| upright 390x844 | 10 | 107 | 162 | 214 | 266 | 336 |
| on its side 844x390 | 344 | 493 | 617 | 718 | 807 | 868 |

  Upright the line at 9.4 m only reaches what it shows at 4 m on its side; at 7 m it is a ~30 px arc into the chains (crops
  in `putt-handover-before-after.jpg`), legible as a curve into the basket, at 5-6 m a 15-25 px stub.
- **Fix (`src/aim-line.js`, `src/main.js`).** `createAimChevrons()` now owns the rule: `shows(putt, dist, tall)` is true for
  putts inside 4 m on its side and inside 7 m upright (`REACH`; `tall` is the aim lens's own portrait test, aspect < 1.2), and
  main.js hides the line and shows the chevrons on exactly that, so a drive never shows them. `lay()` places them: upright
  inside ~5 m their line starts up to .7 m beside him toward the lens (full at 3 m, none from 5 m) and still meets the aim at
  the pin's distance, so both arms clear his shorts and the pair points where the putt goes; on its side (1.2-1.35 m aside)
  nothing hides them and nothing moves. The lens's side is read from the aim camera's target each time they are laid, and a
  frame whose lens settles on his other side (a new lie, a spot mirrored round a trunk) re-lays them. A resize (turning the
  phone swaps the lens) re-runs the preview. `test/shot-guide.test.mjs` checks both.
- **Result** (`putt-handover-before-after.jpg`; css px^2 on screen, 8 lies each, holes 1-2 on all four courses, each frame
  settled 12 frames so the putt's temporal hand-over is out of the numbers):

| upright | `e0836b3` | round 2 |
|---|---|---|
| 3 m | chevrons 496-508 of their 715-792 (his shorts over the right arms) | chevrons 722-761, all of them (= their footprint with him hidden) |
| 5 m | line 104-134 (a stub at the chains) | chevrons 522-554 |
| 6.9 m | line 200-268 | chevrons 402-440 |
| 7.5 m | line | line 241-306 (unchanged) |
| on its side, 3 m and 4.5 m | chevrons 677-723, line 437-513 | the same within 2 px^2 |

  The aim swung 8 deg either way at 3 and 5 m upright: the chevrons swing with it and stay clear of him.

## Mobile cost

Draw calls and triangles, one full frame incl. both shadow maps (`tools/capture.mjs`, identical on all four courses):

| moment | calls | triangles | why |
|---|---|---|---|
| menu, flyover | = | = | sky texture same size (2048x512 on Mobile), dome shader untouched |
| tee, approaches (ring shown) | -2 | +123 | arrow (1 call, 5 tris) gone; ring 1 call / 128 tris replaces LineLoop + cross (2 calls) |
| putt from 4 m (the capture's 6.5 m, the probe's 9.4 m) | -1 | -5 | arrow gone |
| putt inside 4 m | = | -3 | arrow -> chevron quad (2 tris) |

e.g. Mobile on its side, Pine: tee 125 -> 123 calls, 931,780 -> 931,903 tris; putt 110 -> 109, 974,075 -> 974,070. Upright
Pine: tee 112 -> 110, putt 111 -> 110. Desktop Pine: tee 158 -> 156, putt 143 -> 142.

Round 2, same captures against `e0836b3`: every moment's calls are identical on all four courses upright, Pine on its side and
Desktop Pine; triangles too, except the upright putt (the capture's 6.5 m lie, now inside the upright hand-over): the line's
strip gives way to the chevron quad, -56 to -58 tris (Pine 964,366 -> 964,308, Meadows 594,652 -> 594,596, Lakeshore 859,676
-> 859,618, Gull Point 537,076 -> 537,020), same 110 / 72 / 86 / 73 calls. The chevrons' per-frame side check is a dot product
while they show. The sky files are the same size; menu and flyover are unchanged.

Frame time: the separate capture runs swung 11-93 ms on the shared GPU (base and branch interleaved three times on Pine on its
side: tee 35/52/21 vs 55/90/53 ms, putt 87/38/34 vs 21/89/93 ms, i.e. noise). In one page, 24 alternating 40-frame windows
with the guides drawn and hidden: 36 m approach 29.4 vs 28.1 ms median (lower quartile 16.0 vs 15.2), 3 m putt 19.1 vs 17.5
(14.1 vs 15.8): no cost above the noise. The sky change is texture content only.

## Found, not fixed

- **Desktop has no clouds** (gradient dome, by an earlier blind check); see section 1. Its 4096 panoramas are `593eb2a`'s files again
  (the cumulus step's source, unused), so turning them on there would show the old grey-brown grade.
- **Cloud interiors have no structure.** The regrade lifts and cools them; a backlit heap's core is still one soft tone when a
  putt lens magnifies it ~5x. Procedural billows baked into the panorama read as stucco or blotches at every scale tried
  (2.6 deg and 8 deg lobes); a real fix is a re-render with more multiple scattering (art/unreal/scripts/cloud_material.py).
  Round 2's darker heap bases give big heaps a base and a dome, but mid-sky heaps can still read as flat pale cut-outs zoomed in
  (Gull Point 12 deg, az 90), and the low band keeps some darker-than-sky heap bases on purpose (section 1, round 2).
- **The HDRs are on the Windows box.** The Mobile files are regraded from the shipped 4096 WebPs (one lossy generation from
  the render); when the HDRs are back, `python tools/sky-webp.py` (no flag) regrades from them.
- **Upright hand-over at 7 m.** From 7 m the line is a ~30 px arc into the chains (214 css px^2 at 7 m, 336 at 9.4 m): legible,
  but upright never as long as on its side (344 at 4 m). Moving it out of his back is the camera's job (AIM.tall.putt), not
  this branch's.
- **Lakeshore's big underside rim** keeps a thin pinkish line where the gold rim meets the lifted body (soft at phone size).
- **Short putts on its side.** The chevrons sit at the basket's foot, which the first-throw "Swipe up" hint pill covers in
  the capture's 3 m lie (the pill shows until a first throw).
- **The player's lie marker** (a flat 0.27-0.4 m ring in his colour under his feet) is the same kind of flat decal; it marks
  the lie, not the aim, so it was left alone.
