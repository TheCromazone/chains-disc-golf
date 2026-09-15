# Independent animation critic — round 3, final weight-transfer re-review

## Acceptance and winner

**Accept the weight-transfer fix. The previously blocking motion findings are resolved.** The revised windup visibly loads the knees, and the finish clearly distinguishes the supporting leg from the lifted trailing leg in both hands. The earlier forced stop at release remains corrected. No additional blocking motion issue emerged in this re-review.

**Switch Sports (A) still wins the overall visual comparison.** That is compatible with accepting this improvement. Chains now communicates the requested stylized loading and transfer; it has not demonstrated superior overall animation craft or continuous-motion quality.

[Updated label-hidden board](animation-ab-board.png) · [inspectable board](animation-ab-board.html) · [360 px runtime/playback](animation-review-playback.html) · [loaded poses](animation-reviewed-loading.png) · [supported finish](animation-reviewed-runtime.png).

## Before → after

The current board uses **A** for the reference, **B** for Chains RH immediately before the weight correction, **C** for current RH, and **D** for current LH. Each column is 360 CSS pixels wide. Address actor height is approximately 195–205 pixels; scale stays fixed through each Chains sequence so the deeper crouch is visible. All panels use saved actual frames, with no generated poses or horizontal mirroring. Source names are hidden in the headings; recognizable visual styling remains.

| Finding | Before | Current verdict |
|---|---|---|
| Windup load | Rotated upright trunk with little readable leg compression. | **Resolved.** Both RH and LH have an unmistakable lowered, bent-knee windup at 0.5. It is exaggerated, but readable at phone scale. |
| Weight transfer / finish | A raised leg did not establish a clear supporting side. | **Resolved for this scope.** The lead leg braces and the trailing foot lifts clearly by 0.8. The two sides are visually distinguishable. |
| Momentum at 0.62 | The original per-segment smoothstep forced all joints toward a stop. | **Remains resolved.** The shared continuous interpolation is retained. The previous independent sampler check measured a nonzero release rate after that fix. |
| Handedness / print | The round-two baseline mirrored LH jersey text. | **Remains resolved.** Current 27 reads normally when visible; body turn and arm occlusion are natural. |

This judgment concerns readable in-place throw motion. It does not require copying golf mechanics, adding a traveling run-up, or moving the game lie.

## Single remaining relative quality gap — nonblocking

**Upper-body release and finish silhouette.** In the RH backhand view, the glove still clusters against the shoulder/chest around release and finish. The reference's arms and torso make its finishing direction easier to read. This is the largest remaining reason I prefer A; it does not reopen the now-resolved lower-body finding.

For a later polish pass, adjust the throwing shoulder/elbow arc so the glove separates more clearly from the torso between 0.62 and 0.8 when seen from the actual player camera. Preserve the accepted lower-body timing, continuous release, all eleven bones, all ten throws, both hands, and release at exactly 0.62. Do not enlarge the motion merely to mimic the reference's long golf club.

## What was checked

- Re-inspected the regenerated RH and LH ten-row filmstrips before judging the new result. The knee compression and changed supporting side are visible across families; the base/bank variants and separate overhand/putt silhouettes remain legible.
- Opened the updated actual GLB inspector in two 360 × 780 CSS pixel iframe views, selected Quarter speed, and restarted both backhand loops. Verified advancing phases, then sampled 0.5 and 0.8 and inspected the settled rendered poses in both hands. Saved current loading and finish screenshots.
- The refreshed twenty-clip recording loads in the HTML video player with ready state 4 and a duration of 29.8 seconds. Started playback and verified it reached currentTime 29.8 with ended=true. The recorder enumerates all ten throws in both hands. This verifies playable coverage, not uninterrupted perceptual review of every frame.
- The builder's [authoring and verification record](animation-authoring.md) reports 2,020 support-foot samples, all twenty runtime parity combinations, more than 8 cm windup root compression, more than 6 cm trailing-foot lift, and retained continuous release. These corroborate the visible improvement; I did not duplicate the full regression suite.
- Stills and timed runtime screenshots cannot establish comparative frame pacing or the full subjective quality of continuous playback. Equivalent continuous playback of the Switch reference was not obtained. No Nintendo-beating motion claim is made. Reference frames remain from [the supplied sequence](https://www.youtube.com/watch?v=qHaku5GRkPU&t=128s), approximately 2:08–2:11.

## Provenance

`animation-before-weight-fix.jpg` is the immediate previous round-three build and is current board B. `animation-before-fix.jpg` is the earlier round-three build before the release-curve correction. Neither is the round-two baseline. The exact round-two `c41d7a0` images are [backhand before](animation-before-backhand.jpg) / [current after](animation-after-backhand.jpg), and [LH print before](animation-before-left.jpg) / [current after](animation-after-left.jpg); these show the changed windup and corrected LH print.

[Previous weight-transfer review](animation-critic-before-weight-fix.md), [original release-curve review](animation-critic-before-fix.md), and their corresponding earlier board screenshots are preserved. Only review/board/playback artifacts were written; no game code or Git changes.
