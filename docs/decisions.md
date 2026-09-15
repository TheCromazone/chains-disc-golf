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

## Round two — Wii / Switch Sports direction (2026-09-14–15)

### Character and face parts

- Studied the sibling `../ultimate frisbee game` Meshy clip extraction, deterministic appearance compiler, Blender prep and figure/appearance asset folders. Kept the architecture: body once, independent clip files, explicit LOD, reproducible appearance compiler. Original Blender geometry replaces the previous realistic golfer; no Nintendo geometry or texture is shipped.
- Body: 466,036 bytes / 10,800 triangles. LOD: 160,840 bytes / 3,230 triangles, below the sibling's 492 KB. Ten clip files (idle, practice swing, five throws, celebrate, slump, walk) are 10.9–16.3 KB each and contain zero meshes/materials/textures, improving on the sibling's placeholder-triangle clips. The eleven bone names are unchanged.
- Short body, round head, hair shells, tubular limbs and white gloves use a shared toon ramp. Five curved decal surfaces use a single deterministic 640px face atlas. Eye/brow/nose/mouth/glasses changes update UVs without mesh or material replacement. Full uses 10,466-byte KTX2; Lite draws the same paths locally. Corrected inverted KTX2 V coordinates and hair covering brows after criticism.
- Existing avatar storage remains additive. Legacy shades map to sport glasses. Procedural ten-action fallback remains available when models or the manifest are absent. Waiting players use the smaller body; the active player is promoted at turn boundaries.

### World

- Both quality settings use saturated toon greens, a gradient sky, soft clouds, chunky foliage and blob/contact shadows. PBR grass, HDRI, SSAO and bloom are retired from the default path. Retained prior source assets/rendering tools for provenance and optional future work.
- Criticism of a flat green plane led to scalloped fairways, contrasting first-cut collars, mowing bands, a lighter basket green, varied crowns and a visible yellow destination marker. A further losing comparison required real landforms: broad shared-height ridges/hollows, one-sided tee clearings and opposing tree groups. Course elevations and obstacle placement therefore changed deliberately; terrain rendering, normals, water levels and collision all use the same shared functions. `physics.js` and trajectory/message contracts remain unchanged. Fifty-four terrain drive probes stayed finite; full-hole integration is rerun for the revised course.
- Course cards now show actual in-engine toon flyovers rather than photographic hero art.

### Clubhouse, locker and HUD

- Fetched both specified 21st.dev component sources (Tahoe button and Liquid Glass Card); adapted layered highlights, translucent fills, blur and saturation to native CSS. Kept local SVG icons, hierarchy, native confirmation dialog, keyboard focus and reduced-motion handling. No React dependency or external font added.
- White/cyan glass and coral actions follow the sports-menu direction. A pale studio stage keeps the same live actor readable in the clubhouse and locker. Face editing moves the camera closer. Locker categories are keyboard-accessible tabs and visual part/swatch grids.
- After the HUD lost the comparison, reduced the top information to one strip and moved secondary throw/disc options behind two equipment selectors. A further critique led to one utilities menu, a 64px contextual swipe cue and a power gauge visible only while preparing/releasing a throw. The aim camera favors the landing area over blank sky. Selection, Escape, outside dismissal, touch mute, focus return and all six expanded-picker/utility viewport checks pass. Original control IDs remain available.

### Feedback and sound

- Added Chains!, Nice shot!, applause and a descending missed-basket reaction. Holed trajectories never play the miss reaction, even when they touch a rim/band first. Each missed throw gets at most one gallery reaction. Pre-unlock mute state and individual sample-load failures are handled correctly.
- Result moments hide inactive controls, enlarge the outcome and cut to a centered full-character reaction. The near-basket QA fixture runs the real throw simulation, events and playback; it is not an invented result overlay.
- ElevenLabs delivery is **blocked**: no `ELEVENLABS_API_KEY` or callable ElevenLabs connection was available. `tools/generate-sfx.py` contains all twelve requests, resumable source caching, 24 kHz mono output and measured −6 dBFS peak normalization. It updates `manifest.sfx` only after the full set succeeds. No recordings were fabricated or mislabeled; `sfx` remains empty. Synthesized fallback sounds remain active. The sine-fixture normalization test does not verify generated recordings or audible quality.

