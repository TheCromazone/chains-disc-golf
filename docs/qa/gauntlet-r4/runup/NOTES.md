# Gauntlet r4, round 2 — run-ups and the swipe release (animation glitches round 1 measured but left)

Branch `r4-runup` from `593eb2a`. Numbers: `tools/qa/athlete-probe.mjs` (60 Hz virtual clock, seed 4, Mobile tier, phone
landscape 844x390; portrait 390x844 gives the same motion numbers to the tenth), run on an exact copy of `593eb2a` ("base") and on
the branch head with the same tool and seed. "Slide" is the probe's loaded-sole slide (a sole within 2 cm of the ground drifting
along it), "pop" a joint's one-frame move spiking 3.5x over the six frames around it. Scenes: `backhand` / `forehand` are the
hero's tee drive thrown as a bot (x-step / crow hop run-up, the frames `capture-motion --throw` records), `runup` the first bot's
own drive (a female athlete), `swipe-*` the player's own drive from the aim stance.
Key-level checks came from the solved keys (`tools/throw-fk.mjs`); real-touch swipes were driven through `input.js` under the
virtual clock (scratch tool, 60 Hz).

## 1. Run-up foot skate (bots' watched drives)

- Problem: on every watched bot drive the feet skated across the pad: x-step R 23.8 / L 9.6 / R 8.7 cm, crow hop R 41 / 9.3 / 8.3 cm,
  a 2.3 cm sole pop in the x-step; the trailing toe sank up to 4.2 cm into the turf (21 frames below -1.5 cm on the x-step, 26 on
  the crow hop) and the body popped up 2.7-4 cm in two frames when the other foot landed.
- Causes (two):
  1. Authoring (`tools/author-throws.mjs` XSTEP/FXSTEP): each sole was eased straight between its footfalls, so it skimmed in over
     its last few centimetres and dragged its toe out, and each foot stayed down until the body was ~.6 m past it (up on its toe at
     full stretch). The crow hop held the front foot down at .88 and wanted it 78 cm further on, 5 cm up, at 1.0: it slid across the
     ground in 96 ms.
  2. Grounding (`src/athlete-motion.js`): the body stood on the 12 lowest vertices of the flat bind sole, all under the arch and
     heel. A foot up on its toe pushed its toe, which none of them covers, under the ground, the body sank with it, and the
     swinging foot touched down early and skated in.
