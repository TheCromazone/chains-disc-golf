# Canopy reference and comparison method

Reference: [Clam, Switch Sports Golf 18 Holes −41](https://www.youtube.com/watch?v=qHaku5GRkPU), Hole 3. Inspected the actual YouTube playback in the browser. `reference-tee.png` shows 1:39; `reference-flyover.png` shows approximately 1:44, during the elevated ball-follow camera. This is an aerial course view, not the game's introductory flyover. No Nintendo image is loaded by Chains.

Chains tee captures use Pine Hollow hole one at 430×932 and 812×375. Final flyover captures freeze the **existing** hole-intro camera at phase time 4.0 seconds, at 812×375. The game camera implementation is unchanged. Before captures serve `src/course.js` from commit `c15b0ee` through a test-only browser route; the working tree is never reverted. All other sources remain current.

The comparison board shows 430 CSS-pixel-wide excerpts without sharpening or recoloring. It crops the browser header; from v2-clean onward Chains HUD is hidden in the QA browser only. Tee and flyover framing, tree scale, sport and video compression differ. Labels conceal product names but visual identity may remain recognizable. This is an independent label-hidden visual review, not a controlled identity-blind user study.

V1/v2 use portrait tee excerpts and the earlier 3.6-second flyover framing. The critic identified cropped treetops in the flyover, so the later boards show unobstructed landscape views. Crucially, v3's provisional outside-canopy finding in the wide board was **rejected on a closer portrait check**. Portrait validation remains required; a wider camera alone cannot close the canopy gap.

Board key (kept out of the critic's initial prompt): **A/D/E reference; B Chains Full tee; C Chains Lite tee; F Chains Full flyover.** The critic initially sees only the lettered board. The same order is retained during revisions to make specific feedback traceable.

Reproduce the baseline with `CANOPY_STAGE=before` and the final capture with `CANOPY_STAGE=v7`. Set `PLAYWRIGHT_MODULE` to the installed Playwright module. `CANOPY_VIEW=portrait` makes the closer comparison board; omit it for the wide board. Intermediate boards preserve the actual judged pixels, but only the final geometry is shipped.

```text
node docs/qa/r4/capture-canopy.mjs
node docs/qa/r4/make-board.mjs
```

FPS overlays visible in QA screenshots are desktop readouts, **not device measurements**. Only the user's Android and iPhone readings populate the physical-device results.
