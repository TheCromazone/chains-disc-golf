# Chains upgrade decisions

## Baseline — 2026-09-14

- Read README, the design spec, asset prompts, and every source module before changes.
- Physics test passes unchanged. Baseline diagnostic playthrough on Pine Hollow: You 2, Ricky 3, Paige 3. Manual swipe tested separately in the in-app browser; the completed diagnostic round used bot-assisted human throws. Background browser throttling required allowing up to one second of presentation time per frame; physics remained at 240 Hz.
- No Git repository or configured author existed. Initialized this folder and use repository-local `Codex <codex@local>` for milestone commits.
- Preserve Three.js 0.170, static ES modules, physics constants, online message shapes, and `chains.avatar` / `chains.course`.
- Requested frame rates require physical Android and iPhone hardware measurements. Desktop viewport emulation will be reported separately, never as device certification.
- Image prompt text and requested output dimensions come from `docs/codex-asset-prompts.md`. Sounds retain synthesis unless licensed recordings are actually obtained; image generation cannot produce recordings.
- Optional bot portraits are fictional game characters, not likeness claims about professional golfers.
- Identified baseline issues for later milestones: menu camera intersects tee sign; quality switch does not rebuild course; release follow-through stops when phase changes to flight.

## Milestone 1 — image assets

- Built-in image model generated 23 final images. Originals remain in Codex generated_images; source mapping is in docs/qa/image-sources.json.
- Exported prescribed dimensions and formats; all entries decode in browser with HTTP 200. Total image bytes: 5,310,746. No console errors or warnings on the manifest verification reload.
- Alpha retained on all four disc stamps and grass clump. Grass normal PNG uses indexed lossless PNG storage to meet the per-file budget.
- Before: docs/qa/00-baseline-play.png. After: docs/qa/01-assets-after.png and 01-cards-after.png.
- No gameplay source changed in this milestone; original physics, synthesis and fallback behavior retained.


## Milestone 2 — Blender assets

- Installed official portable Blender 4.5.9 after Windows Installer was busy. Vendor SHA256 verified. Sources: art/blender; reproducible generator: tools/build-models.py.
- Eight GLBs, Draco-compressed geometry; seven prop atlases use KTX2 UASTC with mipmaps. Three r170 GLTFLoader supports both codecs; browser reports all eight ready and compressed textures active, with no console errors.
- Golfer: 10,512 triangles including hidden variants, exactly eleven required bones, seven recolorable wardrobe slots plus facial details. Five throws preserve the original pose/phase contract; five additional idle/reaction clips are authored for milestone 4.
- Chains are modeled as individual interlocking links, combined into one render mesh to reduce draw calls. Props have Cycles-baked albedo, tangent normal and roughness maps. Grass uses ten tapered ribbon cards.
- Lite keeps procedural foliage. Optional model failures use procedural characters/props. Locker number, colors, build, hair, headwear and shades remain supported.
- Before: 01-assets-after.png. After: 02-models-after.png. Physics test passes unchanged.

## Milestone 3 — Full rendering

- Full dynamically imports EffectComposer, SSAO, gentle bloom, OutputPass and water reflection code. Lite bypasses postprocessing and keeps its original foliage, terrain subdivision, shadow size and pixel-ratio cap.
- Added generated dirt/sand albedo tiles (1024 square) because the original image brief only specified grass. Terrain blends path wear and pond-edge sand through vertex weights; grass normal strength is reduced in Full.
- Foliage sways in the vertex shader. A drifting procedural cloud sheet, golden meadow light-shaft meshes, and a projected disc contact shadow add depth. Shafts use depth-tested translucent geometry, not volumetric ray marching.
- Water uses 256px planar reflection targets, refreshed every third visible nearby render. Full lighting reduces ambient fill to preserve form.
- Graphics changes now rebuild the course and dispose the previous composer. Corrected the existing menu-camera/sign collision.
- Browser compiled Full on all three courses without errors; physics passes. Before: 02-models-after.png. After: 03-rendering-after.png. Device performance remains for milestone 6.

## Milestone 4 — animation and camera

- GLB AnimationMixer actions are authoritative when present, including all five throws, weight shift, fairway look, practice swing, celebration and slump. Procedural pose tables remain solely for empty-assets fallback.
- Idle transitions blend over 220 ms; windup remains directly scrubbed through phase 0–0.5. Follow-through now finishes after launch changes the game phase to flight (the previous loop stopped at release).
- Hole introductions orbit the basket then rise and travel back to the tee in 4.7 seconds. Result cameras frame the golfer; birdie or better triggers celebration and bogey or worse triggers slump.
- Chain contacts play at 28% presentation speed from 150 ms before to 400 ms after impact. Simulation samples, event times and online message shapes are unchanged.
- All five clips sampled at phases 0/.25/.5/.62/.8/1 with finite, distinct bone rotations. Runtime throw finishes follow-through; no console errors. Physics passes. Before: 03-rendering-after.png. After: 04-intro-after.png.

