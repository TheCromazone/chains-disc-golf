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
| putt-hint-landscape.jpg | 844x390, Pine 1: first-throw hint at 6 m, wrong-way swipe at 1.5 m (section 5) | same lies |
| pnp-call-portrait.jpg | pass & play call, Pine 1 at 1.5 m and 10 m (pairs: before, after) | same lies |
| pnp-call-landscape.jpg | pass & play call at 844x340: tee, 3 m putt, a lie that stands him left | same lies |

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
  - On its side, the % and the grade hang left from the ring's right edge, and the grade drops into the ring's place. The
    hint first hung there too, over the basket on putts; it now stands at the foot of the frame (section 5).
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
- **Turn call on the athlete.** On its side, pass & play's "Player 2's throw" broke into two 60 px lines across him. It
  became one 40 px line over the fairway, and then a lower third (section 5).
- **Reaction shot behind a flag.** The holed-out reaction framed the celebration behind a CHAINS OPEN flag. It now weighs
  trunks and uprights in front of the lens and tries more swings. The code runs clean in the playtests; the exact random lie
  was not reproduced.
- **Narrow plates collided.** At 360 px the score plate and wind plate overlapped by 120 px². #top now leaves 152 px.

## 5. Verifier follow-up
The verifier kept all six changes and flagged one regression and three follow-ups. Each was measured with a staged-lie probe:
holes 1-3 of all four courses, with real CDP touches for each beat. It compares every label's rect with the basket's
projected catch zone (tray to band), the whole basket and the athlete's box. The before runs used a copy of d6b8776.

- **The landscape hint covered the basket (regression).** Hung leftward from the ring's right edge, the first-throw "Swipe
  up ↑ to throw" and the wrong-way line sat on the catch tray of every putt (the capture's putt moment on all four
  courses). The hint now stands at the foot of the frame, between the throw chip and the ring, and level with the chips.
  Long lines wrap in balanced rows, two lines on a 640-667 px phone and three at 568 px. It takes no touches, so a thumb on
  it left of the pad still aims.
  - 844x390, 48 putt lies (1.5, 3, 6 and 10 m) x 4 beats (aim, wrong way mid-swipe, wrong way after, swipe): hint over
    the catch zone in 48/48 lies in every beat (up to 101k px² a beat) before, 0/48 after. Over the athlete: 12/48 before,
    0/48 after. The whole basket: 1/48 lies after, 244 px² on the pole's foot at 1.5 m.
  - 844x340 and 667x375 (Pine and Lake, 12 lies): catch zone 12/12 before, 0/12 after.
- **"Wrong direction — Putt: swipe up ↑".** The line after a wrong-way swipe is now "Wrong way — swipe up ↑", the same as
  the line shown mid-swipe. The throw chip already names the throw. The long form also ran past an upright pad and was
  cut with an ellipsis ("Wrong direction — Backhand IO: swipe right → · inside-out").
- **The grade's sign.** At exactly -0.05 the grade printed "+0.1°". The grade and the elevation readout now take the sign
  from the printed digits, so −0.1 shows its minus and −0.0 never appears.
- **Upright pass & play call (optional).** The call's box started at 50%, so "Player 2's throw" broke into two 34 px lines at
  22% and sat on the basket of short putts. It is now one 32 px line under the plates (136 px). 84 lies, upright 390x844
  (tee, 40%, 1.5-13 m): over the catch zone in 36/84 lies (73k px²) before, 0/84 after. No overlap with the score or wind
  plate.
- **The landscape call, found in the 844x340 pass & play playtest.** The 40 px line at 41% sat on the basket on most lies:
  a drive's far pin, a tap-in's chains and a 3 m putter's head. On 4 of 23 aims the athlete stood left of centre, because
  the aim spot had moved the lens round him, and the line covered him. The call is now a lower third over the aim pill, left-aligned like the
  hole title. When the frame the lens is heading for stands him left of centre (main.js, `UI.heroSide`), it moves to the
  right. Measured over 96 lies (tee, 40%, two lies 4-5 m off the line, 1.5-10 m putts):
  - 844x340: over the basket in 81/96 lies before, 0/96 after; over the athlete 25/96 before, 0/96 after; over the
    score plate 96/96 before (box corner), 0 after.
  - 844x390: basket 70/96 to 0/96; athlete 14/96 to 0/96.
- **Pin tag inside the waiting line, found in the landscape solo playtest.** On its side, the bot's line ("Ricky ·
  Forehand, Midrange") stands beside the score plate since this branch, and a far pin's tag rose into its end (frame 077).
  The tag now fades under the waiting line too, as it does under the plates, and the line's rect is read once per text.
  A grid test placed the tag's foot every 8x3 px around the line, using ui.js's own placePin in the live page. Positions
  with the tag drawn on the line: 844x390, 294 before and 0 after; 390x844, 300 before and 0 after.

Playtests after these changes, with real touch swipes, each through hole 3's final scorecard with 0 page errors:
- Solo, Pine, 844x390: no hint overlaps. The tag-on-line case was seen only once, with the line at 16% mid-fade in flight.
- Pass & play, Lake, 844x340: the call never covered the athlete (35k px² over 23 aims in the run before this change).
- Pass & play, Bluff, 360x640: the call is one line under the plates and overlaps no plate.

verify-layout (port 8344) finds 0 HUD issues at all six sizes. The only findings are the locker ones that were already
there.

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

The follow-up changes only labels (CSS, and one projection per aim frame for `heroSide`). Every capture.mjs set the verifier
ran on d6b8776 has identical calls and triangles after them: upright and landscape on all four courses, 360x640, 844x340
and desktop 1440x900. The motion timelines (drive windup@44, release@72, land@160; putt chains@86) are also identical.

## Not fixed
- **Pine 1's tee sign fills the right fifth of a bot's run-up on its side.** The other side holds the group waiting by the
  pad. A frame-edge prop check could not flip it, and was dropped.
- **Close landscape putts (under about 5 m).** The swipe ring overlaps the athlete's hip. The "POWER"/% pill above the ring
  sits on the basket's pole on a 1.5 m putt during the swipe (12/48 lies, up to 2100 px²), as on 7e1e53a.
- **Flight calls and the pin tag.** "Tree!" at the top of a chase can sit just over the pin tag (one frame in a round).
- **Upright putt frame.** The throw and disc chips overlap his shoes, at the over-the-shoulder crop.
- **Pass & play setup on its side.** "Start round" sits below the fold and needs a scroll.
- **verify-layout's locker findings** at 812x375 and 568x320: the sticky Ready button sits over the tabs. Untouched here.
