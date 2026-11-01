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

## 3. Temporal: the putt's swipe snapped the whole frame (revised after verify)

- **Problem.** Under the putt's locked lens the frame changed character the instant the swipe began: soft resolved edges and
  textures turned to raw MSAA (bushes speckled, bark lost its sharpen) in one frame (`putt-swipe-snap-before.jpg`, frames
  29 | 30 of the putt clip). Frame-to-frame change left of the athlete: 0.5 on held frames, 3.42 at the swipe.
- **Cause.** `temporal.js` dropped its history and stopped the resolve and sharpen at once whenever `hold` went false
  (windup, release, flight), even with the camera still.
- **Fix (putts only).** With the camera still, the history hands over to the live frame over 3 frames, each taking an even
  share of it, unjittered; after that the live frames keep the resolve's filter and the sharpen with no history (nothing
  moving can streak). A moving camera still goes raw at once. `draw()` passes the hand-over only for `G.throwType === 'putt'`;
  every other throw drops the history at the swipe exactly as before this round. Same cost as the aim frame before it.
  `test/temporal.test.mjs`: the putt hand-over, and a still-camera drive that must drop its history.
- **Why only putts, and why 3 frames (verify round).** The first version handed over across 12 frames for every throw under a
  still camera. On the player's own swipe drive (60 fps, 150 and 300 ms swipes) the body turns to the lens while the history
  still weighs 80-90%: the face, the jersey number, CHAINS and the arm doubled for ~12 frames (`drive-swipe-ghost.jpg`, middle
  row), and the resolved-to-raw step only moved to the flight camera's first move (19.5% of pixels > 8/255 there, base 12.7%).
  The same 12-frame ramp also doubled the jersey lettering on a player's own fast putt (83 and 150 ms swipes at 60 fps; the
  bot's slow 0.9 s putt had hidden it): `putt-swipe-handover.jpg`, middle row. 5 frames still doubled it on the 83 ms swipe
  (third frame, 40% history left); 3 frames end before the body has moved and are clean on both (bottom row).
- **Result.** Share of pixels changing > 8/255, frame to frame (whole frame / left half), the swipe at frame 10 (60 fps) or 30
  (30 fps):

| clip | base (drop) | 12-frame hand-over (f47088e) | now (putt 3 frames, others drop) |
|---|---|---|---|
| player swipe drive, 150 ms, 60 fps: swipe frame | 18.6 / 18.6 | 1.9 / 0.4, then ghosting | 18.9 / 18.9 (= base) |
| same, flight camera's first move (frame 32) | 12.7 / 11.1 | 19.5 / 18.8 | 12.7 / 11.0 (= base) |
| player swipe putt, 150 ms, 60 fps: frames 10-12 | 21.2, 2.2, 4.4 | 1.7, 0.3, 0.9, then ghosting | 3.5, 3.0, 7.4 |
| player swipe putt, 83 ms, 60 fps: frames 10-12 | 21.6, 5.8, 7.1 | 1.8, 2.1, 4.1, then ghosting | 3.6, 5.6, 10.2 |
| bot putt, landscape 30 fps (capture-motion): frames 30-31 | 21.8, 3.6 | 1.8, 1.2 ... 7.5 at 35 | 8.9, 6.0 |
| bot putt, portrait 30 fps: frames 30-31 | 24.8, 5.2 | (not captured) | 12.9, 10.4 |

  The drive is back to base frame for frame (temporal history count 0 from the swipe, the same per-frame change profile on
  the 150 and 300 ms swipes). The putt's one-frame snap becomes three smaller steps (the 30 fps clips step two game frames
  per video frame, so the 50 ms hand-over spans 1.5 video frames there), with no doubling on the athlete.
  `putt-swipe-snap-after.jpg` is frames 29 | 30 of the landscape putt clip. Held-frame stills are unchanged (Pine menu, flyover,
  tee and putt identical to f47088e).

## Checked, nothing to fix

- **The drive's swipe still snaps resolved -> raw (18.6% of pixels, as in base).** A history hand-over ghosts the body as it
  turns to the lens, and a history-free live resolve held through the windup only moves the snap to the flight camera's
  first move. Fixing it needs per-pixel motion (a velocity pass for the athletes) or a resolve that also runs on moving
  frames; both cost Mobile frame time, so it is left for a measured round.

- **3D/impostor tree swap (40 m on Mobile).** A walk-up across the threshold (0.5 m steps, three trees) shows no step above
  the motion's own change (max/median 1.15-1.28, peaks not at the swap); the impostors are renders of the same model.
- **Held-frame shimmer.** The tee address with wind on (60 frames): mean change 0.47/255, no pixel flickering > 10% of frames.
- **Z-fighting.** High, low and far views nudged 1 cm a frame: the flicker maps follow texture and leaf aliasing, none on
  paths, pads, decals or signs (they carry polygon offsets).
- **Shadow acne.** The jersey's wavy dark bands survive with the athletes' shadow receiving off and with doubled biases: they
  are in the jersey texture, not acne (athletes area).
