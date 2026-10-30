# Gauntlet r4: how the world renders on phones

Branch `r4-world` from `7e1e53a`. Captures: `tools/capture.mjs` (Mobile: 844x390 and 390x844 at dpr 3, `--quality low --mobile`;
Desktop: 1440x900 dpr 1 `--quality high`), all four courses, before on `7e1e53a`, after on this branch, same seed.

## 1. Aim and putt guide: floating white bars -> one tapered line

- **Problem.** The putt's preview broke into chunky white bars with dark outlines hanging in the air (iOS `ios-3-aim`, the
  landscape putt); the drive's into a string of pale beads.
- **Cause.** `LineMaterial` dashes are measured in metres along the flight (0.7 m dash, 0.38 m gap). The putt lens is a 24 deg
  tele 4-8 m from the line, so one dash spanned ~120 px and each read as a solid plank; down a fairway they shrank to dots.
  Two translucent `Line2`s (white over a dark edge) also overlapped their round caps at every joint.
- **Fix.** `src/aim-line.js`: one continuous screen-space strip per flight (two vertices per flight point, mitred joints, no
  overlaps), a white core inside a soft dark halo in the same fragment (legible on sky, turf and leaves), width tapering with
  depth from 4.2 css px at 3 m to 1.6 at 45 m, faded in where it leaves the player and out where it stops (a guided drive into
  its landing ring at half strength, a swiped drive's 70% to nothing, a putt into the chains), and a slow low swell along a
  drive for direction, faded out where its wavelength falls under ~40 px (no far shimmer). Colours (white, green while
  charging, salmon for OB), the landing ring, the labels and the putt's depth test are kept. `test/aim-line.test.mjs`.
- **Result.** `aim-line-before-after.jpg` (phone landscape putt and tee), `aim-line-desktop-before-after.jpg`,
  `portrait-before-after.jpg` (first pair). One draw instead of two (Pine tee 125 -> 124 calls and 925,066 -> 923,832 triangles; putt 111 -> 110 and 991,471 -> 991,171).

## 2. Tree crowns: pale-rimmed cut-outs with black cores

- **Problem.** On Mobile the crowns read as flat dark paper cut-outs: every spruce frond had a light cream outline and the
  cards turned from the sun were near-black.
- **Cause A (both tiers): the foliage atlases' hidden colour.** The builds bleed leaf colour 24 texels past each edge, but
  the lossy WebP encoder rewrote every fully transparent 8x8 block with a copy of the block to its left: horizontal streaks of
  the conifer cells' tan, pink and orange twig colours and the birch impostors' white bark (`leaf-atlas-before-after.jpg`).
  The keyed pine sprig's own fringe (alpha .25-.5) was grey-tan, (104, 102, 85) against the frond's (72, 83, 52). The mips
  average both in at the coverage edge, and Mobile reads its leaves 1.5 mips soft, so each card got a pale rim.
  **Fix:** `tools/dilate-foliage.py` refills hidden texels per cell (push-pull from the solid leaves), leans the alpha<.75
  fringe to the same fill, and saves with `exact=True` so the encoder keeps it (`leaves.webp`, `impostors.webp`, and
  `impostors_n.webp` under the impostors' coverage, so far cards' normals and crown depth no longer bend at the silhouette).
  Alpha is bit-identical; visible texels move 1.4/255 on average. Run it after `build-foliage.py` / `build-trees.py`.
- **Cause B (Mobile): no light past the terminator.** With no bloom or aerial pass, a leaf card facing away from the sun fell
  to the fills and the crown core sat at a quarter albedo. **Fix (Mobile 3D crowns only, `src/course.js` canopy):** wrapped
  Lambert (.8) on the sun term and back-face transmission (strongest into the sun, gated by the crown thickness `sunThin` and
  the shadow), both under the existing core dimming, and the core albedo a step lighter (.43-.5 instead of .24-.33).
  Desktop unchanged (its foliage numbers below are identical).
- **Result.** `crowns-before-after.jpg` (Pine Hollow tee stands, 10-40 m). Foliage-only colour, top half (hue 35-170, chroma > .06):

| frame | sat before | after | value before | after | value < .15 before | after | 10th pct value before | after |
|---|---|---|---|---|---|---|---|---|
| probe left (crowns 10-40 m) | .53 | .53 | .32 | .33 | 7.8% | 4.0% | .16 | .17 |
| probe right (crowns 10-40 m) | .58 | .58 | .33 | .35 | 7.7% | 4.2% | .16 | .18 |
| land pine menu | .51 | .51 | .39 | .43 | 3.5% | 1.1% | .19 | .22 |
| land pine putt | .35 | .36 | .59 | .62 | 1.5% | 0.4% | .26 | .35 |
| port pine putt | .44 | .46 | .52 | .55 | 4.2% | 1.2% | .18 | .24 |
| land lake putt | .31 | .34 | .63 | .64 | 1.7% | 0.5% | .25 | .33 |
| port lake putt | .32 | .36 | .63 | .62 | 2.4% | 0.5% | .22 | .27 |
| land meadow menu | .46 | .47 | .31 | .33 | 4.7% | 2.0% | .17 | .18 |
| tees, all courses | .35-.52 | same | .41-.62 | same | 1.2-5.9% | 1.1-5.3% | .17-.27 | same |
| desk pine tee / putt | .26 / .24 | .25 / .24 | .59 / .72 | .59 / .72 | 0.2 / 0.4% | same | .41 / .47 | same |

  Saturation stays inside Disc Golf Masters' .40-.54 where it was; the gain is in the near-black share where 3D crowns fill
  the frame (halved). Tee frames are mostly impostor stands and barely move (their remaining "dark foliage" includes the dark
  green HUD buttons). Cost: in-page A/B of the new terms at the Pine Hollow tee, 24 alternating 40-frame windows: median 22.09
  ms off / 21.95 on, lower quartile 18.44 / 16.65 (noise from ~11 other headless Chromes on the GPU; no measurable cost).
  Triangles and draw calls identical.

## 3. Temporal: the putt's swipe snapped the whole frame

- **Problem.** Under the putt's locked lens the frame changed character the instant the swipe began: soft resolved edges and
  textures turned to raw MSAA (bushes speckled, bark lost its sharpen) in one frame (`putt-swipe-snap-before.jpg`, frames
  29 | 30 of the putt clip). Frame-to-frame change left of the athlete: 0.5 on held frames, 3.42 at the swipe.
- **Cause.** `temporal.js` dropped its history and stopped the resolve and sharpen at once whenever `hold` went false
  (windup, release, flight), even with the camera still.
- **Fix.** With the camera still, the history now hands over to the live frame over 12 frames, each taking an even share of
  it, unjittered; after that the live frames keep the resolve's filter and the sharpen with no history (nothing moving can
  streak). A moving camera still goes raw at once. Same cost as the aim frame before it. `test/temporal.test.mjs` updated.
- **Result.** Largest step at the swipe 3.42 -> 1.28 (frames 30-35: 1.04 .70 .68 .94 .88 1.28, against ~0.9-1.1 of the arm's
  own motion), `putt-swipe-snap-after.jpg`. No streaks on the arm in the hand-over frames.

## Checked, nothing to fix

- **3D/impostor tree swap (40 m on Mobile).** A walk-up across the threshold (0.5 m steps, three trees) shows no step above
  the motion's own change (max/median 1.15-1.28, peaks not at the swap); the impostors are renders of the same model.
- **Held-frame shimmer.** The tee address with wind on (60 frames): mean change 0.47/255, no pixel flickering > 10% of frames.
- **Z-fighting.** High, low and far views nudged 1 cm a frame: the flicker maps follow texture and leaf aliasing, none on
  paths, pads, decals or signs (they carry polygon offsets).
- **Shadow acne.** The jersey's wavy dark bands survive with the athletes' shadow receiving off and with doubled biases: they
  are in the jersey texture, not acne (athletes area).
