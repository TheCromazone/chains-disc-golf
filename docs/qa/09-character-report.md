# Original round-head golfer and face parts

## Character piece

Before: `09-character-before.png` (verified prior-pass locker screenshot). After: `09-character-high-front.png`, `09-character-high-side.png`; procedural fallback equivalents use `low` in the filename. These are actual browser renders, not offline beauty renders. `/docs/qa/character-inspector.html` exercises the same factory, body, clips and decals as gameplay.

- One 466,036-byte body, eleven unchanged bone names, ten small animation-only GLBs (10,928–16,260 bytes), and a 160,840-byte LOD. Main body: 10,800 triangles; LOD: 3,230. No body meshes, materials or textures are duplicated inside clips.
- Authored Blender source and unstripped GLBs are in `art/blender/golfer-*-source.*`; rebuild with `tools/build-mii.py`, then `tools/split-golfer-clips.py`. Prior pass Blender sources remain available.
- Large round head, short body, simple hair shells, short tube arms, white gloves, contrasting soles. A shared three-stop toon ramp replaces skin/cloth PBR. Skin never receives dark tree shadows.
- Low/Lite skips model downloads. Full/High loads body, LOD and clips; `createCharacter({ ...avatar, lod:true })` uses the cached distant model. Missing models retain the procedural character, with all ten semantic actions.
- The sibling's Meshy clip extractor, deterministic appearance compiler, Blender athlete audit and public figures/appearance packaging were studied. This uses truly mesh-free clip files instead of the sibling's placeholder triangle and reduces the LOD below the sibling's 492 KB.

## Face part piece

- Original eye, brow, nose, mouth and glasses paths live in `src/face-parts.js`. Five persistent surface decals address one 640×640 atlas. Every choice changes UVs, not mesh/material identity. Decals conform to the round head to avoid floating marks from the side.
- Full uses `assets/appearance/face-parts.ktx2` (10,466 bytes); Canvas draws the exact same paths for Lite and empty-assets fallback. `tools/build-face-atlas.mjs` compiles the PNG source and KTX2 deterministically.
- Browser review caught an upside-down KTX2 atlas and hair hiding brows. UV orientation now distinguishes compressed textures, and hair clears the face. Front/side captures show the repaired high and low paths.
- Existing avatar fields remain; new face fields are additive. Legacy `shades:true` selects sport glasses when no explicit glasses field exists.

## Verification and critique

`node test/assets.test.mjs` and `node test/physics.test.mjs` pass. The headless browser report (`09-character-results.json`) confirms high loads the GLB, low uses procedural, all ten clips are present, eleven joint transforms remain finite, face swaps preserve object/geometry/material identity, and both modes produce no browser errors. Throw clips are exactly one second; reactions are 2.4 seconds; idle is four seconds.

The fresh critic in `critic-round2.md` chose the references and identified face misregistration and assembled-body transitions. Both were revised above; no blind win is claimed. The generic rig skill validator was run: its remaining two failures require combat actions and combat hurtboxes, intentionally outside the user's sports role contract. Project-specific asset validation is green. Physical Android and iPhone frame rates are still owed.
