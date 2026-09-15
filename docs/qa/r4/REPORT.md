# Round four — canopy volume

**The canopy gauntlet is closed.** After seven builds, the independent critic accepts the original cohesive-volume defect as resolved in both close portrait and wider tee/flyover views. The reference still wins overall. Its single largest remaining gap is **ground light-and-shadow structure**, outside this round; terrain and lighting were therefore left unchanged. [Final critique](critic-v7.md).

## Shipped

- Three Blender-authored variants per species. Each crown has a continuous outer volume and overlapping interior shells: **528 triangles per pine, 576 per deciduous tree**, in both qualities.
- Real per-vertex occlusion: 64 surface-hemisphere rays plus 64 sky rays. The main deciduous shell's bake is filtered to avoid narrow self-shadow stripes; tucked interiors retain their unfiltered occlusion. Blender-authored normals carry light across the whole crown. The existing toon ramp, painted tiles and color palette remain.
- The source retains dense authoring surfaces and reduced runtime meshes. Geometry data is **49,305 bytes**, with a **1,597-byte** decoder. Embedded geometry works with an empty asset manifest and needs no GLB loader or texture request.
- Tree placement, collision radii, wind deformation and the **64 m spatial grid** remain unchanged. The three deciduous variants add batches within that existing grid.

The inherited FPS overlay was committed first, unchanged, as **`c15b0ee`**. Rebuild the crowns with `blender --background --python tools/author-canopies.py`. [Source metadata](../../../art/blender/canopies-r4.json).

## Evidence

| View | Before | Final |
|---|---|---|
| Full portrait tee | [Before](before-high-tee.png) | [After](v7-high-tee.png) |
| Lite portrait tee | [Before](before-low-tee.png) | [After](v7-low-tee.png) |
| Full flyover | [Before](before-high-flyover.png) | [After](v7-high-flyover.png) |
| Lite flyover | [Before](before-low-flyover.png) | [After](v7-low-flyover.png) |

[Portrait comparison](v7-portrait-board.html), [wide comparison](v7-board.html), [reference provenance and camera limits](references.md).

The review did not accept a wider camera as proof of improvement: a provisional v3 pass was withdrawn on the closer portrait check. A later isolated-instance diagnostic corrected the critic's attribution of one whole neighboring tree as an attached lobe. The loop continued on contour detail and whole-profile curvature. [Corrected diagnosis](critic-v4.md), [v6 profile finding](critic-v6.md), [final finding](critic-v7.md). Intermediate boards remain; 64 redundant full-size captures and embedded-image HTML exports totaling **24.4 MB** were discarded before commit. [Pruning record](pruned-intermediate-captures.json).

## Verification

- Physics: all ten throws, both hands and two powers pass unchanged.
- Animation: twenty throw clips, 1,100 joint samples, exact 0.62 release, continuous release motion and 2,020 support samples pass.
- Geometry: six variants, eighteen closed manifold shells, valid winding, bounded radii, finite authored normals and spatially varying AO pass. Total library: **3,312 triangles**.
- Runtime: all three courses, both qualities and populated/empty manifests pass. Six variants render with the existing wind shaders, finite attributes and no instance group crossing a 64 m cell. No application or shader errors. [Runtime results](runtime.json).
- All six viewports pass `docs/qa/overlap-audit.js`, including the **open ten-entry throw sheet**: 360×740, 430×932, 812×375, 568×320, 768×1024, 1366×768. Chromium's screenshot-related ReadPixels warnings are retained in the raw report; no application errors occurred. [Audit](after-browser-results.json).
- Terrain vertex positions and all **3,154 collision records** match the baseline. Physics, motion, UI, network, materials, model loading, manifest and the committed FPS overlay are byte-equivalent to `c15b0ee` after line-ending normalization. [Contract checks](contracts.json).

### Budget and rendering counts

**Lite: 720,033 encoded bytes / 731,433 transferred bytes**, including exposed local/CDN timings. This is 49.6 KB more encoded data than round three and stays within the unchanged **2 MB startup budget**. Lite requests no models at startup. Full: 2,159,603 encoded / 2,181,503 transferred bytes.

| Pine Hollow metric | Before | Final |
|---|---:|---:|
| Whole-course instanced triangles, Lite | 1,929,716 | 1,911,104 |
| Whole-course instanced triangles, Full | 3,776,372 | 1,911,104 |
| Whole-course instance batches | 263 | 332 |
| Portrait tee rendered calls, Lite / Full | 113 / 92 | 121 / 100 |
| Portrait tee rendered triangles, Lite / Full | 837,134 / 1,110,242 | 831,914 / 822,782 |

These counts expose the tradeoff from three deciduous variants: fewer total triangles, more batches. They are **not physical-device frame-rate measurements**.

## Physical phones — waiting for readings

No Android or iPhone values were supplied during this round. All four values remain null in [the device record](../r3/sound-device-detection.json), and the README says Pending. The user will read `?fps=1` on Pine Hollow hole one in Lite and Full. Any reported result below **55 FPS Lite** or **40 FPS Full** triggers work on that phone's resolution scaler/foliage bottleneck. No desktop numbers substitute for those readings, and no speculative device optimization was made.
