# R3 texture critic — final fourth revision

## Verdict

**Switch Sports remains the winner for visible texture and material richness.** Chains now has visibly textured turf and foliage at phone size, and its fourth revision is the best of the reviewed candidates. The doubled fairway stripe problem is resolved. The final foliage adjustment is a modest, real improvement; it does not establish reference parity.

**Single largest remaining gap: foliage lacks the reference's layered leaf/frond volume and shaded overlap.** The current crowns still read primarily as large polygon faces. Texture scale and contrast helped the surface marks, but further amplification cannot create the missing overlapping canopy structure.

Final label-hidden board: `texture-comparison.png`. A = supplied Switch Sports address frame from qHaku5GRkPU around 2:07–2:08; B = Chains fourth-revision high-quality aim capture at localhost:8093. Source sheet: `texture-contact-sheet.jpg` (all twelve current 256 × 256 JPEGs).

## What the requested texture pass achieved

The loaded texture files are more than a manifest checkbox: irregular ground detail and foliage mottling are visible in the final high and low phone captures. The unbanded fairway tile preserves the course's existing broad mowing bands without adding a second repeated stripe pattern. The enlarged leaf/frond mapping makes the nearest crowns' painted marks easier to perceive. No obvious wallpaper-like repetition is apparent in these stills.

This supports a **visible improvement from the prior Chains render**, not a claim that Chains has beaten Switch Sports. A texture-only pass can be useful and meet its material-detail objective while the reference still looks richer. These images cannot establish the appearance of every requested material or a win for the entire game. Asset bindings, visual quality and overall art direction are separate judgments.

## Initial pixel-first judgment and revision history

The initial judgment was recorded before inspecting tile artwork or shader code: the reference had turf blade/clump variation and leaf-scale marks that survived phone downsampling, while Chains chiefly showed smooth green gradients and polygon faces. An initial basket flyover was acknowledged as a mismatched viewpoint; the saved aim-state comparison then gave the same winner.

| Revision | Evidence | Judgment |
|---|---|---|
| Initial | `texture-comparison-initial.png`; preserved `texture-initial-high.png` / `texture-initial-low.png` | Switch won; Chains' near rough was visible, but fairway and foliage detail faded too early. |
| Amplified detail | `texture-comparison-amplified.png` | Real gain in rough, turf and leaf marks. Amplification exposed doubled narrow fairway bands as a plaid/checker pattern. Switch still won. |
| Third: unbanded fairway | `texture-comparison-third.png`; preserved `texture-third-high.png` / `texture-third-low.png` | Plaid issue resolved. Best ground treatment; largest remaining gap shifted to foliage cluster structure. Switch still won. |
| Fourth: larger foliage detail | `texture-comparison.png`; current `texture-high.png` / `texture-low.png` | Near crown marks read more clearly. No obvious still-image repetition defect. Improvement is modest; Switch remains the texture winner. |

The final fourth settings use deciduous tile span 5 m and pine 4 m, both strength .9. Ground remains unchanged from the successful third revision. The camera is now fully settled and the hole-title toast is absent.

## One remaining gap, and whether tuning can solve it

**Gap: layered leaf/frond volume and shaded overlap are missing from the canopy appearance.** Local material scale/contrast tuning already improved the texture component: it made the cluster marks more visible on the nearest deciduous crown. That is a successful localized texture change.

More texture-only work could refine irregular light/dark clusters and avoid repetitive marks, but another blanket strength increase is unlikely to close the remaining gap. Much of the reference advantage comes from overlapping foliage masses, silhouette detail, normals and lighting. Those require geometry/normal/shading work beyond this grayscale-detail-on-existing-toon-material pass. The screenshot evidence does not justify claiming that one more coefficient change would produce parity.

The next practical check within the current scope is camera-motion review of the fourth settings for shimmer and visible tiling. Keep the settings if the clusters remain stable. A full reference match should be treated as a separate canopy art task, rather than held out as the promised result of additional texture contrast alone.

## Requested material coverage

| Surface | What the final evidence supports |
|---|---|
| Fairway/mowing | Irregular turf texture visibly renders. Broad course mow bands remain; doubled bands are resolved. |
| Rough | Close blades/clumps clearly read, especially below and beside the tee. Separation from fairway is visible. |
| Green | Distinct fine tile and terrain binding exist; these aim views do not give a useful close green comparison. |
| Sand | Painted directional ridges exist; the runtime sand strip is too distant to grade detail fairly. |
| Bark | Fissures exist in the tile; narrow trunks chiefly read as brown strips at this view distance. |
| Pine | Frond tile is bound and mottling is visible; the canopy still reads mostly as broad polygon layers. |
| Deciduous | Enlarged painted cluster marks are more apparent, but geometry and polygon lighting dominate the crown. |
| Tee | Large pad remains almost flat visually; aggregate detail is subtle at phone size. |
| Metal | Tile/binding exists; no useful close basket metal comparison against the reference is present here. |
| Water | Tile/binding exists; no water is visible in the aim frame. No runtime appearance score is defensible. |
| Jersey | Knit loops exist in source, but the small avatar shirt reads predominantly flat. No fabric close-up comparison. |
| Skin | Quiet mottling is appropriate for the target; visible pores would not help this stylization. No close-up grading claim. |

The sheet shows recognizable original painted surface patterns rather than twelve copies of undifferentiated noise. Shader bindings establish implementation coverage. Neither alone proves final appearance on every surface.

## Comparison controls and limits

- Both panels show an athlete preparing a shot along a tree-lined fairway, using equal 430 × 600 px portrait panels. A is cropped from a landscape source; this does not imply native portrait gameplay on Switch.
- A uses source crop (515, 0, 1031, 720), resized from 516 × 720 to 430 × 600. B uses source crop (0, 145, 430, 745) at native pixels. No aspect-ratio stretching is used.
- No sharpness, saturation, brightness, texture or contrast edits were applied. Only B's tiny jersey product word was covered with adjacent shirt color. Other HUD elements remain.
- This is **label-hidden, not truly identity-blind**. Source filenames and recognizable game imagery were already visible to the reviewer. No independent blinded user preference, user study or numerical quality score is claimed.
- Camera pitch, focal length, terrain, light direction, vegetation density, world scale, render resolution and video compression differ. These affect apparent texture; the board is an informed appearance comparison, not a controlled shader benchmark.
- The settled fourth camera puts the avatar farther away than the third capture and farther away than A. Trees and terrain also occupy different screen scales. Equal panels do not guarantee equal texel density or equal character size.
- A is a compressed recorded frame; B is a direct screenshot. A's large foreground turf area and B's uphill middle distance are not the same physical surface distance.
- The fourth high and low images share the settled scene function and omit the toast, but avatar poses differ slightly. Static images cannot establish movement shimmer or real-device performance.

## Scope of the conclusion

The honest outcome is **improved Chains textures, with Switch Sports still preferred in this scene**. The remaining largest canopy gap cannot be cleanly solved by texture scale/contrast alone. Green, sand, water, metal and clothing close-up quality remain unproven by this board and should not be presented as validated visual wins.
