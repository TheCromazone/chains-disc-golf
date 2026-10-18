# Mobile polish: woods views, cameras, the mix on a phone speaker, reactions

The ask (2026-10-17): keep QA-ing the phone view until the animations, sound and graphics are as good as they can be. Bot-played
holes were recorded on an emulated iPhone (390×844 and 844×390, Mobile tier) on all four courses, and every phase change was
reviewed. This round fixed what that turned up. Throws, run-ups and the Mobile tier's render settings belong to PR #31 and
were left alone.

## Woods: bare limb rods and walls of bark

From a lie among trees (bots end up there often), the aim view showed long bare dark rods across the frame, one running through
the athlete's head. They were the 3D trees' wood: the spruce's lowest whorl (1.8 m up, reaching 2.2 m out) and the Scots pines'
dead branches (1.6-2.7 m up, to 1.65 m). Their needle and frond cards are flat and vanish edge-on at eye height. One lie in 16 put
the aim camera 0.6 m behind a trunk, and the whole screen was bark.

- Tree wood more than .75 m off the stem and under 4.2 m up is dropped. Limbs within ~4.5 m of the lens and stubs within ~3 m
  dissolve, because the chase camera crosses crowns. Anything within ~1.3 m of the lens dithers out. Bushes keep every branch.
- `aimSpotFor` counts a trunk's own width when it scores a trunk in front of the lens (the bark wall: the trunk's centre was
  33° off the line, outside the ~15° half-width, but its edge was inside).
- Two wide spots beside a trunk standing right behind the lie. A drive's lens turns just enough to keep the athlete whole in the
  narrow portrait frame (a wide-shoulder spot had cut him in half).

[Aim views from the woods, before and after](woods-aim.jpg)

## Cameras

- **Turn handover:** after the black dip the camera glided up out of the grass for half a second. It now cuts under the black.
- **Holed-out reaction:** from inside 6.5 m the reaction lens stood beyond the basket and filmed the athlete through the chains.
  It now swings 40° to the clearer side.
- **Tap-ins (inside 1.8 m):** his back hid the whole basket, so the chains' slow-motion catch played to his jersey. The lens now
  rises over his shoulder and looks down into the basket.
- **Landing shot:** spots where the disc and the pin fit one portrait frame score higher. When the disc is boxed in by trees,
  the overhead fallback picks the side clear of anyone standing there (it had framed the top of a waiting player's cap).

[Reaction and tap-in, before and after](reaction-tapin.jpg)

## Second pass: what a second sweep and a blind critique turned up

- **Contact shade:** every athlete on the course has a soft shadow under the pelvis, square to the slope and on the tee mat's top
  face. In a crown's shadow he had none and stood on the turf like a cut-out.
- **Aim line on a phone:** its width was set in buffer pixels, so a phone's 2× buffer drew a 1.6 pt thread that vanished over
  foliage. Widths are CSS px now, with a darker outline. Inside 4 m a putt's ribbon was a stub seen end-on that stood up like a
  white pole in his hand. It hides there, and the ground arrow aims the putt.
- **Leaf litter:** its contrast eases toward the tile's mean with distance, as the gravel's does, so it no longer speckles.
- **Feather flags and tents** count against aim spots like trunks (one a metre off the lens filled a third of the frame). The
  holed-out reaction picks the side with nobody else in the lens. A 0.3 m tap-in is shot side-on, the only view that parts the
  athlete from the basket.
- **Landscape verdict card:** it moved from 23% down the screen (on the athlete's face in the reaction shot) to the left third,
  low. The wide reaction lens keeps his raised fist.
- **Landing debris (two bugs):** particles were clamped at world y 0, so on low ground they popped up and on high ground they
  sank into the hill. Their point size used a fixed 220 px per metre, about 2 px for a 5 cm clod 7 m out on a phone. A splash
  now also throws a crown of spray and rings the water.
- **Cost:** tree limbs retract in the vertex shader, not by discarding bark fragments, which would have turned off an iPhone
  GPU's hidden-surface removal on every near trunk. Measured against PR #31 at the tee, three woods lies and a putt (headless,
  GPU-synced, median of 9): within run-to-run noise. The only difference is one draw call and two triangles for the contact shade.

[Splash, before and after](splash.jpg)

## Landscape HUD

The wind and elevation plate sat on the athlete's hip at the bottom right. It now sits under the score plate.
[Before and after](landscape-hud.jpg)

## Sound on a phone speaker

Every effect was rendered offline (`OfflineAudioContext`) and metered through a small speaker's response: a 350 Hz high-pass,
then the loudest 50 and 400 ms windows.

| Sound | Phone level before (400 ms) | After |
|---|---:|---:|
| Chains (hero) | -27.5 | -22 |
| Applause (good throw, birdie) | -50.8 | -25 |
| Near-miss "ohh" | -50.3 | -29 |
| Skip | -55 | -36 |
| Tree knock | -44.6 | -30 |

- A 12:1 bus compressor at -20 dBFS squeezed the whole mix. It is now a peak limiter behind a 60 Hz high-pass, with per-sound
  trims (`TRIM_DB`) in a chains-first order. A holed birdie putt (chains, then the jingle and applause) plays at -19 LUFS,
  peaking at -5 dBFS.
- **Every synthesis change was judged blind by Gemini.** Each pair was loudness-matched, with old and new swapped between rows,
  and a change shipped only when it won its pair. Gemini's absolute scores drift from chat to chat (its first verdict rated the
  original tray 4/10, a later blind pair 7.5), so only the pairwise wins count.

| Sound | Kept | Blind pair (old vs new, /10) |
|---|---|---|
| Chains | new: an impact, a cascade of struck links with their own inharmonic modes, the pole's clank, settling links | 2.5 vs 4.5, then 4.5 vs 6, then 6-7 vs 4.5 for a choked-ring variant (dropped) |
| Chain-out | new: a narrow crack, the outer link's zing, a gap with two or three lazy clinks | 5 vs 6.5 |
| Applause | new: six clappers, each with their own palm resonance, skin snap and tempo | 4 vs 5.5 (an eight-clapper version lost 4 vs 2) |
| Near-miss "ohh" | new: voices low-passed, vowel closing "ah" to "oh", breath and sigh | 1 vs 2.5 vs 5 |
| Womp | new: the brass filter opens with each note's breath | 3 vs 5.5 |
| Skip | new: a plastic slap on top | 4 vs 6.5 |
| Tree, splash, tray, roll | original (the rebuilds lost) | 6.5 vs 4.5, 6 vs 3, 7.5 vs 4, 4.5 vs 2.5 |
| Ambience | original (a live 14 s recording of each; a leaf-rustle layer read as static) | 7.5 vs 4 |

Real recordings would still beat synthesis for the chains, the gallery's applause and the "ohh".

## Reactions

A miss now puts both hands on the head for about a second before the slump clip: a procedural overlay like the clap. The slump's
9° stoop had not read at the result camera's distance. Checked on both athletes.
[Before and after](miss-reaction.jpg)

## Still open

- Real recordings for the chains, the applause and the "ohh": two Gemini videos are generated and waiting for the owner's OK
  to download.
- On a 0.4 m tap-in the athlete still covers part of the basket, and at 1.2 m he sits at the frame's edge.
- Landing shots in dense woods can still miss the pin when no spot clears the trunks.

## Checks

`npm test` (10 files), `npm run build`, `node tools/verify-browser.mjs --dist` (18/18, no browser or shader errors),
`node tools/verify-matches.mjs` (pass).
