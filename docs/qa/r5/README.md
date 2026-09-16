# Round five — Blender athlete, discs, hammer, wind course, ground contact

Evidence for the pass that replaced the round-headed Mii with a Blender-authored athlete and added the
hammer, a fourth (windy) course and surface-aware landings.

- `blender-athlete-front.png`, `blender-athlete-quarter.png` — Workbench turnarounds rendered by
  `tools/build-golfer-v2.py --preview` before export. The body, jersey, shorts, socks and shoes are lofted
  cross-sections; twelve hair styles and six kinds of headwear ship as hidden variants in the same GLB.

## What changed

| Area | Before | After |
|---|---|---|
| Actor | Mii ellipsoids, five hair styles, four hats | Lofted athlete (17.3k tris, 551 KB) + phone LOD (6.1k tris, 224 KB); 12 hair, 6 headwear, wristbands, socks |
| Lite phones | procedural three.js rig | the same Blender LOD and the same 32 clips |
| Face | eyes, brows, nose, mouth, glasses | + eye colour (tinted iris decal), facial hair (tinted by hair colour) |
| Shirt | one colour + trim | + hoops, stripes, sash, sleeves, split, chevron (bind-pose shader, no UVs) |
| Disc | three.js lathe, plain stamp | Blender lathe with mould rings and embossed rim text (`tools/build-disc.py`), foil stamp with a mark per mould |
| Throws | ten | eleven: hammer (inverted flight, RH and LH clips, icon, hint, tests) |
| Courses | three | four: Gull Point Bluffs, wind ×2.8, windsocks, wind streaks, grass and canopies lean downwind |
| Landing | fixed restitution | rough grass damps skips and rolls, coin-settle wobble, recorded spin rate, debris puffs |

## Checks run

- `node test/physics.test.mjs` — eleven throws both hands, hammer apex inverted, wind lift/drop, rough shortens the run.
- `node test/animation.test.mjs` — 22 clips match the shared poses at every key phase; sole contact holds.
- `node test/assets.test.mjs` — manifest files exist; athlete and LOD inside the new budgets; disc is runtime-tinted plastic.
- `docs/qa/overlap-audit.js` at 375×812 and 812×375 in the embedded browser: every screen `ov:- off:- clipped:-`, eleven throw choices.
- Play-through on Full and Lite: menu hero, locker tabs, tee, hammer/backhand/forehand poses, bot flight, landing.

Physical phone frame rates still need `?fps=1` on a device; the embedded browser cannot certify them.

## Second pass — surfaces

Toon ramp replaced by physically based materials with the round-one photo tiles (grass, bark, concrete, dirt, sand, water normal, jersey weave, skin normal), real cast shadows, image-based ambient, ACES, rim light and a Full-only bloom + grade pass. Checked on Full (Pine Hollow tee and flight) and Lite (Lakeshore tee), clubhouse and locker, no console errors from the new modules.
