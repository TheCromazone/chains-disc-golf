# Gauntlet r4 — athletes (bodies and motion, phone and desktop)

Branch `r4-athletes` from `7e1e53a`. Captures: `tools/capture.mjs` / `tools/capture-motion.mjs` (Mobile = 844x390 or 390x844 at
dpr 3, `--quality low --mobile`; Desktop = 1440x900 dpr 1 `--quality high`). Motion numbers come from the new
`tools/qa/athlete-probe.mjs` (60 Hz virtual clock, world positions of pelvis, head, wrists, sole contact points and disc;
the flyover plays out naturally). Two passes: the first (`ebadcf7`, sections 1-4), then a fix pass on the verifier's findings
(section 5). Every motion number below is the current probe run on three source trees: base `7e1e53a`, first pass `ebadcf7`
and the branch head, all with the same tool and seed.

## 1. Waiting athletes wore the low-detail body (and were rebuilt every turn)

- Problem: on Mobile only the thrower wore the full body; bots and the player waiting beside the tee camera wore the LOD
  (6.2k-tri male: blocky shoulders, a dark torn seam at the armpit, coarser hands). Every turn rebuilt two characters, which
  also reset whoever had just thrown (mid-reaction).
- Cause: `createPlayer` built players `i > 0` on the LOD and `setupTurn` swapped full/LOD per turn (`setPlayerDetail`).
- Fix: every round athlete wears the full body (`main.js upgradeBody`, one swap only if Mobile's full bodies land after the
  round started). To keep the cost flat, each full body casts its shadow from a proxy: the low-detail body bound to the same
  skeleton (both GLBs share rig and bind: inverse-bind difference 0), drawn only inside `renderer.shadowMap.render`
  (`gltf-player.js SHADOW_ONLY`, wrapper in `main.js`). The visible body casts none.
