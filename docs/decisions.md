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
