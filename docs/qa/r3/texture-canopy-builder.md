# Canopy structure iteration

The texture critic's largest remaining gap was overlapping leaf/frond volume. This follow-up changes foliage geometry and vertex colours in `src/course.js`; the painted tiles, terrain, tree positions, collision envelopes and physics stay as they were.

## Changes

- Twelve smaller overlapping deciduous masses replace four large spherical masses. Their combined extent stays inside the previous crown bounds. Each has a slightly scalloped contour and softly painted darker underside.
- Pine fronds overlap through six inset tiers. The silhouette remains inside the prior pine envelope, and its triangle count decreases.
- Vertex colours supply the sheltered underside value on the existing toon materials. There are no new render passes, texture downloads or draw batches. The separate leaf/pine detail textures remain bound.
- Lite uses 48 triangles per leaf mass, 576 per deciduous crown, equal to its previous four-sphere total. Full uses 1,728 rather than 1,584 per deciduous crown.

## Matched capture measurements

Pine Hollow, one player, settled aim camera, 430 × 932 CSS pixels, desktop Chromium. These are scene/render counts, **not real-phone frame-rate measurements**.

| Measurement | Lite before | Lite after | Full before | Full after |
|---|---:|---:|---:|---:|
| All instanced triangles in scene | 2,041,388 | 1,929,716 | 3,657,212 | 3,776,372 |
| Instanced batches in scene | 263 | 263 | 263 | 263 |
| Frame draw calls | 113 | 113 | 92 | 92 |
| Frame triangles | 858,086 | 837,134 | 1,095,914 | 1,110,242 |
| JavaScript / shader errors | 0 | 0 | 0 | 0 |

Full's total instanced triangle increase is 3.3%; Lite decreases 5.5%. Capture camera/animation timing can affect frame counts, so whole-scene counts are the stable topology comparison. No runtime asset bytes were added by this iteration.

`node test/physics.test.mjs` passes all ten throws, both hands and two powers. `node --check src/course.js` passes.

Reproduce captures with `PLAYWRIGHT_MODULE` pointing to Playwright and `CANOPY_STAGE=before` or `after`, then `node tools/texture-canopy-verify.mjs`. JSON files record both qualities. The before captures were taken before source changes; after captures show the current source.

## Visual evidence and review

`texture-canopy-before-{high,low}.png` and `texture-canopy-after-{high,low}.png` show the same aim scene. The new leaf clusters and sheltered overlaps are visibly distinct from the former broad crown faces. A separate critic must decide the comparison winner; this builder makes no reference-win claim.