- Evidence: `02-bystander-full-body.jpg` (bot's turn, phone portrait: the waiting player before = LOD, after = full).
- Cost (calls / triangles, one full frame incl. both shadow maps; calls identical everywhere):

  | moment | Mobile land before | after | Mobile portrait before | after | Desktop before | after |
  |---|---|---|---|---|---|---|
  | menu | 80 / 972,198 | 80 / 944,870 | 73 / 898,056 | 73 / 870,728 | 93 / 2,200,195 | 93 / 2,187,795 |
  | flyover | 125 / 849,312 | 125 / 874,440 | 113 / 848,864 | 113 / 873,992 | 162 / 2,194,733 | 162 / 2,208,997 |
  | tee | 125 / 925,066 | 125 / 927,382 | 113 / 913,415 | 113 / 906,551 | 159 / 2,285,210 | 159 / 2,293,274 |
  | putt | 111 / 991,471 | 111 / 974,375 | 112 / 981,767 | 112 / 964,671 | 144 / 2,249,986 | 144 / 2,247,818 |

  Without the proxy the all-full round cost +66k at the phone tee (991,366) and +29k at the putt, and +20k at the desktop tee
  (2,305,674, over its 2.3M budget). The desktop menu frame is pixel-identical with the proxy (0.001 % of pixels differ), and
  so are the phone tee frames.
- Where it does cost (the table above only has the hero's own moments): every frame with the waiting athletes in it.
  - Bot turns (phone portrait, the waiting players beside the tee camera, verifier's `botturn.mjs`):
    949,898 -> 979,898, 917,437 -> 965,930, 947,100 -> 992,310 and 952,476 -> 979,872 (+3.2 to +5.3 %). Landscape bot turn:
    969,754 -> 999,754 (+3.1 %).
  - Flyover: +3.0 to +3.7 % on all four courses (Mobile +25k, Desktop +14k).
  - Draw calls are unchanged at every moment.
  - frame time: sequential runs swung 2x between identical builds (shared GPU), so the verifier ran both builds live,
    interleaved (8 blocks of 40 renders): tee 29.9 -> 27.8 ms, bot turn 18.9 -> 18.2 ms. No measurable frame-time cost; the
    triangle rise is the cost, and it buys a full body on every athlete near the camera.
- Fix pass: the shadow proxy is now taken only from an LOD whose skeleton names the same bones in the same order (it is bound
  to the full body's skeleton by index); anything else casts from the full body's own geometry.

## 2. Menu: the hand-on-hip arm read as a rubber noodle

- Problem: upper arm stuck out level, elbow 44 cm off the spine, forearm hanging to a hand floating ~10 cm off the waist,
  palm turned backwards.
- Cause: the HERO pose's left shoulder/elbow angles (`throw-poses.js HERO`).
- Fix: re-solved on the real rig (Nelder-Mead against the bones): elbow out, down and ~10 cm behind the shoulder, wrist on the
  side of the waist above the hem, forearm rolled so the palm faces in. Elbow (-.44, 1.30, .04) -> (-.37, 1.23, .12),
  wrist (-.28, 1.07, -.02) -> (-.21, 1.03, .00) (group metres); palm normal now points into the body (.80 x) instead of back.
- Evidence: `01-menu-hip-arm.jpg` (top: the phone landscape menu; bottom: front close-up; left before, right after).

## 3. Female athletes: jersey torn into chevrons and patches (ios-5 "Ricky")

- Problem: Ricky in ios-5 wears the *full* body on her own turn; her sash and back showed zig-zag chevrons, pale and dark
  patches. The LOD shows the same (both female GLBs share the issue), so it was not an LOD problem.
- Cause (measured): her scan weights 40-70 % of half her chest/back band to the arm bones (male ~0). The cloth rumple
  orientation is picked by arm weight, so torso and sleeve orientations mixed into chevrons (isolation renders: removing the
  crease lines alone removed them; the knit, folds and rumple bump did not). Her bake is a patchwork of small UV islands whose
  baked shading disagrees island to island.
- Fix (`body-material.js`): her cloth keeps the torso orientation (`uArmCloth`), her jersey keeps half its baked shading
  (`DETAIL_F`). Male unchanged.
- Evidence: `03-female-jersey.jpg` (top back, bottom front; left before, right after).
- Tried and reverted: capping her torso's arm weights in `player-skinning.js` (chest band arm weight >.4: 42 % -> 7 %) made the
  seam sharper: p99 edge stretch through the throws rose from 2.0-2.6 to 3.2-4.1. Needs a re-rig (see below).
- Verifier: partly fixed. The chevrons are gone, but a ragged edge still runs along the sash across the upper back, a dark
  patch sits near the nape and pale scratches remain on the front of the sash, at phone tee size and in the menu. The jersey
  is also a little flatter (half the baked shading). Still open (below).

## 4. Motion glitches (probe) — ranked by how visible at phone size

| # | glitch | where | before | after |
|---|---|---|---|---|
| 1 | both feet skate 30-40 cm across the tee into the aim stance at every turn start | tee, after the flyover cut and after every other turn | R 36.9 / L 29.2 cm loaded slide over ~0.25 s, P95 second difference 13.2 mm | in the stance 2 frames after the cut, then R 1.8 / L 1.7 cm, P95 0.17 mm (fix pass: on the cut frame, and on turn cuts without a move; section 5) |
| 2 | putt finish -> idle: both soles glide ~15 cm in .22 s in the locked putt frame | putt | R 15.1 cm while loaded | each foot steps (lifted ~13 cm); R 5.8 cm (the stroke's own pivot), L 3.7 cm at touchdown; a 3.4 cm pelvis rise as he stands out of the crouch (fix pass: 0.57 cm/frame, R 1.4 cm; section 5) |
| 3 | run-up foot skate (x-step / crow hop) | bot drive, run-up camera | R 50 cm / L 33 cm loaded | not fixed (authoring, below) |
| 4 | arm hitch at the run-up -> drive hand-over | bot drive | wrist 6.5 cm/frame, then 0.2 | not fixed |

- Fix 1 (`gltf-player.js`, `athlete-motion.js`, `player.js`, `main.js`): `snap()` when main.js moves an athlete to a new spot
  (turn lie, parked bystander, staging): six frames in which the overlays and athlete-motion cross-fades are instant, and the
  first steered frame counts as aiming.
- Fix 2 (`gltf-player.js`): out of a throw clip into the idle/mood, the legs re-plant one at a time over .5 s, the higher foot
  first, each lifted through its move while the grounding keeps the other planted.
- Evidence: `04-tee-stance-entry.jpg` (portrait capture-motion `idle`, frames 90-102 of the tee: top before, bottom after),
  `05-putt-step.jpg` (portrait `putt` frames 108-122: top before, both feet gliding; bottom after, one foot lifted at a time).
- Unchanged by design: the drives (swipe and bot) give the same per-frame numbers before and after; the run-up scene's bot
  picked a different drive between the two builds, so its numbers are not comparable.
- No disc separation before launch in any scene (disc to socket held at 7.5-13.1 cm, max frame step <= 1.8 cm except the
  stance snap); no hand inside the torso or thighs; reactions (celebrate, slump, clap) slide < 4 cm. Desktop spot check (same
  sampler): tee 1.3/1.4 cm, putt 6.4 cm.

## 5. Fix pass (verifier's findings on `ebadcf7`)

Probe, Mobile landscape 844x390 (portrait 390x844 in brackets where it differs), base `7e1e53a` -> first pass `ebadcf7` -> head.
"Stand-up" = the frames after the putt stroke, in the putt's locked camera.

| glitch | measure | base | first pass | head |
|---|---|---|---|---|
| putt stand-up: the pelvis snapped up when the first foot came down | pelvis max move / frame | 0.97 cm | 3.45 cm (3.44) | 0.57 cm |
| | pelvis max change of vertical speed / frame | 0.97 cm | 2.64 cm | 0.47 cm |
| | head max move / frame | 1.33 cm | 3.54 cm | 0.96 cm |
| | loaded slide | R 15.1 cm (17.8) | R 5.8 cm (5.5) | R 1.4 cm (1.3) |
| | pops flagged | 0 | 2 (root, head @199) | 0 |
| tap-in (1.5 m) into the celebrate | pelvis max move / change of speed | 0.49 / 0.49 cm | 2.33 / 2.42 cm | 0.27 / 0.13 cm |
| | loaded slide | R 9.1 / L 7.8 cm | R 5.4 / L 3.5 cm | R 2.7 / L 2.6 cm (the celebrate's own) |
| tee, after the flyover cut | frames of idle after the cut | 0 (skates in over ~.25 s) | 2, then wrist 102.9 cm, sole 47.1, head 14.9 in one frame | 0: the stance on the cut frame itself |
| | loaded slide | R 36.9 / L 29.2 cm | R 1.8 / L 1.1 cm | R 1.9 / L 1.2 cm |
| | disc grip max step | 0.6 cm | 4.4 cm | 0 |
| `lie` (new scene): the turn cuts to a player already standing at his lie | loaded slide into the stance | R 34.0 cm (33.5) | R 36.2 cm (35.9) | R 0.6 cm (0.7) |
| | wrist/head jitter P95 | 46.1 mm | 47.6 mm | 0.17 mm |
| drives: the stand after the follow-through (camera on the disc) | loaded slide, bot backhand / swipe backhand / turn | L 22 / 24.9 / 17.9 cm | 20.9 / 20.5 / 19.8 cm | 5.3 / 5.2 / 5.5 cm |

Desktop spot check (1440x900, Desktop tier, head): putt stand-up 0.53 cm/frame, change of speed 0.32 cm; tap-in 0.27 / 0.13 cm;
tee and lie: no pops, slides <= 1.3 cm. No pops, disc separation or hands inside the body in any scene on any tier; the
procedural empty-assets athletes (manifest blocked) run through bot turns with no errors.

- Putt stand-up (`gltf-player.js`, `athlete-motion.js`). The first pass's re-plant left the height to the grounding, which
  stands the body on the longer leg: the first foot down (idle-length) lifted him 7 cm in four frames, and the foot carrying
  him swung ~6 cm with the pelvis's turn. Now the step plans the body's height: it rises while the second foot steps, as high
  as the first foot's leg holds him, and the rest as his weight settles onto the second the way the idle stands. Each leg
  reaches its foot's spot by a two-bone IK (knee about its bend axis, then the hip), so the foot carrying him holds still;
  the IK aims the sole's centre and corrects twice for the shoe's pitch (the rig has no ankle). athlete-motion runs it after
  its cross-fades and before its grounding (`update(dt, mode, phase, legs)`, per-shoe `sole()`/`centre()`). STEP .5 -> .6 s.
  Evidence: `06-putt-standup.jpg` (phone portrait, putt frames 184-228 every 4th; rows: base gliding, first pass holding low
  then jumping between 200 and 204, head rising smoothly).
- Stance on the cut (`main.js setupTurn`, `snap(aim)` on both rigs). `snap()` now takes the throw he lines up and seeds the
  steer and grip the stance waits for, so the first frame after placement is the stance; it is called after the throw type
  and the run-up are known, and also when the turn cuts to a player who did not move (every second shot: he waited at his
  lie and skated 35 cm into the stance on camera, base and first pass alike). The first pass's relaxed thresholds (one steered
  frame while snapping) are gone, so a parked bystander's `getPhase()` stays null.
  Evidence: `07-stance-on-the-cut.jpg` (top: the flyover's cut frame and the next two, first pass over head; bottom: the turn
  cutting to Ricky at her lie, frames 0-20 every 4th, first pass over head).
- Shadow proxy: bone names and order must match (section 1).
- Probe (`tools/qa/athlete-probe.mjs`): the disc check counts only the probed athlete's own turn (a parked bystander's landed
  disc read as a 1 m separation: putt 106.5 cm, turn 97.9 cm on `ebadcf7`; now 7.5 and 8.7 cm on every build); every bot
  throw reseeds the random stream after `setupTurn`, where its plan starts, so a build that constructs fewer three.js objects
  (each draws UUID randoms) still sees the same shot (the run-up scene now throws the same drive on all three trees: x-step
  L slide 10.3 cm on each); new scenes `tapin` and `lie`; a slide is the lesser of the contact point's and the sole centre's
  drift (a shoe rolling heel to toe moved its contact point 6-8 cm in place); `thrower` and `ay` per row.
- Cost of the fix pass: draw calls and triangles identical to the first pass at every moment (menu, flyover, tee, putt,
  scorecard; phone landscape, portrait, Desktop; the four bot-turn frames). CPU: the IK runs only for an athlete stepping out
  of a throw, for .6 s: 0.117 ms per update instead of 0.034 ms on this Mac (median of three runs of 1,080 updates each;
  idle updates 0.03 ms on both); no cost otherwise.
- The Math.random shift itself stays: the game draws fewer UUIDs because it no longer rebuilds two bodies per turn. Seeded
  captures of bot throws in `tools/capture-motion.mjs` still reseed before `setupTurn`, so a bot there may pick a different
  shot than in captures of older builds; left alone because other agents capture with it this round.

## Found, not fixed

- Female rig: shoulder joints at x .131/.150 (male .17), inside her upper-arm axis (~.15); the torso follows the arm through
  every throw (twisted sash, smeared shoulder at release). Needs the shoulder joints moved out and the torso re-skinned in
  Blender (`tools/build-golfer-v3.py`); a runtime weight cap made local stretch worse (above).
- Run-up strides are infeasible: e.g. FXSTEP .32 keeps the rear sole at z 1.64 while the pelvis is at 1.02 (~1.05 m reach vs a
  ~.9 m leg), so the IK lifts that foot and the grounding plants the still-moving swing foot early (skate). Re-author the
  XSTEP/FXSTEP beats (feasible plants, higher swing foot) and re-bake.
- Run-up -> drive hand-over: the x-step's last tenth moves the arm fast into the coil and the drive's windup tween starts from
  rest (hermite start speed 0).
- Her bake still has a pale wedge at the nape and dark folds on the back (stray scan surfaces).
- Flyover +25k triangles on Mobile (the full-body athletes in that frame) and +3-5 % on bot turns; a distance LOD for the main
  pass would recover it (frame time measured flat, above).
- Female jersey (verifier): a ragged sash edge across the upper back, a dark patch near the nape and pale scratches on the
  front of the sash remain; needs the bake/mask clean-up or the Blender re-skin above.
- A reaction that lands on the frame right after a putt's finish hands over to the idle restarts the arms' cross-fade (one
  5.8 cm wrist step, then 0.6): timing-dependent, seen once in an unseeded run; `sample()` drops the oldest of two
  cross-fading clips when a third starts.
- The run-up's foot skate (x-step L 10.3 cm, crow hop R 41 cm, R 23.8 cm into the drive) and its arm hitch are unchanged
  (authoring, above).
