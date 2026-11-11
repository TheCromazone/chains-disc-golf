# Chains graphics and reliability pass — 2026-11-11

The existing wooded tournament venue now has generated, worn synthetic turf and weathered timber in its playable tee mats, framing and furniture. A fine dashed tee limit helps orient the throwing end. Desktop players see keyboard aiming/charging controls during their own aim state; touch controls retain their swipe instructions. Mechanics, lighting, course layouts, athlete assets and multiplayer protocols are preserved.

## Concrete fixes

- Course teardown skipped `InstancedMesh.dispose()`, leaving its instance buffers registered with Three's renderer. The production regression observes exactly one dispose event for each of 143 old instanced meshes on course replacement.
- Texture caching used only the URL, so callers requesting a different color space, wrap mode, flip direction or repeat silently got the first configuration. Texture and washed-texture caches now include their effective options. A failing regression was observed with the old cache identity and passes after restoration of the fix.
- A pre-push fetch revealed the original local checkout was 312 commits behind GitHub. The pass was rebased onto `eca3c8c` (current `origin/master`); upstream fixes for the absent panorama and duplicate `AIM` property were retained. Production browser verification switches Pine Hollow → Cedar Meadows → Pine Hollow successfully.

## Generated assets and integration

Built-in GPT image generation was used; no separate API key, purchased credits or alternate paid provider. The selected originals, exact prompts, generation output IDs and compression commands are in [the material source record](../art/generated/tee-materials/README.md) and [prompts.json](../art/generated/tee-materials/prompts.json).

- [Turf runtime texture](../assets/textures/course/tee-turf-v1.webp): 512 × 1600, 325,310 bytes.
- [Timber runtime texture](../assets/textures/course/weathered-timber-v1.webp): 1024 × 256, 79,972 bytes.
- `assets/manifest.json` → `atlas` supplies CPU images to `src/props.js`. The images repaint the existing 2048² Desktop / 1024² Mobile prop atlas. There are no added GPU textures, meshes, materials, shader samplers or draw calls for this art. Images are loaded once; optional failures retain the original procedural painters. Disposed atlases ignore late image/font completion.

## Verification

- `npm run build`: production bundle and static assets built successfully, no warnings.
- `npm test`: all 16 test files pass, including physics, bot planning, assets, animation, throws, protocol, feedback, temporal rendering and the new texture-cache regression.
- `node tools/verify-polish.mjs --url http://localhost:8189`: 16 assertions pass against `node serve.mjs --dist`. Real CDP keyboard/touch input checks aiming, Escape cancellation, charge/release, flight and return to the next lie, a holed short putt, scorecard next-hole progression, new-round reset, touch OS cancellation, portrait/landscape controls, asset decode, equipment/error hint states, instance-buffer disposal and zero console/runtime errors. Short-putt setup places the player at a controlled 0.8 m lie; the putt is released through real keyboard events and real physics.
- `node tools/verify-rounds.mjs --url http://localhost:8189 --courses pine --holes 3 --quality low`: all three bot-driven seats complete all three Pine Hollow holes through the real turn/flight/scoring loop, with no browser errors. [Round log](polish-2026-11-11/round-test.txt) records scores and duration. Chrome was launched with Metal GPU flags through the existing `CHROME` override.
- The director's canvas inspector (`tools/inspect-polish.mjs`) was run through isolated Playwright dependencies (no package changes), using real injected `active-play` setup/acknowledgment and a simulation freeze while rendering continued. It used installed Chrome with Metal; both captures report hardware rendering and no errors. [Current-run manifest](evidence.json) passes `check_evidence.py` for both captures and all required assets/motion.
- A focused independent code/visual review found a keyboard-hint state regression during implementation. It was fixed before the passing production run: equipment selection, `.idle`, `.bad`, windup and spectator states restore/suppress the appropriate hint.

## Captures and motion

| State | Evidence |
| --- | --- |
| Original desktop tee, same default player | [Before](polish-2026-11-11/baseline-desktop.jpg) |
| Original native Mobile tier | [Before](polish-2026-11-11/baseline-mobile.jpg) |
| Final desktop active play | [Screenshot](polish-2026-11-11/desktop-inspected.png), [inspector JSON](polish-2026-11-11/desktop-inspected.json) |
| Final Mobile active play | [Screenshot](polish-2026-11-11/mobile-inspected.png), [inspector JSON](polish-2026-11-11/mobile-inspected.json) |
| Desktop throw resolves to next lie | [Screenshot](polish-2026-11-11/desktop-next-lie.png) |
| Scored putt | [Scorecard](polish-2026-11-11/desktop-score.png) |
| Mobile throw resolves / rotation | [Next lie](polish-2026-11-11/mobile-next-lie.png), [landscape](polish-2026-11-11/mobile-landscape.png) |
| Unpaused keyboard windup → release → flight | [9.85 s WebM](polish-2026-11-11/desktop-throw.webm) |
| Assertions and per-state render counts | [Verification JSON](polish-2026-11-11/verification.json) |

