# Round 3 references

## Switch Sports — visual comparison only

[Clam: Switch Sports Golf 18 Holes −41](https://www.youtube.com/watch?v=qHaku5GRkPU&t=127s), Hole 3, approximately 2:07–2:11. Inspected in the browser, paused and stepped through the swing with YouTube's controls. `switch-setup.jpg`, `switch-address.jpg`, `switch-windup.jpg`, `switch-impact.jpg`, and `switch-follow.jpg` are captures of those actual displayed frames. Page chrome was cropped away; fullscreen captures were resized. No reference image is loaded by the game.

Comparisons hide product labels and use phone-sized crops, but recognizable characters, different sports, camera angles and fields of view prevent true identity blinding. The animation board compares preparation, impact/release and follow-through; a still sequence does not certify motion quality. Critics record these limits in their individual reports.

The Wii and Switch galleries were studied in the accepted prior milestone. Historical captures are recoverable in Git at `d8d7b4b`; only current comparison frames remain in this directory.

## Original tiles

Twelve distinct image-generation calls produced the material masters. The fairway received one further edit after the critic identified doubled mowing stripes. Exact initial prompts, generated-file paths and hashes, plus the revision request, are in `art/textures/r3/prompts.json`. Checked-in 512px grayscale masters rebuild the shipped 256px JPEGs with `python tools/texture-pack.py`. Broad mowing bands remain in the course colors; the revised fairway detail tile carries irregular grass strokes.

## Throw mechanics

See the animation report for footage URLs, observed timecodes and the distinctions between footage study, original keyframe authoring and runtime verification. The clips are authored animation, not captured human motion.
