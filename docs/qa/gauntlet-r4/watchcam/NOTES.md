# Gauntlet r4, round 2: watching someone else throw (and the approach framing)

Branch `r4-watchcam` from `593eb2a`. Everything here is measured, on the same seeds before and after:
- `tools/qa/watch-probe.mjs` (new): on the virtual clock, a bot throws while the human waits. That is the path a phone guest's
  replay also takes: windUp, run-up, doThrow with a given flight. `own` is the human's swipe from the same lie, the view the
  watcher should match. Each 30 fps frame renders three extra passes offscreen: the scene without the disc (depth), then the
  disc alone, depth-tested and untested. A disc behind a trunk, a crown or the athlete therefore counts as hidden. Per frame it
  records the visible disc pixels, the lens's height over the disc's plane, its clearance over the turf and to the nearest trunk,
  crown or capsule, whether it sits inside a crown's leaves, and the partners near it. `--mode framing` renders the aiming athlete
  alone against a basket proxy and a post at the landing spot the aim line shows.
- `tools/qa/live-room.mjs`: a desktop host and an iPhone guest in muted headless Chromes, real swipes. It now logs the watcher's
  disc-in-frame share and its distance from the lens, and shoots a flight strip at 0.3, 0.9, 1.5 and 2.1 s.
- `tools/capture-motion.mjs --clips drive --throw bot`: the hero's tee drive thrown as a bot, so the clip is the watched run-up.
- `tools/qa/solo-playtest.mjs` (new): a real-touch solo round on an emulated iPhone.

| image | what |
|---|---|
| 0-host-watching-guest-before-after.jpg | live room, desktop host watching the iPhone guest's 85 m drive on Pine 1, at 0.3/0.9/1.5/2.1 s of flight. Top row is 593eb2a: at 1.5 s, the lead's frame (lens on the turf at the LOFT post, no disc). Bottom row is the branch. |
| 1-watched-drive-portrait-before-after.jpg | capture-motion drive (watched run-up), 390x844 @3x, frames 90/100/110/120/135/150 |
| 1-watched-drive-landscape-before-after.jpg | the same at 844x390, frames 100/110/120/135 |
| 2-bot-drive-pine1-before-after.jpg | watch-probe, Ricky's forehand on Pine 1: skims the arch's leg 0.4 m off its cover, then goes into a crown and is dropped by the branches (frames 72-148) |

## 1. The watcher's camera parked on the arch post, the disc out of sight

**Problem.** In a live room, a desktop host watching an iPhone guest's drive saw the lens skim the turf at the arch's
LOFT/BIRDIE BREW post for most of the flight, with no disc in sight. This was the lead's host-sheet.jpg. It reproduces with any
watched run-up: a bot's drive in solo, the guest's drive on the host's screen, and the host's drive on the guest's phone.

**Cause.** There was no stale position, and the chase was behind the right player. Three things in `flightCam` combined:
1. **The late hand-off.** A watched run-up keeps the tee camera through the follow-through (`camAt` = 0.55 s of flight). By then
   the disc is about 20 m down the fairway. `flightPlan` then started the chase's critically damped tracker at rest from the tee
   camera. It took about 1.5 s to catch the disc. All that time the disc was a 1-3 px speck, and the lens ran low down the
   fairway from tee height.
2. **The pull-in toward the post.** The chase spot is pulled toward the disc when the segment out to it is blocked. That test
   used a 1.2 m berth against every camera blocker, the arch's legs and beam included. A drive that skims the leg (Ricky's
   forehand passes 0.4 m off its cover) put that segment inside the berth. The pull-in then dragged the lens to 0.6-1.1 m behind
   the disc, against the post. Only the target segment was ever tested, never the camera's own path.
3. **The overshoot into the leaves.** The disc slows hard in a crown (physics drags it). The tracker, fed the slowing spot,
   overshot into that crown. `clearFraction` skips the crown the disc is inside, so nothing held the lens out. The lens then sat
   in the leaf cards, with the disc hidden, for a second.

**Fix** (`src/main.js` flightCam, `src/cam-collide.js`):
- **The cut.** At the end of the follow-through, a watched run-up cuts to the chase already running. That is where the thrower's
  own camera is by then: 4.5 m behind the disc, at its speed, with the blends done. The tracker starts at the spot with the
  disc's velocity, and the pull and nudge start settled. The run-up rule is untouched: the 30-degree three-quarter view from
  behind through the run-up, then the dolly round behind him through the follow-through.
