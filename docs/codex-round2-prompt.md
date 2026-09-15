# Round two for Codex (GPT-6 Astra) — Wii Sports direction

Paste everything between the rules into a Codex session opened in this folder. It follows the first handoff (`docs/codex-handoff-prompt.md`) and Codex's own reports in `docs/qa/` and `docs/decisions.md`.

---

You are continuing Chains, the disc golf game in this folder. Your first pass (commits 1f31acd through c98e36e) is verified: assets load, the Blender golfer plays a hole in Full, six viewports pass the overlap audit, no console errors. Keep all of that infrastructure. The art direction changes now.

**Direction.** The game should look and feel like Wii Sports, with the polish of Nintendo Switch Sports golf. Get the real thing first: pull the Wii Sports and Switch Sports golf galleries at https://miiwiki.org/wiki/Wii_Sports/gallery and https://miiwiki.org/wiki/Nintendo_Switch_Sports/gallery plus round footage on YouTube, and put our screenshots next to them blind at phone size. Characters are Mii-style: large round heads on short simple bodies, faces built from flat decal parts (eyes, brows, nose, mouth, glasses) chosen in the locker room, simple hair shells, floating gloved hands or short tube arms, no realistic muscle or cloth. The world is bright and clean: saturated greens, a gradient sky with soft cartoon clouds, chunky readable props, soft blob shadows, a toon ramp instead of PBR. Retire the photoreal grass, HDRI skies, SSAO and bloom from the default look; keep them only if a critic picks them blind, which they will not. Feedback is cheerful and loud: "Nice shot!", "Chains!", a jingle on a birdie, applause from an unseen gallery, a slow "Ohh…" on a miss.

**Player model pipeline.** Match the rigor of the sibling project at `../ultimate frisbee game`, then beat it. Study `tools/clip-from-meshy.mjs`, `tools/build-appearance.mjs`, `tools/blender/athlete-prep.py`, `public/assets/figures/` (one body GLB, one small GLB per animation clip, a 492 KB LOD) and `public/assets/appearance/` (kit atlases compiled from fabric microtexture with deterministic palette, number and crest compositing). Build the Mii golfer the same way: one body, separate clip files for idle, practice swing, backhand, forehand, tomahawk, scoober, putt, celebrate, slump, walk; a LOD for distant players; KTX2 textures; a face-part atlas so every locker-room choice is a decal swap, not a mesh swap. Bones keep our eleven names. The procedural golfer stays as the fallback.

**UI.** The clubhouse must feel premium and not "vibe coded". Two fetchable bars: the Apple Tahoe Liquid Glass Button and Liquid Glass Card on 21st.dev (https://21st.dev/@jahed/components/apple-tahoe-liquid-glass-button and https://21st.dev/@designali-in/components/liquid-glass-card) for surface quality, and Switch Sports' own menus for layout, type and colour. Restore translucent blurred glass on every panel and button (the current `src/ui.css` has none), keep the icon set, hierarchy, dialog and accessibility work from your UI pass, and make the locker room read like a Mii creator: big live preview, part categories as tabs, swatch grids, see https://refero.design/screens/db9db4b0-a790-401a-a581-feafc1780cfd and https://refero.design/screens/5ff8fe29-b0a0-4aed-8b3c-0e2667715076. No emoji, no default-looking pills.

**Sound.** The manifest still has no recordings. Generate a full set with the ElevenLabs sound-effects API (chains hit at three speeds, band, tray, tree, grass landing, splash, whoosh, applause, "ohh", birdie jingle), normalise to −6 dBFS, list them under `sfx`.

**Budget.** Lite must start under 2 MB: lazy-load models and Full-only textures by quality, convert `grass_normal.png` and `water_normal.png` to KTX2 or small JPEGs, bring each disc stamp under 60 KB, add `.impeccable/` to `.gitignore`.

**Method.** Break the work into pieces that can be judged alone: character, face parts, world look, HUD, clubhouse, locker room, feedback moments, sound. For each, run a builder and a separate harsh critic with fresh context; the critic puts ours next to the Wii or Switch Sports reference blind and names the single biggest gap. Loop until ours wins. Keep the physics test green, the storage keys, the online message shapes and the empty-assets fallback. Commit per piece with before/after screenshots in `docs/qa/`, rerun `docs/qa/overlap-audit.js` at all six viewports, and note that physical Android and iPhone frame rates are still owed.

Ask nothing; record decisions in `docs/decisions.md`.

---
