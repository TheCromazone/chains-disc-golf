# Face atlas delivery

The face runtime is shared by the new body and procedural fallback. This piece packages its deterministic ink paths as a 640×640 PNG source (28,130 bytes) and KTX2 delivery texture (10,466 bytes), built by `tools/build-face-atlas.mjs`.

Before: `09-character-before.png`. After: `09-face-high-after.png` and `09-face-low-after.png`, captured from the actual inspector. The high path uses KTX2 and the low path uses Canvas; both now show matching feature order. KTX2 uses inverted V coordinates because GPU compressed texture upload does not apply Canvas-style `flipY`.

The browser identity test in `09-character-results.json` verifies an eye/mouth selection updates UVs while keeping the same five meshes, geometries and materials. Supported choices are four sets each of eyes, brows, nose, mouth and glasses. Geometry follows the round skin surface, so facial ink stays attached in profile. No realistic skin/cloth textures are used.

The independent critic's malformed-face blocker was corrected. No claim is made that the avatar beats the Wii/Switch references. Physical phone frame rates remain unmeasured.