- **Pull-in against trees only.** The chase's pull-in tests trunks and crowns only. The arch's beam keeps its own duck rule
  (beamCeiling). Its legs, the tents and the flags keep the sideways nudge, which can now step up to 4.5 m (it was 3.2 m) and
  starts sooner for wide blockers.
- **pushOut.** A new `pushOut()` moves the lens itself radially out of any trunk's berth (0.8 m), crown (1.05 x its radius) or
  capsule, every frame of the chase and the landing blend. It also steps round a partner within 0.8 m below head height (PR #32's
  rule, which the chase never had).

**Measured.**
- **Live room**, host 1440x900 watching the guest's 85 m drive (Pine 1):
  - Distance from the lens to the disc, median: 7.8 m before, 54/159 samples over 12 m. After: 4.4 m, 15/95 over 12 m; the
    thrower's own view is 4.5 m.
  - The guest watching the host's drive: 7.9 m to 4.2 m.
  - Full run, 2 holes: 13/13 checks, 19 throws, 0 disagreements, no page errors on either screen.
- **Motion clip** (watched run-up, the same throw in both: windup@44, release@72, launch@75, land@153):
  - Median camera-to-disc distance over the flight: 8.3 m to 4.5 m (landscape), 8.1 m to 4.5 m (portrait).
  - Frames with the disc more than 12 m out: 28 to 12. The 12 left are the follow-through hold.
  - The only camera jump is the deliberate cut at frame 97 (17 m).

## 2. The watched flight: low over the turf, the disc hard to find, the lens in the trees

**Problem.** Round 1's online notes said that after a watched run-up the chase sits low over the turf and the disc is hard to
find. The probe showed more, in watched and own flights alike:
- the lens inside a crown's leaf cards, or within a trunk's bark;
- the lens 1.1 m behind a disc that passed a trunk, with the disc then under the frame's bottom edge;
- a disc dropped by the branches, with the lens holding on a wall of leaves.

**Causes and fixes:**
- **Low and far.** This was the late hand-off (section 1). The cut puts the watched chase at the thrower's height and distance.
- **Too close.** A disc flying a metre past a trunk pulled the lens to 1.1 m behind it (q floor 0.25, berth 1.2 m). The berth is
  now 0.8 m and the floor 0.38, so the lens stays about 1.8 m back; pushOut keeps it off the bark. When pulled in, the lens also
  looks nearer: 3 m ahead from 1.2 m back put the disc below the frame.
- **Into the leaves.** When the disc enters a crown, the chase spot holds where it was. The camera coasts about 2 m to a stop
  outside, still looking at the disc. It sets off again only once the way to the live spot is clear.
- **Dropped by the branches.** If the flight ends within 12 m of where the disc went into the leaves, the camera cuts to the
  landing shot a beat later (0.35 s of flight). The disc is then seen falling into that frame. Blending there instead threaded
  the lens through the trunks between.

