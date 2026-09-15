# Chains — sports art pass

## Status

Implemented and committed the new character pipeline, face decals, toon world, glass clubhouse/locker, compact HUD and feedback integration. **The complete brief is not accepted yet:** ElevenLabs recordings are absent, the world still loses the reference comparison, and physical Android/iPhone frame rates are unverified.

## Before / after

| Piece | Before | After / evidence |
|---|---|---|
| Character | [Previous golfer](09-character-before.png) | [Full front](09-character-high-front.png), [Full side](09-character-high-side.png), [Lite front](09-character-low-front.png), [rig report](09-character-report.md) |
| Face parts | [Initial incorrect Full atlas](08-locker-430.png) | [Corrected creator](19-locker-430.png), [object-identity and clip checks](09-character-results.json) |
| World | [Previous Full](06-full-pine.jpg), [first toon pass](08-hud-430.png) | [Final portrait](19-hud-430.png), [landscape](19-hud-812.png), [geometry/lighting report](18-world-report.md) |
| Clubhouse | [Previous menu](07-ui-after.png) | [Glass clubhouse](19-clubhouse-430.png) |
| Locker | [Previous locker](07-locker.png) | [Tabbed live creator](19-locker-430.png) |
| HUD | [Previous HUD](07-hud.png), [intermediate HUD](12-hud-430.png) | [Compact HUD](19-hud-430.png), [equipment picker](15-ui-picker-430.png), [utilities](17-ui-utilities-430.png) |
| Feedback | [Previous toast style](10-feedback-430.png) | [Actual basket event](18-live-chains.png), [actual birdie reaction](18-live-birdie.png) |
| Sound | Synthesized fallback, empty `sfx` | [Generator and normalization implementation](../../tools/generate-sfx.py), [independent review](critic-sound-feedback-final.md); recordings still blocked |

Files called `*-feedback-430.png` are staged typography/layout checks in aim mode. Only `*-live-chains.png` and `*-live-birdie.png` capture actual simulated basket-event/result playback. The near-basket fixture deliberately places the player four metres away, then uses the production simulator, event queue and throw playback.

## Validation

- `node test/physics.test.mjs`: pass. `src/physics.js`, `src/input.js` and `src/net.js` are byte-for-byte unchanged from `c98e36e`.
- `node test/assets.test.mjs`: pass, 51 manifest entries. Body 466,036 B / 10,800 triangles; LOD 160,840 B / 3,230 triangles. Ten animation-only files contain no mesh payload. Eleven bone names remain unchanged.
- `node test/feedback.test.mjs`: pass. Holed rim/band contacts do not trigger disappointment; missed contacts trigger it once; chain feedback receives the speed-class input.
- `python test/sfx-normalization.py`: pass, −6.0 dBFS measured on a sine fixture. This is not a generated-recording audition.
- [Integration results](18-integration-results.json): actual pointer swipe; complete Full-quality hole in five throws; ten loaded clips; real basket/drop event and Birdie! result; empty manifest works in both qualities with finite trajectories. No JavaScript errors.
- [Six viewport audit](19-browser-results.json): 360×740, 430×932, 812×375, 568×320, 768×1024, 1366×768. Reuses `overlap-audit.js`, including panel scroll bottoms and native leave dialog.
- [Expanded equipment checks](15-ui-picker-results.json) and [expanded utilities checks](17-ui-utility-results.json): all six sizes pass; selection, Escape/focus return, touch mute and contextual power visibility verified.
- First screenshot context may log four Chromium `ReadPixels` GPU-stall warnings. These are recorded rather than described as a completely warning-free run; no application exceptions occurred.
- Fifty-four additional terrain drives with generated tree collisions stay finite. [World report](18-world-report.md) distinguishes sampled consistency from complete course-balance validation.

## Startup budget

Cold-page Resource Timing accounting includes HTML, local assets, CDN modules and exposed codec transfers. No measured entry has a missing/zero encoded size. Values vary slightly while the actual course thumbnails are regenerated.

| Quality | Encoded content | Transfer including measured headers |
|---|---:|---:|
| Lite | approximately 0.63 MB | **under 0.65 MB** |
| Full | approximately 1.67 MB | **under 1.70 MB** |

Exact per-request values are in `19-browser-results.json`. Lite skips all GLB/clip/Full-face texture requests. Each disc stamp is 6.6–18.7 KB, below 60 KB. Grass and water normal manifest entries now reference small 256px JPEGs. Source PNGs and retired art remain available, but are not default startup requests.

## Critic outcomes and limits

Builders and separate critics reviewed the pieces independently. The full trail is retained: [round one](critic-round1.md), [round two](critic-round2.md), [seven-piece blind board review](critic-final-art.md), [HUD/world revision](critic-next-world-hud.md), [landform/HUD revision](critic-landform-hud.md), [world review](critic-world-last.md), and [sound review](critic-sound-feedback-final.md).

The seven-piece board selected our character, face, clubhouse and locker, with residual shape criticisms. The later HUD comparison provisionally selected ours for phone legibility. The reference world remains stronger. The feedback pair used mismatched preparation/result states, so its preference cannot establish a superior celebration. Recognizable characters, unequal aspect ratios and different screen functions limit these informal blind comparisons. **No universal win over Wii or Switch Sports is claimed.**

## Outstanding

1. **Twelve ElevenLabs recordings.** `ELEVENLABS_API_KEY` is unavailable; invoking the generator exits explicitly blocked. `manifest.sfx` remains `{}`. The resumable generation/normalization pipeline is ready and synthesis still works.
2. **World visual acceptance and equivalent-state feedback comparison.** The current world is cleaner and more legible, but still lacks the reference's finished terrain/lighting depth. Further art work is required to meet the requested win condition.
3. **Physical Android and iPhone frame rates.** The 60 fps Lite / 45 fps Full targets, real touch precision and Safari behavior are still owed. Desktop automation does not certify them.

[Source references](references/README.md) · [Decisions](../decisions.md)
