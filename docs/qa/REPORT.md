# Chains upgrade QA — 2026-09-14

## Outcome

The static Three.js game loads the new art, completes a hole against bots and retains procedural fallback. Physics constants, storage keys and online message shapes are unchanged. Six milestones have separate commits and visual evidence.

**Physical Android and iPhone 12 frame-rate certification is still outstanding.** This workstation has an RTX 5090. Viewport emulation tests layout and Chromium behavior, not mobile GPU, thermal behavior, Safari or touch latency on those devices.

## Checks

| Check | Result |
|---|---|
| `node test/physics.test.mjs` | Pass; physics source unchanged from baseline |
| `node test/assets.test.mjs` | Pass; eight Draco GLBs, seven KTX2 PBR atlases |
| Golfer | 10,512 triangles, eleven exact bones, seven wardrobe material slots, ten clips |
| Five throw clips | Finite, distinct joint rotations at 0/.25/.5/.62/.8/1; one-second normalized clips |
| Asset requests | All 39 manifest entries HTTP 200; all image entries decode |
| Console, normal build | No errors or warnings after Full course/quality changes |
| Complete hole | Pine Hollow: You 4, Ricky 3, Paige 2; all players finish, scorecard appears |
| Manual gesture | Real rightward pointer drag produces a 98% backhand; bots play and human gets next turn |
| PeerJS | Host and guest connect; lobby/start/throw/next/botify and a return throw arrive |
| Empty assets | Separate copy with no asset files boots in Lite and Full; procedural throw produces 85 trajectory samples |
| Repeated Full rebuilds | GPU textures stabilize at 60 after warmup; geometries fluctuate 27–28 with visible passes |

The automated full-hole check used bot planning for human throws and accelerated presentation (`maxDt=1`) to avoid background-tab delays. The flight simulation and scoring were not accelerated or modified. The independent manual swipe used normal timing. The empty-assets test has one expected network 404 for the absent optional manifest, with no JavaScript failure.

## Layout audit

All requested sizes pass with zero button overlaps, unintended offscreen controls or vertically clipped button labels:

- 360×740
- 430×932
- 812×375
- 568×320
- 768×1024
- 1366×768

The audit covers hub, course picker, locker, setup, online, help, HUD and scorecard, plus the bottoms of scrolling panels. The original audit passed a squeezed landscape panel despite clipped text. The final script accounts for ancestor clipping and detects vertical label overflow; the panel now scrolls without shrinking its children. Full results: [overlap-results.json](overlap-results.json).

To repeat, load the game, then execute `docs/qa/overlap-audit.js` as an async console snippet from the hub at each viewport. It starts a diagnostic round. Reload afterward.

## Payload and performance

| Measurement | Lite | Full |
|---|---:|---:|
| Startup encoded response bytes, including CDN dependencies | 4.55 MB | 4.82 MB |
| Desktop mean frame rate, three courses, 430×932 | 174–175 fps | 173–180 fps |
| Desktop 95th percentile frame interval | 6.1–6.2 ms | 6.1–6.5 ms |
| Physical-device target | 60 fps | 45 fps |

Frame timing samples use 90 requestAnimationFrame intervals per case after warmup in Chromium on RTX 5090. These are brief menu-scene measurements, not a sustained mobile gameplay benchmark. Full renders roughly 1.1–3.9 million triangles across all passes in these views; device profiling may require lowering its foliage/reflection budget further. Resolution scaling is bounded and ignores long paused/background frames.

Payload figures use the browser's encoded response sizes; every resource reported a nonzero size. Full is measured after enabling it from a Lite load, so it includes both paths' startup requests. All manifest assets together total 8,267,082 bytes; unselected art and skies are not fetched during normal startup. Details: [budget-results.json](budget-results.json), [asset-audit.json](asset-audit.json), [memory-results.json](memory-results.json).

## Milestone evidence

| Milestone | Before | After |
|---|---|---|
| 1. Generated images | [Baseline play](00-baseline-play.png) | [Asset hub](01-assets-after.png), [cards](01-cards-after.png) |
| 2. Blender models | [Asset hub](01-assets-after.png) | [Models](02-models-after.png) |
| 3. Full rendering | [Models](02-models-after.png) | [Effects](03-rendering-after.png) |
| 4. Animation/camera | [Effects](03-rendering-after.png) | [Hole introduction](04-intro-after.png) |
| 5. Unity HDR skies | [Effects](03-rendering-after.png) | [Sky integration](05-unity-sky-after.png) |
| 6. Budget/UI/QA | [Sky integration](05-unity-sky-after.png) | [Final Full](06-full-pine.jpg), [small landscape](06-hub-568x320.jpg), [round result](06-round-complete.jpg) |

Additional screenshots: `06-hub-<width>x<height>.jpg`, [manual swipe](06-manual-swipe.png), [empty assets](06-empty-assets.jpg). Early milestone images intentionally show the state at that commit, before the final lighting and UI polish.

## Reproducible art

- Built-in image model: 23 requested images plus dirt/sand tiles for terrain splatting. Original generation paths: [image-sources.json](image-sources.json).
- Blender 4.5.9: editable sources in `art/blender`, generator in `tools/build-models.py`, baked texture maps beside the GLBs.
- KTX-Software 4.4.2: UASTC mipmaps with Zstandard supercompression; Draco buffer data preserved.
- Unity 6000.6.0f1: three course JPEGs and three half-float HDR EXRs; [batch render log](unity-render.log). Unity is used only offline.

The generated course-selection art remains the menu default. Unity course renders use stand-in vegetation and are supplied as secondary art; the exported Unity HDR panoramas drive Full lighting/backgrounds.
