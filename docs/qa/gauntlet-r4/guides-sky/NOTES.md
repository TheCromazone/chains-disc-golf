# Gauntlet r4 round 2: the ground guides and the sky on a phone

Branch `r4-guides` from `593eb2a`. Captures: `tools/capture.mjs` (Mobile 844x390 and 390x844 at dpr 3 `--quality low --mobile`,
Desktop 1440x900 dpr 1 `--quality high`, all four courses, menu / flyover / tee / putt) and the new `tools/qa/guides-probe.mjs`
(tee, a 36 m approach, 3 m and 9.4 m putts on hole 1, 9.4 m putts on holes 2 and 3, a 40 m approach on hole 2; each frame
also drawn with the dome swapped for its own cloud mask, so sky numbers are measured on cloud and clear sky separately).
Before on `593eb2a`, after on this branch, same seed, same frames.

| image | what |
|---|---|
| sky-panorama-before-after.jpg | each course's Mobile panorama (the 2048 file phones load) through Mobile's tone map and grade |
| sky-flyover-before-after.jpg | in game, upright: the Pine and Lakeshore flyovers, Gull Point's 36 m approach, Pine's flyover cloud at 2x |
| ring-before-after.jpg | the landing ring: upright tee (61 m) and 36 m approach, on its side, Desktop |
| arrow-before-after.jpg | the ground arrow: upright approach and 9.4 m putt (gone), 3 m putt (chevrons), on its side |

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
  live on the Windows box, so `--from-webp` regrades the shipped 4096 WebPs once (EXIF-tagged; a second pass is refused) and
  writes both sizes. Same sizes (2048x512 on Mobile), 174-196 KB.
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
  clouds, but the tee's canopy gap goes to the same milky cream wash, so Desktop stays on the gradient (its 4096 files are
  regraded too, unused).

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
  on every drive and every putt from 4 m the aim line carries the direction; inside 4 m main.js hides the putt line (its stub
  stood up from behind his shoulder like a pole), and there the arrow was the only aim cue.
- **Fix.** The arrow is gone where the line aims. Where the line stands down (putts inside 4 m), two chevrons in the line's
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

Frame time: the separate capture runs swung 11-93 ms on the shared GPU (base and branch interleaved three times on Pine on its
side: tee 35/52/21 vs 55/90/53 ms, putt 87/38/34 vs 21/89/93 ms, i.e. noise). In one page, 24 alternating 40-frame windows
with the guides drawn and hidden: 36 m approach 29.4 vs 28.1 ms median (lower quartile 16.0 vs 15.2), 3 m putt 19.1 vs 17.5
(14.1 vs 15.8): no cost above the noise. The sky change is texture content only.

## Found, not fixed

- **Desktop has no clouds** (gradient dome, by an earlier blind check); see section 1.
- **Cloud interiors have no structure.** The regrade lifts and cools them; a backlit heap's core is still one soft tone when a
  putt lens magnifies it ~5x. Procedural billows baked into the panorama read as stucco or blotches at every scale tried
  (2.6 deg and 8 deg lobes); a real fix is a re-render with more multiple scattering (art/unreal/scripts/cloud_material.py).
- **Lakeshore's big underside rim** keeps a thin pinkish line where the gold rim meets the lifted body (soft at phone size).
- **Short putts on its side.** The chevrons sit at the basket's foot, which the first-throw "Swipe up" hint pill covers in
  the capture's 3 m lie (the pill shows until a first throw).
- **The player's lie marker** (a flat 0.27-0.4 m ring in his colour under his feet) is the same kind of flat decal; it marks
  the lie, not the aim, so it was left alone.
