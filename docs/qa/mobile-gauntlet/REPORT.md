# Mobile gauntlet against Disc Golf Masters

The ask (2026-10-17): the mobile game should look much better, and the bots' and NPCs' throws looked "off and unrealistic". The
reference is still [Disc Golf Masters](https://store.steampowered.com/app/2819400/Disc_Golf_Masters/) (its store stills, viewed,
not copied); this round judged the phone (iPhone 390×844 and 844×390, the Mobile tier) instead of the desktop.

| Area | Before | After | What changed |
|---|---:|---:|---|
| A bot's drive (realism) | 3 | 7 | Solved throw clips, an x-step run-up, a camera that shows it |
| Phone putt | 5 | 7 | 3D crowns near the eye, the full basket, close-range shadows |
| Phone tee | 6 | 7 | The same, plus the full-detail body for the player on the tee |
| Phone flyover / flight | 6.5 / 5.5 | 7.5 / 6.5 | Resolution that recovers, richer foliage, more grass |
| Phone menu | 6.5 | 7 | A thinner haze sheet |

## The throws

The hand-keyed drive reached back to the knees (the hand 0.2-0.3 m behind the body at 0.92-1.05 m), released at the waist (1.0 m)
and ended feet together; the putt slid both feet 25-60 cm through the stroke and the rear foot a metre. Every bot and remote
player threw from a standstill, and the windup eased to a stop just before the pull.

- **Solved, not keyed** (`tools/author-throws.mjs`, `tools/throw-fk.mjs`). A clip is a list of beats in body terms: where the
  pelvis is and which way it and the chest face, where each hand is relative to its shoulder with a hint for its elbow, where each
  sole is and which way the foot points. Every 1/40 of the clip is solved with inverse kinematics on the 11-joint ChainsRig (FK
  checked to the millimetre against the live rig): arms reach their hands, legs keep a planted foot on its spot and heading while
  the hips turn over it, with anatomical limits and a pull toward the previous frame so no limb hops branches. Output:
  `src/throw-keys.js` (backhand, forehand, putt and two run-ups), baked through the existing Blender step
  (`tools/extract-poses.mjs`, `tools/author-golfer-clips.py`). `?liveclips` draws throws straight from the keys for iteration.
- **The pelvis travels** (`rootX/rootZ` in the keys): weight back into the rear leg, a stride that plants the front foot, the hips
  braced over it through the hit, then on as the rear leg swings round. `keepTravel()` hands the travel to the player's position
  at the end of the throw, so nobody slides back to the lie. The flying disc leaves the hand where it was drawn and eases onto the
  physics path over 0.16 s (physics, release point and multiplayer are unchanged).
- **The drive** now peaks straight back at chest height as the front foot plants, the hips open ~26° while the chest stays back,
  the elbow leads the disc in at the sternum, the hand meets the disc's release point at 1.15 m, and the rear foot lets go at once
  and lands past the front foot as the arm wraps. **The forehand** loads on the rear foot, plants the front, whips from the elbow
  and steps through. **The putt** loads, pushes straight out at the chains and holds, feet planted.
  [Drive, side view](drive-clip.jpg) · [forehand and putt](forehand-putt-clips.jpg)
- **Timing**: the release half is explosive then decelerating (fastest through the hit, 0.1 s from 0.5 to the release), and a
  windup someone else plays arrives at the pull already at that speed.
- **Run-ups**: a bot or remote player more than 40 m out, with a clear path behind the lie, waits at the back of the pad and runs
  in: an x-step into the backhand (0.8 s, handing over at the full coil) or a crow hop into the forehand. Your own swipe throws
  stay standstill and as responsive as before.
- **The camera for a watched run-up**: a three-quarter view on the thrower's chest side (the throwing side when the waiting group
  or a prop is there), following him, held 0.4 s past the release and dollying round behind him so the chase cam takes over from
  the usual frame. From straight behind the reach-back pointed into the lens and the strides ran along the line of sight.
  [Before and after on the phone](bot-drive-phone.jpg) · [before](bot-drive-before.mp4) · [after](bot-drive-after.mp4)

### Outside critics (ChatGPT, Gemini)

Blind A/B sheets of the bot's drive, old against new, rows swapped between rounds
([1](critique-drive.jpg), [2](critique-drive-2.jpg), [3](critique-drive-3.jpg), [4](critique-drive-4.jpg)):

| Round | New in row | ChatGPT new / old | Gemini new / old |
|---|---|---:|---:|
| 1 (run-up, camera straight behind) | A | 3.5 / 6.5 | - |
| 2 (three-quarter camera) | A | 3.5 / 6.5 | 6.5 / 2.5 |
| 3 (reach-back at the plant, hip lead, camera hold) | B | 6.5 / 4.5 | 6.5 / 2.5 |
| 4 (brace, earlier rear foot, dolly) | A | 4.5 / 6.5 | 6.5 / 3 |

ChatGPT gave row B 6.5 in all four rounds whichever version sat there, so its verdicts measure position more than motion; Gemini
picked the new drive in all three rounds it answered, from either row. Their notes agreed. What both asked for, and what changed in response: the reach-back must peak at the plant instead of being
carried ("camping"); the hips lead the chest with an elbow-led power pocket; the pelvis stops over a braced front knee; the rear
foot lets go right after release; the run-up posture lower and more athletic; the camera holds through the follow-through.
Gemini's last round still wants a deeper shoulder coil (the back of the shirt to the target), the hips visibly firing before the
chest at the plant, and more forward lean over the plant leg in the finish: the next round's list.

