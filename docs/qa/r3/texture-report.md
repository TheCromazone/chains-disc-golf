# Painted texture delivery

Twelve original painted materials ship as 256px grayscale JPEGs, **147,640 bytes total**. The renderer multiplies the bright palette by these neutral detail maps and retains toon lighting. No PBR, HDRI, bloom or SSAO was enabled.

- Before: `before-hud-430.png`, `before-hud-812.png` (accepted review tree with canvas grain).
- After: `texture-high.png`, `texture-low.png`; fallback: `texture-low-fallback.png`.
- All twelve tiles: `texture-contact-sheet.jpg`.
- Original authoring masters and provenance: `art/textures/r3/`.
- Rebuild: `python tools/texture-pack.py`.
- Runtime verification: `node tools/texture-verify.mjs` with `PLAYWRIGHT_MODULE` configured. Results: `texture-results.json`. Pine exercises eleven tiles; Lake adds water. Recorded shader bindings contain loaded 256px images. No JavaScript or shader errors.

The first comparison found barely visible turf marks. Amplification exposed doubled stripes; one new image edit removed stripes from the detail map while keeping broad mowing in the course colors. The final foliage adjustment increased cluster size without changing tree geometry. These are visible improvements; the independent [critic report](texture-critic.md) still selects Switch Sports. The largest remaining difference is layered canopy volume and shaded overlap. All-file loading is not proof of appearance parity for every material.

For startup transfer totals and the final six-viewport audit, see the milestone report and `after-browser-results.json`. Device frame rates remain unmeasured.
