# Round 3 animation authoring and evidence

## Package

- One unchanged 466,036-byte body and 160,840-byte LOD; exact eleven names: root, spine, head, shR, elR, shL, elL, hipR, knR, hipL, knL.
- Thirty separate mesh-free GLBs: ten throws for each hand, plus idle, practice, celebrate, slump and walk for each hand. Every left clip swaps left/right joints and reflects yaw/roll during Blender authoring. Actor scale stays positive and the disc socket attaches to elL for left-handed avatars. The printed 27 reads forward in both hands.
- `src/throw-poses.js` is the authored pose contract. `tools/extract-poses.mjs` exports it to `tools/poses.json`; `tools/author-golfer-clips.py` authors Blender actions and exports `art/blender/golfer-motion-r3.blend` plus separate GLBs. The old body source is preserved.
- Phase 0–0.5 windup, 0.62 release and 0.5–1 follow-through are unchanged. Fifty samples/second include 0.62 exactly. Lite samples the same poses with the same quaternion interpolation as glTF.
- The second critic pass prompted deeper knee loading and correct lead-leg bracing. A visual root-height support solver computes the lowest ellipsoid sole; at least one foot stays on the floor while the trailing foot is free to rise. It never changes authoritative lie X/Z.
- Following the independent critic, monotone cubic Hermite interpolation replaced stop-at-every-key smoothstep. The release now retains nonzero body angular velocity. Individual joints may slow at their natural turning points without making the entire actor settle.

## Footage actually inspected

These are visual references, not motion capture, tracing, or copied animation files. Proportions require a stylized reduction; the eleven-joint character has no finger or wrist bones.

| Source and inspected time | Observed motion | Authoring decision |
| --- | --- | --- |
| [PDGA / Disc Golf Live 43 part 1](https://www.youtube.com/watch?v=vJz2-ZBBVE4&t=400s), 6:40–6:46 | Cross-step turns hips and shoulders; disc travels across the chest before extension, with a planted leading leg. | Backhand reach-back, bent-elbow power pocket at .565, chest-led extension and trailing-leg finish. The in-place game animation omits a traveling run-up. |
| [PDGA / Disc Golf Live 43 part 2](https://www.youtube.com/watch?v=vm-gCOYVizo&t=90s), 1:30–2:12 | Mark Ellis demonstrates the forehand grip/palm orientation; this inspected interval is grip instruction, not a complete throwing cycle. | Hand/socket choice and forehand grip convention. The short eleven-joint rig represents the flick through elbow/shoulder motion; no claim of wrist articulation. |
| [Rowan McDonnell — 80 Different Ways to Throw a Frisbee](https://www.youtube.com/watch?v=nVZjg36GkFI&t=60s), 1:01–1:02 | Hammer releases over the throwing shoulder with hand above the head; arm descends outward through the finish. | Tomahawk clip follows an overhead arc. Removed a wrapped Euler windup that previously interpolated through the wrong direction. |
| [Rowan McDonnell](https://www.youtube.com/watch?v=nVZjg36GkFI&t=67s), 1:08 | Scoober starts low across the body and rises into an inverted release. | Lowered its cross-body setup and extended the release elbow; earlier version held the glove too close to the face. |
| [Rowan McDonnell](https://www.youtube.com/watch?v=nVZjg36GkFI&t=342s), 5:43 | A slingshot blade demonstrates an elevated, steep disc plane. Its slingshot mechanism differs from the game's forehand-style blade. | Used only as a steep-plane silhouette reference; the game's blade remains a separately authored forehand-family throw, not a copy of the slingshot action. |
| [Latitude 64 — How To Actually Putt Better In Disc Golf](https://www.youtube.com/watch?v=USuMDDDNsVw&t=170s), 2:50–2:53 | Staggered stance, rear-foot loading, transfer to front foot with trailing heel/foot rising while the hand extends. | In-place putt retains knee compression, forward extension and trailing-leg balance. |

[USA Ultimate's teaching cues](https://usaultimate.org/youth/how-to-play/) additionally informed forehand side stance and flat backhand release. Inside-out/outside-in are authored bank variants of the respective base throw, not claims of independent motion capture. Their torso and shoulder planes change while preserving the base timing. Blade is a steep forehand-plane variant; its flight bank remains authoritative in `THROWS`.

## Verification

- `node test/animation.test.mjs`: twenty distinct throw clips, 1,100 authored joint samples, positive node scales, exact release frame, continuous/nonzero body angular velocity at release for all ten throws, and 2,020 support-foot samples across both hands. Every windup compresses root height by more than 8 cm; every finish braces the correct lead sole and lifts the trailing foot by more than 6 cm.
- `node docs/qa/r3/test-motion.mjs`: actual Full GLB and Lite procedural runtime, both hands, every throw and eight phases including in-between samples. Maximum joint-position difference is approximately 0.01 mm; no JavaScript errors. Full and Lite use their real shipped actor factory, not a look-development substitute.
- [Runtime parity results](animation-parity.json).
- [All twenty normal-speed clips](animation-motion.webm), [browser playback](motion-review.html). The live [motion inspector](motion-inspector.html) also provides quarter-speed playback and phase scrubbing.
- [Right-handed filmstrip](animation-right-filmstrip.jpg) and [left-handed filmstrip](animation-left-filmstrip.jpg) sample preparation, windup, release and finish.

## Before/after provenance

`capture-motion-before.mjs` serves exact actor modules and clip bytes from `c41d7a0` through test-only request routes. It does not modify the working tree or substitute the current clips into the before capture. Add `--after` to capture the same camera, avatar and phases from the current runtime.

- [Before left-handed print](animation-before-left.jpg) / [after](animation-after-left.jpg).
- [Before backhand](animation-before-backhand.jpg) / [after](animation-after-backhand.jpg).
- [Before weight-transfer correction](animation-before-weight-fix.jpg) records the prior shallow loading.
- [Before critic curve correction](animation-before-fix.jpg) records the first round-three authored poses; it is not the round-two baseline.

Known limits: the large head and short eleven-bone arms compress human overhead silhouettes. There are no wrist/finger bones, root travel or foot IK. Runtime parity and a technically correct release do not establish a Nintendo motion-quality win; the independent critic's verdict remains separate. Physical Android and iPhone frame rates remain owed.
