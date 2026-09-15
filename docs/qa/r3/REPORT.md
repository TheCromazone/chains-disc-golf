# Chains — round three

## Delivered

- **Twelve original painted tiles**, 147,640 bytes total, with 512px authoring masters and reproducible 256px JPEG packaging. Terrain, foliage, props, water and both golfer rigs sample their named manifest slots. Toon lighting and the bright palette remain.
- **Thirty separate Blender clips**: ten throws and five common actions for each hand. The body and LOD are unchanged. Left-hand clips keep positive scale and readable jersey printing. Lite and Full share the same pose sampler, release at 0.62, continuous release velocity and grounded leg loading.
- **Sound condition honored:** no ElevenLabs key was available, so the generator was not called and synthesis remains unchanged.
- **Historical QA imagery pruned:** 214 files / 43,971,015 bytes removed from the checkout. Current evidence remains here; older images are recoverable at `d8d7b4b`. Git history was not rewritten.

The inherited review changes were committed first as `c41d7a0`. Painted tiles are in `a88730f`; sound/device evidence and historical pruning in `9bb2d11`; authored motion in `9a1439d`; the canopy follow-up in `b5837fe`.

## Verification

| Check | Result |
|---|---|
| Physics | All ten throws, both hands, two powers; finite flight and mirrored outcomes. Left-handed overhand turnover corrected. |
| Exported motion | Twenty distinct throw clips; 1,100 joint samples; positive scales; exact 0.62 release. |
| Motion support | 2,020 support samples; visible windup compression, braced lead leg and lifted trailing foot. |
| Full/Lite parity | Both real rigs, every throw and hand, eight phases including intermediate samples. [Raw results](animation-parity.json). |
| Asset manifest | 83 entries pass file, GLB, bone, clip and budget checks. |
| Material coverage | Twelve loaded 256px maps sampled by actual material shaders across Pine and Lake; no shader errors. [Results](texture-results.json). |
| Integration | Actual pointer swipe, complete Full hole, live basket/birdie feedback and empty-assets play in both qualities pass. [Results](after-integration-results.json). |
| Feedback / normalization | Event tests pass. The −6 dBFS normalizer test uses a synthetic fixture; it does not certify generated audio. |
| Layout | Six viewports, including **open ten-entry throw sheet**, pass overlap, bounds and label checks. [Results](after-browser-results.json). |

Viewport set: 360×740, 430×932, 812×375, 568×320, 768×1024 and 1366×768. Application errors are absent. Chromium's screenshot-related ReadPixels GPU warnings are retained in the raw report rather than described as game errors.

Startup accounting includes navigation and exposed resource timing for local files and CDN code. **Lite: 670,430 encoded bytes / 681,230 transferred bytes. Full: 2,110,000 / 2,131,300 bytes.** Lite requests no GLB or Basis decoder at startup. [Final ledger and contract checks](final-verification.json). Texture checks also record first-hole and subsequent Lake loads. These byte measurements are not physical-device performance measurements.

## Before / after and review

- Textures: [before](before-hud-430.png), [final canopy scene](texture-canopy-after-high.png), [all twelve tiles](texture-contact-sheet.jpg), [tile review iterations](texture-critic.md), [final independent canopy critique](texture-canopy-critic.md), [phone comparison](texture-canopy-ab-board.html).
- Animation: [backhand before](animation-before-backhand.jpg) / [after](animation-after-backhand.jpg); [left-hand print before](animation-before-left.jpg) / [after](animation-after-left.jpg); [all twenty in motion](motion-review.html); [phone comparison](animation-ab-board.png); [independent review](animation-critic.md).
- [Authoring sources and footage observations](animation-authoring.md), [reference provenance](references.md), [sound/device builder](sound-device-report.md), [sound/device critic](sound-device-critic.md).

## Acceptance limits — still owed

**The requested Switch-beating comparison has not been achieved.** Independent critics prefer the revised textures and motion to their earlier versions, and accepted the release-timing and weight-transfer fixes. They still select Switch Sports overall. The remaining largest differences are cohesive leafy canopy volume and separation of glove/torso silhouettes. Product-label-hidden boards are not a true identity-blind user study; camera, sport and framing differences are disclosed.

**Real Android and iPhone frame rates remain unmeasured in both Lite and Full.** No browser-debug connection to either physical device was available. A paired iPhone's audio endpoints cannot measure Safari. All four values remain null in [device discovery](sound-device-detection.json). The [prepared benchmark helper](device-benchmark.js) is unrun; desktop/emulated numbers are not substituted.

Storage keys, online message shapes, the eleven-bone contract, and empty-assets fallback are preserved. Decisions are recorded in [docs/decisions.md](../../decisions.md).