### Budget, review method and outstanding work

- Lite skips body/LOD/clip/decoder/Full-texture downloads. Disc stamps are 6,596–18,656 bytes each. Grass/water normal maps now reference 256px JPEGs. `.impeccable/`, local credentials and Python caches are ignored. Final startup accounting includes HTML, local assets and exposed CDN transfer timings in `19-browser-results.json`: Lite 625,562 encoded bytes / 635,462 transferred bytes; Full 1,664,520 encoded bytes / 1,678,920 transferred bytes.
- Builder and separate critics reviewed character, face, world, HUD, clubhouse, locker, feedback and sound. First/second criticisms triggered real revisions. Blind boards hide product labels but cannot hide recognizable characters; unequal aspect ratios and screen functions limit the experiment. A preparation frame is not valid proof of another game's inferior celebration. No universal Nintendo-beating claim is justified by these screenshots.
- Wii and Switch galleries and YouTube round footage were inspected; files and exact links are indexed under `docs/qa/references/`. Both Refero pages were inaccessible in this session, so their actual designs were not claimed as reviewed.
- Physics and asset checks pass. Integration exercises a real pointer swipe, a complete Full hole and both empty-assets quality paths. All six overlap viewports are rerun after layout changes. The prior online message contracts and storage keys remain unchanged.
- **Physical Android and iPhone frame rates are still owed.** Desktop Chromium screenshots and timing do not certify mobile GPU, touch latency or Safari behavior. Generated ElevenLabs recordings and a defensible all-pieces blind win are also still outstanding.
- Final lighting refinement adds a six-value terrain-normal ramp without extra textures/passes or collision changes. Final six-viewport overlap audit passes. The last independent world comparison still selects the reference; the additional lighting refinement does not justify claiming that the overall art target has been met. The HUD is provisionally preferred for phone readability, subject to mismatched reference aspect ratios.

## Round three — painted materials, authored throws and device evidence (2026-09-15)

### Preserved review pass

- Read and committed the inherited working tree first, as `c41d7a0`: detail-map slots, corrected procedural right-handed backhand/blade, ten throw presets, throwing-hand choice and waiting-player placement. Physics and asset tests passed before that commit.

### Painted materials

- Generated twelve separate original painted masters: fairway, rough, green, sand, bark, pine, deciduous, tee rubber, basket metal, water, jersey and skin. Ship neutral 256px JPEG detail maps (147,640 bytes total); retain 512px authoring masters and generation provenance. JPEG uses the existing shared texture loader and avoids adding a decoder to Lite.
- Terrain blends the four ground detail maps with the existing fairway/green/soil masks. Pines and deciduous crowns have separate maps; props and both character rigs use their named slots. Skin/jersey use bind-pose coordinates so their texture follows the actor. The toon ramp, palette, terrain geometry and collision functions are preserved. An empty manifest still produces the procedural world and golfer.
- Four independent texture reviews led to stronger readable marks, a regenerated fairway detail tile without doubled mowing stripes, and larger foliage clusters. The broad course mowing bands remain. The final critic still prefers Switch Sports; its biggest remaining gap is layered canopy volume and shaded overlap, which grayscale tile tuning cannot establish. No blind-win claim is made.
- The runtime check samples all twelve maps across Pine and Lake, checks loaded 256px images and shader bindings, and captures both quality settings plus the empty-manifest fallback. Lite remains below 2 MB including exposed CDN resource timings. Current evidence and the critic's limits are in `docs/qa/r3/`.

### Sound and physical devices

