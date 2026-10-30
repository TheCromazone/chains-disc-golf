# Gauntlet r4: what the phone player sees (framing and HUD)

Branch `r4-framing`, from 7e1e53a. Every capture uses the round's commands: `tools/capture.mjs` and `tools/capture-motion.mjs`
(`--quality low --mobile`, phone 390x844 and 844x390 at dpr 3). The playtests are real touch rounds through `tools/qa/cdp.mjs`:
solo on Pine, Meadow and Lake, pass & play upright and on its side, 844x340 and 360x640 with the thumb coach. Each frame
records every HUD label's rect and the current athlete's projected box (his bones).

| image | before | after |
|---|---|---|
| aim-portrait.jpg | iPhone 17 (lead) and capture `tee` | capture `tee` |
| aim-landscape.jpg | capture `tee`, 844x390 | same |
| bot-turn-landscape.jpg | motion `drive`, frames 60 and 95 | same frames |
| bot-turn-portrait.jpg | lead's motion `drive` 60 and `putt` 40 | same frames |
| release-portrait.jpg | playtest 120 ms after a swipe | same beat |
| putt-spot.jpg | Pine 8 at 14 m, Lake 4 at 14 m | same lies |
| small-phone.jpg | 360x640 aim with the coach, and the release | same |

## 1. Upright aim: the athlete covered the fairway
- **Problem:** the athlete stood mid-frame and blocked the line to the basket (ios-3-aim).
- **Cause:** AIM.tall.drive put the lens 2.9 m back at chest height (1.5 m), tipped 5 degrees.
- **Fix:** the lens now sits 4 m back and 2.35 m up, over his cap, tipped 10 degrees. The aim chip moves to 53%. On a short
  phone the lens slides up (cam.tShift) until his feet clear the swipe hint.
- **Measured** (holes 1-3 of all four courses, tee and mid-fairway lies, 24 frames):
  - Before, the athlete spanned x .47-.85 and y .45-.87, with the pin at x .42-.44, y .37-.51.
  - After, he spans x .55-.82 and y .54-.84, with the pin at x .41-.43, y .30-.42.
  - On a 360x640 phone his feet moved from .85 to .80, while the hint starts at .79.
  - The rig moved off its spot on 8% of verify-aimcam's lies on Pine, under the 10% bar (19 to 24 of 306). Meadow went 14 to
    15, Lake 15 to 16, Bluff 14 to 11.

## 2. Throw labels on the athlete; bots' turns
- **Problem:** the ring, its %, and the "RICKY · FOREHAND, DISTANCE DRIVER" line sat on the athlete's legs for the whole throw.
- **Causes:**
  - #waiting stood at the bottom centre all turn and never hid once the disc was away.
  - The ring showed during others' turns.
  - `body.thrown[data-phase=windup]` showed the human's swipe hint during a bot's wind-up.
  - On its side, the hint was centred over the pad, on his hips.
- **Fixes:**
  - While spectating, the ring and % stand down and the throw and disc chips fade out.
  - #waiting moves under the score plate (beside it on a wide screen) and fades in release and flight.
  - The ring hides as the finger lifts.
  - On its side, every label hangs left from the ring's right edge, and the grade drops into the ring's place.
  - The landscape lens moved from 0.95 m aside to 1.2 m, turned 3 degrees: he stands at x .62-.74 with his feet in frame
    (.98, was 1.01), and the pin moves to .47.
- **Measured:** label area over the athlete's box, in px²:
  - Upright, before: aim 4464 (hint and wind), release 5790 (grade, hint, wind), bot wind-up 5326, bot release 10575.
  - On its side, before: aim 3630, swipe 2130, release 650-728.
  - After, on drives in every playtest: 0 (82 px² of hint at the 360x640 aim).

## 3. The grade overlapped the hint (upright)
- **Cause:** the grade sat at 126 px and the hint at 102-132 px, mid-fade.
- **Fix:** the grade takes the hint's slot at 102 px, and the hint hides with no transition in release and flight.
- **Measured:** grade x hint went from 1274 px² to 0.

## 4. Playtest finds
- **Tap to skip did nothing.** skipBeat referenced INTRO_FLASH, removed with the white flash, and threw 5 ReferenceErrors per
  round. Now 0.
- **Putts that framed nobody.** Wide AIM_SPOTS for 8-14 m putts looked at the pin with the athlete past the frame edge (one
  framed a trunk). A putt spot that loses him now scores -2. Athlete off screen: 4 of 1713 sampled putt lies before, 0 of 1713
  after. verify-aimcam's QA lie still moves (spot 1).
- **Wind plate on the athlete (upright).** It stood at the bottom right, on his feet and on a putter's legs. It moves under
  the sound and tools buttons and hides in flight.
- **Verdict on the score plate.** On its side, verdictAbove lifted it there. The lift is capped under the plate, and the
  clap stands on the verdict's real height.
- **Verdict on the athlete.** Upright, the clap goes under the verdict in the reaction shot (it sat on his feet at 360x640).
  A held frame with the thrower in it puts the verdict on his far side, both upright and on its side.
- **Pin tag under the score plate during a chase.** It now fades under the top plates.
- **Tags hidden by a call or the coach.** Pin and landing tags hide under pass & play's turn call and the coach card. The
  coach now reads the wind plate as a top plate.
- **Turn call on the athlete.** On its side, pass & play's "Player 2's throw" broke into two 60 px lines across him. It is
  now one 40 px line over the fairway.
- **Reaction shot behind a flag.** The holed-out reaction framed the celebration behind a CHAINS OPEN flag. It now weighs
  trunks and uprights in front of the lens and tries more swings. The code runs clean in the playtests; the exact random lie
  was not reproduced.
- **Narrow plates collided.** At 360 px the score plate and wind plate overlapped by 120 px². #top now leaves 152 px.

## Mobile cost
Draw calls and triangles per moment, with each capture run once on this branch:
- Upright tee: 113 calls (unchanged); 913,415 to 915,335 triangles (+0.2%).
- On its side, tee: 125 to 126 calls; 925,066 to 930,682 triangles (+0.6%).
  - At 1.35 m aside the Pine 1 tee cost +7 calls, because the cart and tent came into view, so the lens settled at 1.2 m.
  - In-page counts, Pine 1/2/3 tees: 122/119/96 before, 123/119/96 after.
- Putt, flyover, menu and scorecard: identical.

Frame time, back to back in one page and alternating the old and new rig (median of 3):
- Upright: 15.53 to 15.39 ms.
- On its side: 16.97 to 17.11 ms.

## Not fixed
- **Pine 1's tee sign fills the right fifth of a bot's run-up on its side.** The other side holds the group waiting by the
  pad. A frame-edge prop check could not flip it, and was dropped.
- **Close landscape putts (under about 5 m).** The swipe ring overlaps the athlete's hip.
- **Upright putt frame.** The throw and disc chips overlap his shoes, at the over-the-shoulder crop.
- **Pass & play setup on its side.** "Start round" sits below the fold and needs a scroll.
- **verify-layout's locker findings** at 812x375 and 568x320: the sticky Ready button sits over the tabs. Untouched here.
