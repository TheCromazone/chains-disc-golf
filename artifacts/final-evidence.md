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

## Wave two — static culling and keyboard usability

Follow-up baseline: clean PR head `285d845`, after fetching and confirming `origin/master` remained `eca3c8c`. New implementation commits: `c020405` (static culling) and `5a5f054` (keyboard usability). All existing forest, tournament, athlete and generated turf/timber work remains integrated.

### Changes and measured tradeoff

`src/static-chunks.js` partitions large immutable terrain, ground-contact shading and course furniture into 128 m cells. It preserves every triangle exactly once, including winding, original normals, UVs, colors and custom attributes. Materials, transforms, custom shadow materials, render callbacks and shadow flags remain shared/preserved. Half-metre padded bounds cover current cloth sway; view and shadow cameras use native frustum culling. The physics height function and terrain sample grid are unchanged. Flat furniture mesh lists preserve camera raycasts. Small/grouped, instanced, skinned, morphing, interleaved and partial-range geometry is left intact. UUID allocation uses a scoped stream so it does not shift unrelated game randomness. Course teardown owns the replacement geometries.

The 64 m prototype saved somewhat more triangles but raised the Mobile tee to 139 draws. The selected 128 m cells keep most of the saving at 101 draws. No trees, blades, props, light sources, texture maps or materials were removed or reduced in detail.

Baseline/final production profiles use Pine Hollow, the default avatar, the tee and a controlled 6.5 m putt, fixed DPR 1, Desktop 1440×900 and native Mobile 390×844. Each frame aggregates the scene, both shadow maps and postprocessing. Camera coordinates match exactly in all four recorded comparison pairs.

| Matched state | Before triangles | Final triangles | Reduction | Draw calls before → final |
| --- | ---: | ---: | ---: | ---: |
| Mobile tee | 796,868 | 642,584 | 19.4% | 82 → 101 |
| Mobile putt | 1,165,912 | 964,073 | 17.3% | 100 → 109 |
| Desktop tee | 2,223,651 | 1,932,832 | 13.1% | 126 → 160 |
| Desktop putt | 2,455,363 | 2,076,541 | 15.4% | 124 → 141 |

This is reduced submitted geometry, **not a claim of 19% faster frame rate**. More draws and geometry buffers are the deliberate cost. Fresh inspector contexts report 87/92 Mobile geometries at tee/putt and 113/117 Desktop geometries; Mobile textures remain 44/46, Desktop 52/54. The profiling parity check temporarily renders all chunks and therefore uploads extra normally unseen buffers; use the separate inspector reports for normal-view memory counts. Physical phones, Safari and low-end CPU/GPU frame times remain unverified. Existing triangle overruns and Mobile texture overruns remain; the largest residual geometry costs include the blade carpet and near-tree/shadow sets. No texture-budget compliance claim is made.

### Concrete usability fixes

- Clicking mute left its button focused, causing `input.js` to ignore Space/WASD until another click. Pointer activation now releases focus; keyboard activation retains focus and works as an accessible button.
- Tools arrow navigation included hidden Fullscreen and disabled buttons. It now traverses only rendered, visible, enabled items, so Overview → Menu works when Fullscreen is unavailable.

These were reproduced through real Chrome input before the fixes, then independently verified after implementation.

### Wave-two validation

- Production build passes with no warnings. All **17** Node test files pass: **one new file**, with triangle/attribute/winding invariants, shadow-material/callback preservation, disposal, terrain seam raycasts, unsupported-range fallback, RNG isolation and frustum exclusion. A shadow-material preservation assertion caught a defect during development and passed after correction.
- Production browser suite passes **21** checks: the original 16 plus **five new checks** for pointer mute focus, immediate keyboard charging, accessible keyboard mute, hidden Fullscreen navigation and disabled action navigation. It also exercises real keyboard/touch throws, cancellation, scoring, hole advancement, restart, course switching, instance disposal, portrait/landscape layout and zero runtime/console errors. [Log](wave-two/browser-checks.txt), [structured results](wave-two/playtest/verification.json), [unit log](wave-two/unit-tests.txt).
- The existing aim-camera suite passes its obstructed-lie case and **1,242 lies across all four courses**, with no page errors. [Camera log](wave-two/aim-camera-checks.txt).
- Four independent hardware-rendered inspector captures pass (Desktop/Mobile × tee/putt), with zero browser errors. [Separate current-run manifest](wave-two/evidence.json) passes the director's checker for all seven declared artifacts.
- Four **raw scene culling parity checks** compare GPU readbacks in the same frozen state, including both shadow maps, with static culling disabled and enabled. Every state records **zero changed channels**. This checks the culling decision, not pixel identity between separately timed before/after screenshots or postprocessing histories. [Baseline profile](wave-two/before-profile.json), [final profile and parity results](wave-two/final-profile.json).
- Independent rendering review found no actionable defect in attribute preservation, bounds, raycasting, lifetime or shadows. Desktop/Mobile tee and putt captures were visually inspected; the target, detailed woods, turf and contact shadows remain readable. The unpaused 9.96 s [throw motion](wave-two/playtest/desktop-throw.webm) was inspected through flight and ground contact, with no missing terrain/props observed.

Wave-one build/input/round evidence remains historical evidence for that revision. Wave two does not repeat multiplayer recertification or claim a fresh full three-player round; affected real-input progression/restart and all-course camera checks ran on this implementation. No new external artwork/service or production deployment was needed.

### Representative before/after captures

| View | Before | Final |
| --- | --- | --- |
| Mobile tee | [Before](wave-two/before-mobile-tee.png) | [Final](wave-two/final-mobile-tee.png) |
| Mobile putt | [Before](wave-two/before-mobile-putt.png) | [Final](wave-two/final-mobile-putt.png) |
| Desktop tee | [Before](wave-two/before-desktop-tee.png) | [Final](wave-two/final-desktop-tee.png) |
| Desktop putt | [Before](wave-two/before-desktop-putt.png) | [Final](wave-two/final-desktop-putt.png) |

The visible comparison deliberately retains the authored scene. Grass/wind and idle timing vary between separate captures. The original visual scorecard is retained; this follow-up improves submission cost and control reliability without claiming a new art overhaul.

### Reproduce wave-two checks

Start a production server on a separate port after `npm run build`, then:

```sh
PORT=8289 node serve.mjs --dist
# Separate terminal:
node tools/profile-course.mjs --label final --url http://localhost:8289
node tools/verify-polish.mjs --url http://localhost:8289 --out artifacts/wave-two/playtest --debug-port 9478
node tools/verify-aimcam.mjs --url http://localhost:8289
CHAINS_QA_DEPS=/tmp/chains-inspector node tools/inspect-polish.mjs --url http://localhost:8289 --out artifacts/wave-two/inspection --run-id wave-two-final --states active-play,putt
python3 ~/.agents/skills/threejs-game-director/scripts/check_evidence.py . --manifest artifacts/wave-two/evidence.json
```

To establish a new before measurement, run `profile-course.mjs --label before` on the baseline revision before making changes. Keep hardware, viewport, fixed DPR, course/avatar and pose setup constant. `--out` and `--debug-port` isolate profiling runs. Original wave-one inspection defaults are preserved.