- The existing generator found no `ELEVENLABS_API_KEY` in its environment or nearest supported `.env` files. Per the round-three instruction, no API generation was attempted and synthesis remains unchanged. All twelve prompts are ready; `manifest.sfx` remains empty. There is no changed sound to show as a before/after recording.
- Device discovery found paired iPhone Bluetooth/audio endpoints, but no USB/browser-debug bridge, no Android device endpoint and no listening debug service. Those audio endpoints cannot measure Safari rendering. All four physical Android/iPhone Lite/Full FPS values remain explicitly null. No desktop timing was substituted.
- A separate fresh sound/device critic accepted the conditional audio skip and rejected any completion claim for physical performance. The unrun `device-benchmark.js` helper and a reproducible three-run procedure are ready for an attached device; neither is evidence of phone performance.
- Pruned 214 historical QA images/videos (43,971,015 bytes) from the working tree, retaining current-milestone evidence. Historical images remain recoverable at `d8d7b4b`; Git history was not rewritten. Temporary duplicate captures from this round are also removed after review.

### Authored throws

- Kept the verified body and LOD byte-for-byte. Blender now exports thirty mesh-free clips: all ten throws and five common actions, each in right- and left-handed versions. The eleven bone names are unchanged. Left-handed actors use positive scale, mirrored authored rotations and the `elL` disc socket, so jersey printing stays readable.
- `src/throw-poses.js` supplies the same poses to Lite and Blender. The phase contract stays 0–0.5 windup, exactly 0.62 release and 0.5–1 follow-through. Actual backhand, forehand, hammer, scoober and putt footage observations, plus blade/bank derivation limits, are recorded in `animation-authoring.md`; these are authored clips, not motion capture.
- The separate critic's first finding removed per-segment smoothstep stops at release. Monotone Hermite curves carry joint velocity through 0.62. Its next finding led to deeper knee loading, braced lead legs and lifted trailing feet. A shared vertical support correction keeps the lowest sole on the floor without moving the authoritative lie in X/Z. The critic accepted both fixes in phone-size RH/LH playback; it still prefers Switch Sports overall and identifies glove/torso silhouette overlap as further polish.
- `test/animation.test.mjs` verifies twenty distinct throw clips, 1,100 authored joint samples, positive transforms, continuous nonzero release velocity and 2,020 support samples. Runtime comparison checks both real rigs across every throw and hand. Added physics regressions for all ten throws at two powers in both hands; corrected left-handed overhand turnover by mirroring its roll rate with spin. Existing right-handed flight remains unchanged.

### Canopy follow-up to texture criticism

- Addressed the remaining canopy-volume finding with smaller overlapping deciduous masses, inset pine frond tiers and darker sheltered undersides on the existing toon materials. Tree placement, collision envelopes, playable terrain and downloadable assets remain unchanged. The new visual extents fit within the previous crowns.
- Kept Lite deciduous geometry at 576 triangles per crown and the same draw batches. Whole-scene instanced triangles decreased 5.5% in Lite and increased 3.3% in Full; these counts are not phone frame-rate measurements.
- A new independent critic prefers this revision to its before image but still selects Switch Sports. Its largest remaining gap is the repeated spherical-clump appearance versus a cohesive leafy mass. The requested reference-beating quality target remains unmet; reviewed improvements and remaining limits are preserved without inventing a win.

### Final verification

- All six viewports pass with all ten throw choices open, no clipped labels and no overlapping/offscreen controls. The final startup ledger is Lite 670,430 encoded / 681,230 transferred bytes, Full 2,110,000 / 2,131,300 bytes, including exposed CDN timings. Lite downloads no GLB or Basis decoder at startup.
- Final physics, exported-animation, support, asset, feedback, normalizer-fixture and Full/empty-assets integration checks pass. Real pointer input completes a Full hole. The largest measured Full/Lite joint-position difference is 0.0102 mm. No application/shader errors; screenshot-induced Chromium ReadPixels warnings remain visible in the raw evidence.
- Verified the body/LOD hashes and storage/network/UI modules are unchanged since the preserved review commit. The authored Blender source is saved with Blender compression (718,804 bytes); the source retains thirty actions and eleven bones. The final report explicitly retains the unmet reference-win target and four missing physical-device FPS measurements.