## Milestone 5 — Unity offline art

- Unity 6000.6.0f1 batch renderer completed three 1280×960 JPEG course views and three 1024×512 half-float EXR HDR panoramas. Full loads the selected panorama and builds a PMREM reflection environment; Lite keeps the analytic sky.
- Course geometry input is sampled from the actual web height field, tree colliders, ponds and hole positions. Unity uses inexpensive stand-in trees for the offline overview; generated hero art remains the menu default. Engine renders are available in manifest.renders.
- Reproducible Unity editor source and sampled layout are in art/unity. Generated Library, temporary scenes and editor caches are excluded from Git and deployment. No Unity player or WebGL build is shipped.
- Browser verified a 1024-wide half-float HDR background with reflection environment and no errors. Unity batch returned success (docs/qa/unity-render.log).
- Before: 03-rendering-after.png. After: 05-unity-sky-after.png. Render outputs are assets/courses/*_unity.jpg and assets/skies/*.exr.

## Milestone 6 — budget, polish and QA

- Initial encoded transfer measured 4.55 MB Lite and 4.82 MB with Full, including Three/PeerJS/addons and codec downloads. All 39 manifest entries return 200 and images decode; asset structural and physics tests pass.
- Partitioned foliage into 64 m spatial groups with distance/frustum culling. Physics collider placement and terrain heights are unchanged. Added bounded resolution scaling for sustained slow frames; Lite retains its original upper pixel-ratio and shadow budgets.
- Fixed disc/marker/hero resource disposal, serialized course changes, disposed planar reflection targets, and explicitly freed the noise texture/material omitted by Three r170 SSAOPass.dispose. Repeated Full rebuilds stabilize after warmup.
- Matched wind in the SSAO normal and shadow passes. Water skips reflection work during override-material passes. Reduced the apparent grass tile size and gave the menu a matte surface with clearer text.
- Corrected landscape panel children shrinking and clipping labels. Enhanced the supplied overlap audit with ancestor clipping, vertical label overflow checks and scroll-bottom coverage. All six requested viewports pass.
- A complete post-upgrade Pine hole finishes (You 4, Ricky 3, Paige 2). Diagnostic human throws use bot planning and faster presentation; a separate real 98% swipe works and advances through bot turns. PeerJS host/guest transports all five message types bidirectionally. A separate empty-assets copy boots and simulates in both qualities (one expected missing-manifest 404).
- Desktop 430×932 samples on RTX 5090 average 173–180 fps, but these do not certify Android/iPhone performance. Physical-device 60/45 fps targets remain unverified and are explicitly listed in README and QA report.
- Before/after and machine-readable results are indexed in docs/qa/REPORT.md. README now covers graphics, budgets, fallback, authoring tools and minimal static deployment.

## UI refinement — clubhouse and field equipment

- Replaced the accumulated inline glass/matte overrides with `src/ui.css`: deep forest surfaces, warm ivory typography and gold primary actions. The main action now reads “Play round,” with its bot mode underneath. Course cards use panoramic artwork with a dark text scrim. Existing mode IDs and click paths remain intact.
- Added one local currentColor SVG icon set for menus, throws, sound and navigation. No icon font, external font or UI framework is loaded. Local encoded transfers measured 22,340 bytes for CSS and 2,089 bytes for icons; the art manifest is unchanged.
- Applied 150 ms press feedback, scale 0.96, concentric panel/button radii, persistent selected cues, visible keyboard focus and reduced-motion overrides. Removed backdrop filtering from live UI surfaces. Sound uses two crossfading icons and an accessible changing label.
- Throw/disc controls now set native disabled states during flight; segmented choices and swatches expose aria-pressed. Settings groups use labelled groups rather than labels containing multiple buttons. The locker room retains every existing option and storage key.
- Replaced browser confirm/alert UI with a native HTML dialog styled as part of the game and inline room errors. The leave dialog defaults to Keep playing, restores focus, and accepts an explicit Leave round action. Connection buttons preserve icons, expose busy state and disable during their own requests. Online payload shapes remain unchanged.
- Six viewport audits pass, including panel scroll bottoms and the new leave dialog. A real 66% backhand swipe advances through bots to the next human turn; selected and disabled states work. Physics and asset tests pass. No Chromium console warnings/errors or failed resources in final diagnostics. Physical mobile performance and slowed Animations-panel replay were not verified in this UI pass.
- Before/after and detailed verification: `docs/qa/07-ui-report.md`.
