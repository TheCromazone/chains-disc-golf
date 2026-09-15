# Independent canopy visual critique

Reviewed: 2026-09-15. Fresh visual review of the six supplied stills. No builder acceptance text was used. No code or Git changes were made.

## Verdict

**The Switch reference wins. The latest Chains version wins its own before/after comparison, but does not reach reference canopy quality.** This is a still-image visual judgment, not a performance or gameplay verdict.

**ONE biggest gap: the canopy still reads as an assembly of round clumps instead of a cohesive leafy mass.** In the foreground left deciduous trees, the new overlapping lobes add a useful irregular outline, but each lobe remains visibly spherical, similarly green, and similarly lit. Their repeated rounded contours dominate the small amount of surface detail. The reference's broad crowns have a more continuous leaf texture, softer irregular edges, and a stronger darker underside. At phone width, those cues produce a more convincing volume rather than a cluster of green balls.

## What changed visibly

- Before: large angular oval crowns make the low-poly construction immediately legible.
- After: smaller overlapping lobes break the outline and introduce internal depth. This is a visible improvement at the supplied 430 px width, particularly on the nearest left trees.
- The treatment changes the shape more clearly than the material impression. Added texture does not yet override the repeated clump construction.
- High and low show essentially the same canopy improvement at this scale. I cannot honestly award high a meaningful visual advantage from these stills. The avatar differences are outside this canopy assessment.

## Matched presentation and limits

The [compact A/B board](texture-canopy-ab-board.html) presents image sources at **430 CSS px wide**, with no stretching, sharpening, recoloring, or enlarged detail crops. Its upper pairs use the latest high/setup and latest low/address sources. Its last pair shows before/after high. Product names are absent from the board; the key is below. HUD text is covered or excluded in the canopy excerpts. The reference's large HUD requires neutral masks; these masks are visible and do not count as scene quality.

The source cameras, tree species, aspect ratios, and apparent crown sizes differ. This is a comparison of the supplied scenes at equal phone display width, not an identical-camera or equal-object-size experiment. The reference is compressed source imagery. Even with those limits, its central broadleaf crown still communicates the stronger foliage material and volume. The full Chains viewport spends more of its width on conifers; their smaller coverage should not be mistaken for proof of inferior leaf detail.

Board key: A = Chains after high; B = Switch setup; C = Chains after low; D = Switch address; E = Chains before high; F = Chains after high. Before low was also inspected directly and supports the same conclusion.

## Next visual target

Keep the improved outline, but make the nearest broadleaf tree read as one crown at 430 px: fewer equally prominent round lobes, a coherent darker underside, and leaf-scale variation across the crown that does not stop at each lobe boundary. Judge that single tree against the reference before accepting another general texture pass. This is a recommended direction, not a claim that an unbuilt change will succeed.

## Geometry evidence — separate from the visual verdict

The supplied before/after JSON reports the following. These figures did not determine the visual winner.

| Metric | Low before → after | High before → after |
|---|---:|---:|
| Reported tree triangles | 2,041,388 → 1,929,716 | 3,657,212 → 3,776,372 |
| Rendered frame triangles | 858,086 → 837,134 | 1,095,914 → 1,110,242 |
| Rendered calls | 113 → 113 | 92 → 92 |
| Reported tree draws | 263 → 263 | 263 → 263 |

Low rendered triangles fall by 20,952; high rendered triangles rise by 14,328. Both supplied captures report no errors. Triangle counts and a single captured frame do not establish frame rate, thermal behavior, or a mobile performance pass. No numerical geometry budget was provided to this critic, so no budget acceptance is claimed.