- Fix:
  1. The run-ups step (`step()` beats): a foot rises and lands within 1 cm of its spot over the 5 cm nearest the ground, swings ~15 cm
     up, leaves before the body is ~.4 m past it, and the other foot is always already down. Start (1.5 m behind the lie), the pelvis
     travel, the arm and chest beats and the coil are unchanged; footfalls moved: x-step right foot lands at .24 (was .30) on .78 m
     (was .95, turned 50 deg so the hip can swing it out of the cross; at 35 its swing missed by 7 cm on the hip's limits), left
     lands on the drive's rear-foot spot at .58 (was .62); crow hop .20 / .50 / .76, the right foot lands already turned to its
     drive heading (it used to pivot 25 deg while planted). The physics release point (lie + 1.15 m up, .4 m on) and the run-up
     time are untouched, so the flight is the same (capture-motion: windup, release, launch, land and skip frames identical; probe windup to launch 62-63
     frames on both, frame quantisation); `fairness.mjs pine --runs 120` base and branch: identical (0.48 over par per hole, tee-tree 22 %, fairway 46 %).
  2. Grounding also stands on ~6 support vertices per shoe (the lowest with the shoe tipped heel-down to 60 deg toe-down and rolled
     25 deg: heel and toe corners, the ball's sides). The centre the putt step IK aims stays the original 12.
- Measured (landscape; portrait identical):

  | scene | measure | base | grounding only (base clips) | branch |
  |---|---|---|---|---|
  | bot backhand (x-step) | run-up slides | R 23.8, R 8.7 cm | R 5.4 cm | R 0.9 cm |
  | | L into the drive (landing + the drive's own heel pivot) | 9.6 cm | 9.6 cm | 3.3 cm |
  | | pops | soleR 2.3 cm @ .562, wrist 6.5 cm @ .979 | wrist 6.5 | none |
  | bot forehand (crow hop) | run-up slides | R 41.0, 9.3, 8.3, L 7.8 cm | R 15.4, 4.6 cm | R 0.7, L 0.7 cm |
  | runup (female bot, x-step) | slides | L 10.3, R 3.6, L 3.6 cm | L 5.6 cm | L 4.3, R 3.2 cm |
  | all drives | lowest sole under the ground | -4.2 cm (x-step), -3.2 (crow hop) | | never below +0.7 cm |

  The female's remaining 3-4 cm: the clips are solved on the male rig, and her legs are shaped differently (below).
- Evidence: `01-runup-feet.jpg` (bot backhand, phone landscape, frames 46-60: top base, bottom branch; the stepping foot now
  clears the pad and comes down where it lands), `02-crow-hop.jpg` (forehand, frames 60-74: the front foot used to slide forward on
  the pad into the plant; now it lifts and swings through), `05-runup-portrait.jpg` (bot backhand, phone portrait, frames 46-74
  every 4th).
- Test: `test/throws.test.mjs` 5: a run-up foot within 2 cm of the ground holds its spot (< 2 cm), and the hand reaches the coil at
  < 3 cm per frame (base keys fail both: the x-step's right foot drags 2.4 cm at lift-off, the hand 5.8 cm in its last frame).

## 2. The arm hitch at the run-up -> drive hand-over, and the stop at the coil

- Problem: the wrist moved 6.5 cm in one frame at x-step .979 against 1.7 around it; then the whole body stopped at the coil in
  mid-stride (pelvis 1.4 -> 0.1 cm a frame, the swinging foot 9 -> 0.4) and surged to 3 into the plant.
- Causes: (a) the x-step's arm was solved forwards from the standing start and reached the coil on another IK branch than the
  drive's .35 key it hands over to (upper arm ~1 rad off in every Euler angle, the same hand by another twist); the last 1/40
  interpolated between the two branches. (b) Every channel eased to rest on the run-up's last key and windUp pulled the drive from
  rest (hermite start speed 0).
- Fix: (a) run-up arms are solved backwards from the drive's own key (`clip(..., end)`; legs still forwards). (b) the run-ups carry
  one beat past their end, the drive's .375 state at the time the pull reaches it (only the last tangent reads it; poseAt never
  samples past 1), and `windUp` starts the pull at that speed (`RUNUP.v0` .45 drive phase/s), still arriving at .5 at the hit's
  speed at the same moment.
- Measured (bot backhand, landscape): wrist pop 6.5 cm -> none; wrist per frame into the coil 1.9, 6.5, 4.3 | 0.2 -> 2.0, 1.9, 1.6 |
  0.1 (the arm's own stop at the reach-back peak stays); pelvis per frame across the hand-over 0.8, 0.5, 0.2, 0.1, 1.0, 2.2, 3.0 ->
  0.9, 0.9, 1.0, 0.6, 1.9, 2.4, 2.3. Windup to launch stays 62-63 frames (frame quantisation, the same jitter on base).
  `04-handover.jpg` plots both (the branch's drive runs one frame earlier in that recording: its windup started a fraction of a frame
  earlier).

## 3. Sole pops (and a 39 cm arm jump) at the swipe release

- Problem: on the player's own drive, the frame the finger lifts: soles 2.1 / 1.6 cm (backhand), 3.1 cm (forehand) against
  ~0.2 around, and the wrist 39 cm in one frame against 12-14 after (the probe's pop rule missed the wrist: its neighbours are fast).
- Cause: doThrow covered what was left of the windup (.425 -> .5 at 85 % power) in (.5 - phase) x .36 s = 27 ms at 2.8 phase/s, from
  a fixed start speed whatever the finger was doing, then the release curve from .5: the first frame jumped .425 -> .478.
- Fix (`src/main.js`): one curve from the swipe's own speed (tracked under the finger, ~50 ms smoothing, decayed if the finger
  stopped before lifting) to the release curve's speed at the hit, reaching .62 at the same moment as before (lead-in + HIT_T):
  the launch frame and the flight are unchanged. Bots and replays hand over at .5 and are untouched.
- Measured: probe swipe-backhand pops soleR 2.1 / soleL 1.6 -> none, wrist 39.0 cm then 13.3 -> 5.8, 14.5, 16.9, 14.0, 20.3, 23.3,
  27.9 (into the hit), launch on frame 59 both; swipe-forehand soleR 3.1 -> none, launch frame unchanged. A real touch swipe
  (accelerating, let go at ~2 phase/s): phase per frame after the lift .053, .045, .021 -> .027, .028, .029; putt .051, .054, .044
  -> .024, .028, .031; fired on the same frame. `03-swipe-release.jpg` (frames 28-38 at 30 fps, top base: by 30 the disc is
  already halfway through the pull).

## 4. Frame-by-frame pass (bot backhand / forehand run-up drives, swipe drive and putt; landscape and portrait)

The most visible remaining glitch was the stop at the coil (section 2b), fixed. Checked and fine: the disc leaves the hand on the
launch frame without a jump (disc-to-hand 7.5-8.7 cm held to the frame before launch; the first flight frame continues from the
hand at flight speed), no hand inside the torso or thighs in any scene, no pops in any scene on the branch.

## Cost

- Draw calls and triangles (`tools/capture.mjs`, Mobile, dpr 3), identical on base and branch at every moment (nothing drawn changed):

  | moment | phone landscape | phone portrait |
  |---|---|---|
  | menu | 80 / 944,870 | 73 / 870,728 |
  | flyover | 125 / 874,440 | 113 / 873,992 |
  | tee | 125 / 931,780 | 112 / 907,237 |
  | putt | 110 / 974,075 | 111 / 964,371 |

  frameMs swung 15-66 ms between runs of the same build on the shared GPU, so it is not compared.
- CPU (the ~6 extra support vertices per shoe the grounding skins on the CPU each update): per athlete update on this Mac, median of
  3 x 1080 updates, base and branch pages in one Chrome, interleaved: idle 0.031 -> 0.036 ms, run-up 0.037 -> 0.045 ms, drive
  0.036 -> 0.042 ms (a later run with other agents busy: 0.056-0.062 -> 0.063-0.068, 0.063-0.069 -> 0.073-0.078,
  0.058-0.069 -> 0.074-0.078). A few microseconds per athlete per frame.

## Found, not fixed

- The female athletes run the male-solved clips: her shorter, differently shaped legs leave 3-4 cm of creep on the run-up's planted
  feet (runup scene L 4.3 / R 3.2 cm). A per-rig solve (author-throws on `tools/golfer-f-rig.json`) and a female bake would remove it.
- The swinging foot still pauses near the top of its little lift at the drive's .35 (the drive's own beats put its height apex
  there): 0.6 cm a frame for one frame, then on.
- The swipe's trace and power ring draw across the athlete during a landscape swipe (HUD, not this area).
- The disc leaves the hand at ~2x the hand's speed (hand ~10-13 m/s through the hit, flight ~22 m/s): the throw clip's hit is slower
  than the flight it launches; speeding it up would change the accepted timing.
- `tools/author-throws.mjs` keeps every beat as a key: the x-step has keys .025 / .035 and .24 / .25 10 ms apart (no pop measured).