The motion clip was inspected at the coil/release and chase phases: the athlete carries the existing throwing animation into a visible flying disc; the camera follows the trajectory. No rig or animation changes are claimed. The native-tier `baseline-*` captures use archived `origin/master` source at `eca3c8c`; final inspected captures include this pass. They use the same default player and course. Dynamic sun flecks, wind and camera settling mean these are review baselines, not exact pixel-diff golden images.

## Render evidence and limits

Counters aggregate the complete rendered frame, including shadow and post passes; reading Three's default reset counters after postprocessing would report only the last fullscreen triangle.

| Active tee | Desktop, 1440 × 900 | Mobile emulation, 390 × 844 |
| --- | --- | --- |
| Draw calls | 126 | 82 |
| Triangles across passes | 2,223,651 | 796,868 |
| Geometries | 65 | 56 |
| GPU textures | 52 | 44 |
| Color entropy | 6.97 bits | 7.18 bits |
| Edge density | 0.594 | 0.667 |
| Luminance p95−p5 | 142.3 | 183.2 |
| Dominant color share | 0.031 | 0.035 |
| Recorded frame interval at capture | 25.7 ms | 16.7 ms |

GPU: ANGLE Metal / Apple M6. These are headless Mac measurements, with other verification processes running; frame intervals do not establish physical phone FPS or a before/after speedup. The game's adaptive resolution remains enabled. The existing forest and shadow passes exceed the skill's advisory 750k/300k triangle targets; Mobile also exceeds its 40-texture starting target by four. This pass deliberately preserves that authored world and adds zero triangles/draws/GPU textures. These overruns remain a device-performance risk. Safari, physical phones and multiplayer networking were not re-certified by this focused pass.

## Visual scorecard

Genre equivalents: hero = athlete/disc; obstacles = wooded corridors, water and tournament arch; rewards/interactables = basket, target and landing guidance. Scores reflect the supplied 1/2/3 anchors, inspected real gameplay, and the measured inspector metrics; unchanged systems retain their score.

| Category | Before | After | Evidence |
| --- | --- | --- | --- |
| Art direction | 2.5 | 2.5 | Coherent woodland tournament venue and broadcast HUD preserved |
| Hero/player | 2 | 2 | Existing authored athlete, grip and foil-stamped disc |
| Obstacles | 2.5 | 2.5 | Layered trunks, authored arch, clear fairway constraints |
| Rewards/interactables | 2.5 | 2.5 | Basket, distance and landing estimates remain legible |
| World/environment | 2.5 | 2.5 | Foreground turf, tournament props and layered woods |
| Materials/textures | 2 | 2.5 | Fine curled tee fibres and silvered timber grain replace simpler procedural surfaces |
| Lighting/render | 2.5 | 2.5 | Existing sunlight/contact shadow/aerial depth preserved; contrast measured |
| VFX/motion | 2 | 2 | Existing release, flight, contact/score feedback; unpaused capture inspected |
| UI/HUD | 2 | 2.5 | Keyboard guidance discoverable, with touch and equipment/state gates verified |
| Performance evidence | 2 | 2 | Existing QA extended with full-frame counts, hardware-rendered inspection and explicit budget overruns |

After average: 2.35/3. The code and bitmap work is a focused improvement to an already detailed game; it is not a new hero, lighting system or animation overhaul. The render overruns above are retained limitations, not a performance optimization claim.

## Reproduce inspection

With the Three.js QA skill installed, the optional inspector runner can use an isolated dependency directory:

```sh
npm install --prefix /tmp/chains-inspector --no-audit --no-fund @playwright/test pngjs
# In one terminal, after npm run build:
PORT=8189 node serve.mjs --dist
# In another terminal, from this repo:
node tools/verify-polish.mjs --url http://localhost:8189
CHAINS_QA_DEPS=/tmp/chains-inspector node tools/inspect-polish.mjs
```

`CHAINS_CANVAS_INSPECTOR` can point to a differently installed `inspect-threejs-canvas.mjs`. `CHROME` overrides the installed browser path. The injected state hooks belong to the inspection context only; they are not shipped in the production game.
