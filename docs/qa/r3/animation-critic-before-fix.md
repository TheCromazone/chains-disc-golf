# Independent animation critic — round 3

## Verdict

**A wins: Switch Sports.** B is Chains right-handed backhand; C is Chains left-handed backhand. At comparable actor height, A communicates preparation, contact, and the direction of the finish more convincingly. Chains has legible throw families and a readable jersey number, but it does not earn a motion-quality win from these images.

Board: [product-label-hidden comparison](animation-ab-board.png), [inspectable HTML](animation-ab-board.html). Each column is 360 CSS pixels wide; the actor is approximately 195–205 pixels tall. The board uses cropped/resized *saved actual frames*, without repainting, generation, pose edits, or horizontal mirroring. B/C are the first row of their respective ten-throw filmstrips. Existing scene backgrounds remain; this hides product labels, not visual identity. This is one critic's comparison, not a blind user study.

## Single biggest gap: the release loses momentum at the release key

The priority is to make the motion **travel through phase 0.62**, rather than ease into that pose and restart toward the finish.

In the matched board, B/C's release looks like an upright arm presentation. The finish lifts a foot, but the chest/arm relationship does not sell the same clear transfer of force that A's compressed address and wrapped finish do. This is a pose-based judgment; the board alone cannot prove acceleration, smoothness, or a hitch.

After the visual judgment, source inspection revealed a concrete timing mechanism supporting this concern. `src/throw-poses.js` applies `u = u*u*(3-2*u)` independently between every pair of keys. Its derivative is zero at both endpoints, so every keyed joint decelerates toward phase 0.62 together, then accelerates away again. The extra backhand key at 0.565 receives the same treatment. An isolated finite-difference check of the authored backhand sampler gave combined joint Euler rates of 75.57 at phase 0.5925, 5.40 at 0.619, approximately zero at 0.62, and 0.63 at 0.621 (radians per phase unit; this is a diagnostic norm, not physical hand speed). The GLB's baked interpolation can alter the exact instantaneous derivative; this measurement establishes the authored slowdown, not a measured on-device hitch.

**Actionable fix:** retain all eleven joints, all ten throws, both hands, the 0–0.5 windup, and release at exactly 0.62. Replace per-segment stop-at-every-key easing around the release with a continuous curve that carries nonzero throwing-hand velocity through 0.62. Let the hips/chest lead the shoulder/elbow and decelerate into the finish during 0.8–1. Re-bake the GLB from the same sampler so Lite and GLB remain aligned. Do not solve this by moving the release event or merely shortening the entire clip.

Acceptance: inspect continuous normal-speed and quarter-speed playback for every throw in RH and LH; verify that the hand passes through 0.62 without an intermediate settle and that the finish absorbs the same directional motion. Check dense hand-position samples across 0.58–0.66 in both actual rigs. Correct release timing and parity alone are insufficient.

## Comparison dimensions

| Dimension | Finding |
|---|---|
| Anticipation | A wins. Bent knees, lowered torso, and the loaded implement make preparation obvious. B/C rotate, but the tall torso and relatively straight-looking support leg weaken loading at this view. |
| Release silhouette | A wins for force direction. B/C expose the arms, but the throwing glove, shoulder, and chest overlap in the RH view. LH opens more clearly to this camera. This is a camera difference, not proof of unequal mirrored motion. |
| Follow-through | A wins. Its turned torso, wrapped arms, and trailing foot form one directional finish. B/C show a lifted leg and turned torso, but the throwing hand remains close to the chest in the backhand sample. |
| Handedness / jersey | Chains passes the inspected visual check. The disc changes sides, the 27 remains normally readable when facing the camera, and the jersey is not texture-mirrored. Some windup/side poses naturally occlude it. There is no equivalent numbered-jersey test in A. |

## Evidence and limits

- Inspected both complete ten-row RH/LH filmstrips before reading animation source. Backhand and forehand bank variants change torso/arm plane; overhand families and putt have distinct pose signatures. This is pose coverage, not certification of twenty complete motion clips.
- Inspected the live GLB runtime at `http://localhost:8093/docs/qa/r3/motion-inspector.html`: RH backhand at 0.5, 0.62, and 0.8; LH backhand at 0.62; LH tomahawk at 0.8. Disc disappearance and handedness matched those selected states.
- Reference stills: `switch-address.jpg`, `switch-windup.jpg`, `switch-impact.jpg`, `switch-follow.jpg`, supplied from [the reference video](https://www.youtube.com/watch?v=qHaku5GRkPU&t=128s), approximately 2:08–2:11. Golf impact and disc release have different mechanics; the comparison concerns readable loading and finish, not copying a golf swing.
- `animation-motion.webm` is present. Direct browser video navigation was blocked by the browser, so I do not claim to have watched or certified continuous playback. `record-motion.mjs` records six families in each hand, omitting the four bank variants: it is not twenty-clip dynamic coverage. Real-time dynamic quality remains unscored.
- Only the review and comparison-board artifacts were written. No game code or Git changes were made.
