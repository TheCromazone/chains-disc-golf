# Independent animation critic — round 3, after revision

## Verdict

**Switch Sports (A) still wins the visual motion comparison. Chains improved; it has not demonstrated a Nintendo-beating result.** The earlier release-stop defect is corrected in the authored sampler. The remaining largest visual gap is grounded body loading and weight transfer.

[Updated label-hidden board](animation-ab-board.png) · [inspectable board](animation-ab-board.html) · [360 px live runtime and recording](animation-review-playback.html) · [reviewed runtime screenshot](animation-reviewed-runtime.png).

Board key: **A** reference; **B** Chains RH before the fix; **C** Chains RH after; **D** Chains LH after. Columns are 360 CSS pixels wide, actors approximately 195–205 pixels tall. These are saved actual frames, cropped and resized by the HTML layout. No generated poses or horizontal mirroring. Product names are removed from column headings; the source styling remains recognizable. This is a single critic's comparison, not a blind user study.

The backhand key poses in B and C are intentionally almost identical. **Their similarity neither disproves nor demonstrates the interpolation improvement.** Velocity between poses must be assessed separately.

## Before finding → after result

**Before:** `poseAt` independently smoothstepped every key interval. Every joint was forced toward zero velocity at the 0.62 release key, then accelerated again toward the finish. The old sampler's combined backhand joint Euler rate was approximately zero at release.

**After: the specific defect is fixed.** The updated monotone cubic Hermite sampler carries a shared nonzero tangent through monotonic joint channels. A repeat of the same independent finite-difference diagnostic gives:

| Phase | Before | After |
|---|---:|---:|
| 0.619 | 5.40 | 10.04 |
| 0.620 | 0.013 | 8.44 |
| 0.621 | 0.63 | 8.50 |

Values are the norm of authored joint Euler rates, in radians per phase unit—not physical hand speed or an on-device frame-rate measurement. Local extrema can still have zero tangents, appropriately; the whole body is no longer compelled to stop together. The builder reports the GLB rebake, 1,100 parity samples, and all ten release-velocity checks passing. I inspected the revised sampler and regenerated runtime poses rather than rerunning that entire suite.

The scoober correction is also visible: the release arm extends upward and the throwing glove clears farther from the chest. Both RH and LH retain an ordinary readable 27 on the jersey. At this frontal camera, the glove can still overlap the face; this is a camera/silhouette observation, not a new correctness defect.

## Single biggest remaining gap: grounded loading and weight transfer

At phone scale, the reference visibly compresses into preparation and finishes with chest, arms, and trailing foot pointing along one action. Chains' backhand still keeps a tall, relatively rigid trunk over straight-looking support legs. Turning the torso and lifting a foot communicates a pose change, but the pose sequence gives less evidence that the lower body loaded and then drove the throw. This remains clear in the unchanged B/C keys and the updated LH row.

**Next actionable art fix:** strengthen the existing root, spine, hip, and knee poses around 0.35–0.5 so a loaded rear leg and a braced lead leg read in silhouette. Carry that body lean over the lead leg through release, then let the chest and trailing foot resolve in the throw's direction by 0.8. Check the planted foot stays visually grounded. Preserve the corrected continuous interpolation, all eleven bones, all ten throws, handedness, 0–0.5 windup, release at exactly 0.62, and the 0.5–1 follow-through contract. Do not copy the reference's golf club mechanics.

A useful acceptance comparison is the same actor-height board at 0.35, 0.5, 0.62, and 0.8, plus actual normal-speed playback: the direction of body effort should remain legible when the disc and UI labels are hidden.

## Dimension comparison after revision

| Dimension | Current finding |
|---|---|
| Anticipation | **A wins.** Its bent knees, lowered torso, and loaded implement communicate preparation. C/D still look relatively upright despite their rotation and step. |
| Release silhouette | **A wins for readable force direction.** Chains distinguishes throw families and the scoober extension is improved. RH backhand still overlaps throwing glove/shoulder/chest more than the LH view at this camera. |
| Follow-through | **A wins.** Its turned torso, wrapped arms, and trailing foot form one finish. Chains has a raised trailing leg, but less body compression and transfer leading into that finish. |
| Handedness / jersey | **Chains passes the inspected check.** Side changes are visible and 27 is not texture-mirrored. A has no comparable numbered-jersey test. Occlusion during turned poses is natural. |
| Release continuity | **Chains improved versus its prior build.** The forced all-joint stop is removed. This is supported by the changed sampler and measured rates, not inferred from held-pose images. |

## Runtime and evidence limits

- Re-inspected both regenerated ten-row filmstrips. Their twenty hand/throw combinations provide pose coverage. Backhand/forehand bank variants remain distinguishable by their body/arm plane; the other families retain separate silhouettes.
- Opened the actual updated `motion-inspector.html` in two **360 × 780 CSS px** iframe views. Both GLB loops progressed. Selected the updated scoober and sampled phase 0.62 for each hand; after rendering settled, both showed the extended release arm, vanished disc, and readable jersey number. The lower-body issue is also visible in the running backhand preview.
- The new `animation-motion.webm` loads successfully in the HTML video preview. Verified duration **29.72 seconds**, ready state 4, and playback advancement through 10.75 seconds to 29.54 seconds while unpaused. The revised recorder enumerates all ten throws for both hands, fixing the prior twelve-clip recording coverage. This supersedes the earlier direct-video-navigation limitation.
- I reviewed live runtime states and timed screenshots; those do not constitute equivalent continuous visual playback of both products. Reference evidence remains the four supplied frames from [the reference video](https://www.youtube.com/watch?v=qHaku5GRkPU&t=128s), approximately 2:08–2:11. No comparative smoothness, frame-pacing, or Nintendo-beating dynamic-quality claim is made.
- [Original review](animation-critic-before-fix.md) and [original board](animation-ab-board-before-fix.png) are preserved. Only review/board/playback artifacts were written; no game source or Git changes.

### Additional baseline and slow-playback check

The supplied `c41d7a0` baseline images were also inspected: [backhand before](animation-before-backhand.jpg) / [after](animation-after-backhand.jpg), and [LH print before](animation-before-left.jpg) / [after](animation-after-left.jpg). They establish a material change to the windup and a clear correction of the mirrored LH jersey text. **These are the round-two baseline; board column B is instead the first round-three build immediately before the curve correction.** They must not be conflated. The [authoring record](animation-authoring.md) documents exact baseline routing and the footage inspected by the builder; I do not represent those footage viewings as my own.

Reloaded the updated live inspector, selected Quarter speed in both 360 px views, and restarted the RH/LH backhand loops. The controls and phase progression worked. This adds a usable slow-playback review surface; it does not change the limits on comparative continuous-motion perception or the winner above.
