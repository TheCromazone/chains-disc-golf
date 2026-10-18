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
| Skip / roll | -55 / -55 | -36 / -35 |
| Tree knock | -44.6 | -30 |
| Ambience (wind, leaves) | -59.3 | -43 |

- A 12:1 bus compressor at -20 dBFS squeezed the whole mix. It is now a peak limiter behind a 60 Hz high-pass, with per-sound
  trims (`TRIM_DB`) in a chains-first order. A holed birdie putt (chains, then the jingle and applause) plays at -19 LUFS,
  peaking at -5 dBFS.
- Sounds with nothing a phone can play were reworked: the "ohh" is voiced through formants, the roll has a rim whirr, the skip
  a plastic slap, and the ambience a leaf-rustle layer that follows the gusts.
- Gemini judged the synthesis blind: chains 3/10, tray 4, tree 3.5, splash 2, applause 1.5 ("frying bacon"), ohh 1. The tree,
  splash, tray, applause and womp were rebuilt to its notes (hollow trunk modes and a leaf shiver; a surface slap, spray and
  rising bubbles; the welded wire ringing; eight clappers with their own palm resonance; a brass filter that opens with the
  breath). Its top three to replace with real recordings are the chains, the "ohh" and the applause.

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
