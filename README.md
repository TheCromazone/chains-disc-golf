# Chains — mobile 3D disc golf

Swipe-to-throw disc golf in the browser. Aim by dragging the view, pick a disc and a throw type, then swipe in the throw pad: the swipe direction must match the throw (backhand →, forehand ←, tomahawk ↓, scoober ↖, putt ↑), the swipe length sets the power bar, and a slightly lower or higher swipe adds hyzer or anhyzer. Discs fly with a real turn/fade model, skip, roll, kick off trees, chain out, and splash into ponds.

![Chains Full graphics](docs/qa/06-full-pine.jpg)

## Play

- **Quick round** — you vs two bots (easy / medium / hard).
- **Pass & play** — up to six people on one phone, plus optional bots.
- **Online room** — one player creates a room and shares a 4-letter code; friends join from their own phones. Peer-to-peer over [PeerJS](https://peerjs.com/), no server to run.

Three courses, three or nine holes each:

- **Pine Hollow** — wooded, tight fairways, doglegs, water on 3, 6 and 9.
- **Cedar Meadows** — open rolling meadow at golden hour, long holes, strong wind.
- **Lakeshore Links** — morning light, water in play on five holes.

**Locker room** — name, skin, hair, headwear, jersey and trim colours, number, shorts, shoes, build, shades. Your avatar stands on the tee behind the main menu and shows up in every mode, including online rooms (each player's look travels with them).

Works on phones (touch) and desktop (mouse). Add it to your home screen for a full-screen app.

## Rules implemented

Standard stroke play, lightly simplified:

- Lowest total throws wins; scores shown relative to par (ace, eagle, birdie, par, bogey…).
- Tee order is by honors (best score on the previous hole). After the tee, the player farthest from the basket throws next.
- The next throw is played from where the disc came to rest (your lie).
- Holed when the disc comes to rest in the tray or is caught by the chains. Putts thrown too hard blow through or spit out ("chain out").
- Water and the course boundary are out of bounds: +1 penalty throw, play from where the disc last was in bounds.
- Circle 1 (10 m) is drawn around every basket. Pick-up at par + 5 keeps rounds moving.

## The flight model

`src/physics.js` is plain math with no rendering dependency, so the bots plan with it and it runs in a Node test.

- Lift and drag from angle of attack (a flattened, low-lift version of the classic Frisbee coefficients).
- Gyroscopic roll: above the disc's stable speed it **turns** (rolls toward anhyzer), below it **fades** (rolls toward hyzer). Spin direction flips for forehand, so backhands finish left and forehands finish right for a right-handed player.
- Discs have real flight numbers (speed | glide | turn | fade). Throw a putter at driver speed and it turns over; throw a driver too slowly and it dumps early.
- Ground skips, cut rollers, tree trunks (hard kicks) and foliage (random branch hits), and a basket with chains, band, tray and pole.
- Overhand throws start vertical and roll over in flight; the scoober starts inverted and flips back to flat.

## Run it locally

Any static server works. Without dependencies:

```bash
node serve.mjs
```

then open http://localhost:8093. (Opening `index.html` from disk won't work because ES modules need http.)

Physics sanity test:

```bash
node test/physics.test.mjs
```

## Deploy

It's static: push to GitHub and enable **Pages** on the repository root. Three.js and PeerJS load from CDNs.

## Structure

| File | What it does |
|---|---|
| `src/physics.js` | Flight model, collisions, basket catch, OB, headless simulation |
| `src/course.js` | Seeded terrain, fairways, instanced trees with colliders, ponds, tee pads, baskets, sky |
| `src/player.js`, `src/gltf-player.js` | Rigged GLB golfer, wardrobe, scrubbed Blender clips and procedural fallback |
| `src/models.js` | Optional GLB cache, Draco and KTX2 loaders |
| `src/materials.js`, `src/effects.js` | Terrain blending, foliage wind, water, HDR sky and Full postprocessing |
| `src/input.js` | Pointer gestures: aim drag and throw swipes |
| `src/bot.js` | Bots simulate candidate throws and pick the best, with difficulty noise |
| `src/net.js` | PeerJS host/guest rooms |
| `src/audio.js` | Synthesized sound: modal metallic chain cascades, wood knocks, water, wind and birds, with a short outdoor reverb |
| `src/assets.js` | Optional asset manifest: drop generated textures, course art, disc stamps and real recordings into `assets/` |
| `src/main.js` | Game state machine, camera, hub menu, locker room, HUD wiring, online sync |

No build step and no required assets. The shipped art replaces procedural defaults; an empty `assets/` folder still boots and plays. Sounds retain synthesis and accept optional sample overrides. To upgrade the look and sound with generated or recorded assets, follow [docs/codex-asset-prompts.md](docs/codex-asset-prompts.md); anything you add to `assets/manifest.json` replaces the procedural version, everything else keeps working.


## Graphics and animation

- **Lite:** procedural instanced foliage, the original terrain/shadow budget, and optional GLB golfer, disc, basket and signs. No postprocessing targets or HDR download.
- **Full:** grass/dirt/sand terrain blending, wind in foliage and matching shadows, planar water reflections, drifting clouds, meadow sun shafts, SSAO, subtle bloom and Unity-rendered HDR skies.
- Five Blender throws use phase **0–0.5 for swipe windup**, **0.62 for release**, and **0.5–1 for follow-through**. Idle weight shifts, practice swings, fairway looks and score reactions use separate clips.
- A basket-to-tee camera introduces each hole. Chain-hit slow motion changes playback speed only; physics and network trajectory data stay unchanged.
- Graphics switching rebuilds and disposes course resources. Foliage uses spatial groups; resolution can scale down during sustained slow frames. Lite never exceeds its original pixel-ratio cap.

## Validation and budgets

Run both dependency-free checks:

```bash
node test/physics.test.mjs
node test/assets.test.mjs
```

The asset test checks manifest files, GLB structure, Draco/KTX2 extensions, the golfer triangle budget, bone/material names and animation clips.

Final QA: **39 manifest entries load with HTTP 200**, physics passes unchanged, a full hole completes against bots, a manual swipe advances play, and PeerJS transports all five existing message types. No console errors in the normal asset-enabled build. Six viewport audits pass, including scrolled panel bottoms: 360×740, 430×932, 812×375, 568×320, 768×1024 and 1366×768.

Measured startup transfer: **4.55 MB Lite / 4.82 MB with Full**, including CDN code and decoders. The complete manifest totals 8.27 MB, loaded selectively. **60 fps Lite / 45 fps Full on mid-range Android and iPhone 12 remain physical-device targets, not certified results.** Desktop Chromium on an RTX 5090 passes; this does not establish mobile GPU or Safari performance.

See [QA report](docs/qa/REPORT.md), [budget data](docs/qa/budget-results.json), [overlap results](docs/qa/overlap-results.json), and [decisions](docs/decisions.md). Milestone before/after screenshots are in `docs/qa/`.

## Rebuild art (optional authoring tools)

The web game needs none of these tools. Blender sources live in `art/blender/`; image prompts are in [the asset brief](docs/codex-asset-prompts.md).

```bash
blender --background --python tools/build-models.py
python tools/compress-models.py /path/to/toktx
```

Blender creates GLBs, PBR bakes and editable `.blend` files. The second command uses Khronos KTX-Software to replace embedded PNG maps with mipmapped KTX2 while preserving Draco geometry. The golfer is **10,512 triangles including all hidden variants**, with the eleven required bones and separate wardrobe materials.

`art/unity/Assets/Editor/RenderChains.cs` renders the sampled course layouts to JPEG cards and half-float EXR skies. Run Unity in batch mode with `-projectPath art/unity -executeMethod RenderChains.Run -quit`. Generated Unity scenes/caches are disposable; the editor script recreates them. There is no Unity game build or runtime dependency.

For a minimal static deployment, publish `index.html`, `src/` and `assets/`. Authoring files, QA images and local tools are not needed by players. `chains.avatar`, `chains.course`, and the `lobby`, `start`, `throw`, `next`, `botify` message contracts remain unchanged.