**Measured** with watch-probe, Mobile tier: Pine, Meadow, Lake and Bluff, holes 1-3, tee and 40% lies. Each cell is 24 watched
throws (a bot's) and 24 of the player's own, over the frames the disc is in the air.

Watched (a bot's throw):

| | landscape before | landscape after | portrait before | portrait after |
|---|---|---|---|---|
| disc visible (>= 6 px area) | 80% | 94% | 87% | 94% |
| disc a speck (< 3 px across) | 27% | 11% | 20% | 8% |
| disc size, px across (median) | 7.6 | 11.1 | 11.3 | 17.3 |
| lens inside a collider (frames) | 13 | 0 | 15 | 0 |
| lens in a crown's leaves (frames) | 17 | 0 | 20 | 0 |
| lens within 0.6 m of a collider (frames) | 66 | 5 | 57 | 7 |

The player's own throw:

| | landscape before | landscape after | portrait before | portrait after |
|---|---|---|---|---|
| disc visible (>= 6 px area) | 92% | 99% | 93% | 98% |
| disc a speck (< 3 px across) | 8% | 1% | 7% | 2% |
| disc size, px across (median) | 10.6 | 10.7 | 16.5 | 16.6 |
| lens inside a collider (frames) | 36 | 0 | 36 | 0 |
| lens in a crown's leaves (frames) | 41 | 0 | 41 | 0 |
| lens within 0.6 m of a collider (frames) | 80 | 1 | 79 | 2 |

- The watched disc now reads the same size as the thrower's own. The specks left (8-11%) are the follow-through hold.
- Chase frames with the lens under 1.5 m from the disc: 182 to 6 (landscape) and 190 to 11 (portrait), of about 6,700 each.
- Frames under 1.6 m over the turf: watched 127 to 40 (landscape); 29 to 48 (portrait). These ride the chase's existing 1.5 m
  floor on low drives. The lowest frame is 1.22 m before and after in landscape, and 1.41 m before, 1.36 m after in portrait.
- Partners waiting on the line (`--lies 40w`: the bot throws from 40% with the others at 75%): frames with the lens within 0.8 m
  of an athlete at head height go from 3 to 1. Watched disc visible goes from 84% to 95%.

## 3. Portrait approach framing (the basket behind the arm)

**Problem** (ios-6-approach.png, before round 1): during a 24 m approach the reach-back arm crossed the basket.

**Re-check.** watch-probe `--mode framing`, on 4 courses x holes 1-3. The lies are tee, 40%, 70%, 24 m short, the rough beside
70%, and a 12 m putt, each thrown backhand and forehand: 132 scenes per orientation. The probe takes the aim frame, then 10
steps of the reach-back (phase 0 to .5), then the release.
- **Basket.** Hidden by the athlete in 0 of 132 scenes upright and 0 of 132 on its side, at any beat (the maximum is 0 px).
- **Landing spot**, before the release: 17% at most upright and 25% on its side.
- **Release.** Only there does the arm sweep across the spot, for a frame or two after the disc has gone (bluff 2, 24 m forehand,
  75% at phase .65).

Round 1's upright rig already fixed this, so the aim framing is unchanged here.

## Playtests (final code, real touch, muted headless Chrome)

| run | throws | the disc in frame, median distance from the lens | page errors |
|---|---|---|---|
| Solo, 844x390, Pine, 3 holes | 17 | bots' flights 99%, 4.5 m; own 99%, 4.5 m | 0 |
| Solo, 390x844, Pine, 3 holes | 17 | bots' flights 91%, 4.6 m; own 99%, 4.5 m | 0 |

The live room is in section 1.

## Mobile cost
- **Stills.** capture.mjs at 844x390 @3x, Mobile: draw calls and triangles are identical at all five moments (menu 80/944,870,
  flyover 125/874,440, tee 125/931,780, putt 110/974,075, scorecard 111/981,810). The aim, intro, menu and result cameras did
  not change.
- **The chase itself** (watch-probe `--cost`, all 12 watched tee drives, every chase frame, one full frame with shadow maps):
  - Draw calls: median 104 to 103, p90 122 to 123, max 140 to 146.
  - Triangles: median 825k to 817k, p90 1.04M to 1.06M, max 1.30M both.
- **CPU.** One `treesNear` for the leaves test and pushOut's two passes over about 30 trees and the capsules per chase frame.
  frameMs was not compared: four other agents shared the GPU and the render path did not change.

## Found, not fixed
- **Portrait forehand reach-back.** It touches the right edge for 2-3 frames when a bot's forehand is watched from a lie with no
  run-up (10 frames over 24 throws, before and after). It is aim framing, not this branch's change.
- **Disc skimming the arch's leg.** The leg still fills a third of a landscape frame for about 0.3 s. Now the disc is in front of
  it and the lens is 3 m off its cover.
- **Dropped by the branches.** The landing shot can wait about 1 s on an empty frame before the disc drops in from the crown
  ("Kicked by a branch" explains it).
- **Edge-on disc.** The chase's 20-23 degrees over the disc shows it as a thin ellipse. A higher chase (`CHASE.up` 1.5 to 2.1)
  would show its face, and the trail would stop fading end-on. It changes every player's own chase, which earlier rounds tuned
  with critics, so it was left for a scored A/B.
- **Spruce branches.** They hang below the crown's collision sphere. pushOut's 0.8 m trunk berth keeps most of them off the lens,
  but the sphere model cannot see the cone.
