# Gauntlet r4 — athletes (bodies and motion, phone and desktop)

Branch `r4-athletes` from `7e1e53a`. Captures: `tools/capture.mjs` / `tools/capture-motion.mjs` (Mobile = 844x390 or 390x844 at
dpr 3, `--quality low --mobile`; Desktop = 1440x900 dpr 1 `--quality high`). Motion numbers come from the new
`tools/qa/athlete-probe.mjs` (60 Hz virtual clock, world positions of pelvis, head, wrists, sole contact points and disc;
the flyover plays out naturally). "Before" probe = the same tool run on the `7e1e53a` sources.

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
  (2,305,674, over its 2.3M budget). The flyover stays +25k on Mobile (+3%), +14k on Desktop: the athletes on the tee are in
  that frame. The desktop menu frame is pixel-identical with the proxy (0.001 % of pixels differ), and so are the phone tee
  frames. frameMs is not compared: several agents shared the GPU and it swung 2x between identical builds.

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

## 4. Motion glitches (probe) — ranked by how visible at phone size

| # | glitch | where | before | after |
|---|---|---|---|---|
| 1 | both feet skate 30-40 cm across the tee into the aim stance at every turn start | tee, after the flyover cut and after every other turn | R 36.9 / L 29.2 cm loaded slide over ~0.25 s, P95 second difference 13.2 mm | in the stance 2 frames after the cut, then R 1.8 / L 1.7 cm, P95 0.17 mm |
| 2 | putt finish -> idle: both soles glide ~15 cm in .22 s in the locked putt frame | putt | R 15.1 cm while loaded | each foot steps (lifted ~13 cm); R 5.8 cm (the stroke's own pivot), L 3.7 cm at touchdown; a 3.4 cm pelvis rise as he stands out of the crouch |
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
- Flyover +25k triangles on Mobile (the full-body athletes in that frame); a distance LOD would recover it.
