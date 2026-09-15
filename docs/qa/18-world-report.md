# World art revision

## Visual evidence

- Before: [08-hud-430.png](08-hud-430.png).
- After, portrait: [18-hud-430.png](18-hud-430.png).
- After, landscape: [18-hud-812.png](18-hud-812.png).
- Independent criticism: [critic-landform-hud.md](critic-landform-hud.md) and [critic-world-last.md](critic-world-last.md). Both prefer the reference world. No reference win is claimed.

The final scene uses a toon palette, a shaped and striped fairway, dark rough collars, a light destination green, a pale soil bank, an active-hole number marker, soft ground shadows, a gradient sky, and cartoon clouds. Photographic terrain textures, HDRI lighting, SSAO, and bloom are absent from the default look.

A subsequent lighting refinement bakes a six-value directional ramp from the terrain's vertex normals into its colors, helping adjacent slopes separate without additional textures or rendering passes. See [19-hud-430.png](19-hud-430.png). It changes no geometry or collision data.

## Intentional geometry changes

The playable terrain **has changed**, rather than only its materials. Each hole contributes a broad ridge near 79% of its route, a hollow near 27%, an asymmetric shoulder near 55%, and a shallow swale near 61%. Their nominal contributions are +6.4 m, −1.8 m, +3.8 m, and −2.3 m, blended spatially and scaled by course. Contributions overlap, so these values are not measured elevations at individual points.

Near tees, both sides open into wider clearings. A longer clearing on one side contrasts with a deciduous guardian group on the other. Spatially varying tree density breaks the continuous rows. Tree locations, species, and counts therefore changed intentionally. Tee/basket endpoints, nine-hole layouts, physics infrastructure, network messages, and storage contracts were retained. The pale soil bank is visual terrain color, not a new gameplay hazard.

Terrain vertices, lies, surface normals, pond levels, tree bases, and collision queries derive from the same shared height function. The terrain mesh samples that function on its existing grid; its triangles interpolate between samples. Tree meshes and collision records are created together from the same placement and species branches. This preserves their shared position/base-height contract; the existing simplified collider shapes remain approximations of the visual crowns. Distant decorative hills sit outside the playable bounds.

## Validation

`node --check src/course.js` and `node --test test/physics.test.mjs` passed after the final production edits.

An additional independent Node probe evaluated the current source's height and tree-placement functions. It sampled each hole's straight tee-to-basket line at 21 points and simulated backhand driver throws at 60% and 90% power from every tee: **54 drives across 27 holes**, with generated tree collisions enabled. The probe used a local tree-neighborhood filter rather than the runtime spatial index. Every simulated result had finite resting coordinates and distance; sampled heights and normals were finite.

| Course | Drives | Generated trees | Sampled non-water route slope, maximum |
|---|---:|---:|---:|
| Pine Hollow | 18 | 3,154 | 0.56 |
| Cedar Meadows | 18 | 1,392 | 0.51 |
| Lakeshore Links | 18 | 2,444 | 0.37 |

Slope is rise/run, calculated from the surface normal. These are sampled maxima along the straight routes, not exhaustive maxima across the courses. Collider count equaled the sum of pine and deciduous instance counts for every course. Every generated tree's base elevation exactly equaled `height(tree.x, tree.z)`.

## Limits and remaining review

The after captures show an obvious uphill approach, asymmetric shoulder, and pale bank. Repeated stylized pine silhouettes and broad areas of simple color remain visible; the geometry revision does not establish Nintendo-level visual polish. The probes establish numerical and placement consistency, not that every hole is optimally balanced or reachable by every throw. Full visual, round-play, and six-viewport QA remain integration checks. Physical Android and iPhone frame rates are still owed.