## The phone's look

A measured audit of the Mobile tier first (both tiers, both orientations, Pine Hollow and Lakeshore), then fixes ranked by what it
found:

- **3D trees near the eye** on Mobile too (`src/course.js` treeNear 26 m; the pine and deciduous models now load on phones): every
  crown was a camera-facing card, even the one over the putt and a birch 8 m from a landing.
- **Close-range shadows** (the near cascade at 1024², 2.3 cm texels): the single 120 m map (11.7 cm) gave the athlete a blob and the
  basket and pole none.
- **The full basket** on Mobile (24 + 12 chains, footing, sleeve; ~7k triangles a basket).
- **Full-detail body for the player on the tee and the clubhouse**, fetched after the first frame (`models.js fullBodies`): the
  low-detail bake's 1024 albedo stair-stepped across the jersey. Bots elsewhere keep the light body.
- **Adaptive resolution** compared the average interval with 13.7 ms, which a vsync-capped 60 Hz screen never shows, so every
  hitch stepped resolution down for good (1.5× to 1.14× in one hole; Low Power Mode's 30 Hz slid to the floor). This branch fixed
  it by watching missed frames at the screen's cadence; master's gauntlet r2 fixed the same bug its own way (hitches over 100 ms
  ignored, phones hold 30 fps), and the merge keeps master's.
- **Foliage colour** (leaf albedo .55 → .66, the tone curve's saturation 1.04 → 1.09) and **grass** two blade tiles out to 19 m
  (was one to 5.8 m). The clubhouse haze change was superseded by master's blurred snapshot backdrop on Mobile.

Measured on the same seven moments (foliage saturation in the top half, sharpness as mean |Laplacian| of the bottom third):

| Pine Hollow, portrait | Foliage sat. before → after | Sharpness before → after |
|---|---|---|
| Flyover | .41 → .47 | 10.7 → 14.9 |
| Tee | .40 → .44 | 7.8 → 9.3 |
| Flight | .46 → .51 | 10.9 → 15.1 |
| Putt | .47 → .52 | 9.9 → 12.5 |

Lakeshore and landscape moved the same way (+.03 to +.10 saturation; the reference's stills sit at .40-.71). Frames:
[flyover](phone-2-flyover.jpg), [tee](phone-3-tee.jpg), [flight](phone-4-flight.jpg), [putt](phone-6-putt.jpg),
[landscape](phone-landscape.jpg).

**Cost** (GPU-synced render, headless Apple M6, median of three; indicative only), measured at 1.5× before the merge: the tee was
unchanged (Pine 2.6-2.8 ms, Lakeshore 1.9-2.2, against 2.4-2.6 before); the putt cost ~1.4 ms more on Pine Hollow (3.8 ms: the
near shadow pass ~1.0, the near 3D trees ~0.6) and about the same on Lakeshore. A 1.75× pixel ratio was tried and dropped here to
keep the earlier "no fps cost" ask; master's gauntlet r2 has since moved phones to an exact 2× on purpose, and the merge keeps that
(with master's 40 m near-tree radius on Mobile, which superseded this branch's 26 m). Real iOS Safari in the simulator ran the
clubhouse, tee and flights at 57-60 fps before the merge, but the simulator renders on the Mac's GPU.

## Tools used

- **Blender 5.2**: bakes every solved clip (and the two new run-up clips) into the shipped GLBs.
- **ChatGPT and Gemini** (the signed-in Chrome on the Mac mini): blind critiques of the bot's drive, four rounds.
- **iOS Simulator (Safari / WebKit)**: the round played on a real Safari engine, with the fps overlay.
- **Unreal 5.8 and Unity 6.6**: not used. The game rig has 11 joints and no hands or feet, so neither engine's retargeting or mocap
  helps (see `art/unreal/REPORT.md`, `art/unity/REPORT.md`); Unity's motion generation also needs the editor terms and paid credits.
  **SwiftUI**: not applicable; Chains is a web game.

## Still open

- On a landscape phone the swipe hint, wind plate and ring sit over the athlete's legs at the tee (ergonomic layout, left alone).
- From the chase camera the flight ribbon can read as a vertical stick.
- Leaf cards seen from inside the woods (a disc deep in the trees) read as large flat blades, now on Mobile too.
- Real-iPhone frame times are unmeasured; run `?fps=1` on a phone after the deploy.
- Run-ups are watched-only (bots, remote players); your own throw is still a standstill swipe.

## Checks

`npm test` (10 files, including the new `test/throws.test.mjs`: run-ups hand over exactly, planted feet hold, chest-height release,
continuous travel), `npm run build`, `node tools/verify-browser.mjs --dist` (18/18 after merging master, no browser or shader
errors; its mobile resolution check now allows master's 2×),
`node tools/verify-matches.mjs` (pass), `node tools/verify-rounds.mjs` (four courses, no browser errors), the cross-device swipe
smoke (`tools/qa/devices.mjs`, iPhone portrait and landscape, desktop).
