# Tee material artwork

Generated 2026-11-11 with the built-in GPT image generation tool, without a separate API or paid provider fallback. Sources are retained here; the game loads the compressed versions below through `assets/manifest.json` → `atlas`.

| Source | Runtime asset | Atlas region | Purpose |
| --- | --- | --- | --- |
| tee-turf-source.png | assets/textures/course/tee-turf-v1.webp | 512 × 1600 (half size on Mobile) | Curled turf fibres, a worn plant zone, run-up wear and edge needles |
| weathered-timber-source.png | assets/textures/course/weathered-timber-v1.webp | 512 × 128 (half size on Mobile) | Silvered grain and checking on tee framing, bench slats and timber props |

These are albedo images drawn into the existing canvas atlas. Lighting, relief, grime, geometry and physics remain owned by the game. No new GPU sampler, material, mesh or draw is added. Failed image loads retain the procedural painters. The faint dashed limit on the throwing end is painted in code for consistent placement.

Generation output IDs: `exec-6c7c75da-9660-4f52-bd11-10736a27129f` (turf); `exec-7ce7dcc7-2aca-4944-b44b-09dcc4876825` (timber).

Rebuild runtime encodings with:

```sh
cwebp -quiet -q 86 -resize 512 1600 art/generated/tee-materials/tee-turf-source.png -o assets/textures/course/tee-turf-v1.webp
cwebp -quiet -q 86 -resize 1024 256 art/generated/tee-materials/weathered-timber-source.png -o assets/textures/course/weathered-timber-v1.webp
```

The model returned 1:3 and 3:1 sources. Runtime versions are resized to match the atlas proportions; the original bitmap masters are unmodified.
