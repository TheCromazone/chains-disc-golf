# Chains graphics pass — 2026-11-11

Intent: preserve the existing realistic park/tournament art direction and mechanics; improve prominent playable surfaces using actual GPT generated textures, fix concrete resource defects, and deliver a verified review branch.

Isolation: codex/chains-graphics-polish in managed worktree. Original checkout contains untracked personal documents/reference images; untouched.

Baseline: captured desktop menu, desktop tee, mobile portrait tee in polish-2026-11-11. Existing forest, athlete, shadows, tournament props, sky and event feedback are already authored. No wholesale palette or lighting redesign justified.

Design decisions: generated orthographic turf and timber artwork goes into the existing prop atlas (no additional runtime texture samplers or draws). Preserve tee geometry, margins, markings, physics and atlas UVs. Improve low-cost target readability only if playtest supports it.

Bug audit: course disposal misses InstancedMesh GPU buffer disposal; texture cache keys ignore sampler/color options. Independent read-only review by graphics_review.

Skills read: director, aaa-graphics-builder and all four references, qa-release and release checks/evidence manifest, debug-profiler, imagegen, using-superpowers and brainstorming. Gameplay/UI sibling skills absent at installed sibling paths; preserving those systems, using existing game's tests. User authorized independent design, so no design approval round.

Pending: generate and inspect materials; integrate assets; focused resource regressions; production and real-input desktop/mobile verification; evidence and push/PR.

## Integration checkpoint

Fetched origin before delivery: local master was 312 commits behind `origin/master` (`eca3c8c`). Rebased this isolated branch onto current remote, resolving main.js in favor of upstream (its panorama-null and duplicate-key fixes already exist). Kept all newer forest, camera, athlete, loading/retry and gameplay work. Refreshed production build and 16 unit test files pass. Production input suite passes all 16 checks, including 143 instance disposal events. Final screenshot/inspector reports regenerated successfully on the rebased revision. Desktop and native Mobile tier screenshots reviewed. Baselines recaptured from archived origin/master source, and original intermediate captures removed. Both named-state canvas reports pass the evidence checker.

## Completed delivery

Production build, all 16 Node test files, all 16 production input/resource checks, named-state desktop/mobile hardware canvas inspections, evidence manifest, and the full three-player/three-hole Pine Hollow round pass. Before/after images and unpaused motion inspected; generated originals, prompts and runtime textures retained. No remaining introduced defects. Physical-phone/Safari performance, multiplayer recertification and existing render budget overruns remain explicitly unverified/retained limits.

Implementation commit: d2564f6. Branch pushed: codex/chains-graphics-polish. Review PR: https://github.com/TheCromazone/chains-disc-golf/pull/39 (not merged; no deployment). Original checkout and its untracked user files preserved. Production preview retained at http://localhost:8189; temporary baseline servers closed.

## Wave two — measured rendering and usability follow-up

Fetched origin before changes: master remains eca3c8c, PR branch clean at 285d845 (two delivery commits ahead); preserving all prior assets and source. Using director, debug-profiler, graphics technical-art and QA release skills. Independent read-only usability audit assigned to graphics_review.

Baseline production on port 8289, Chrome CDP port 9477; fixed dpr=1, default avatar, Pine tee and controlled 6.5 m putt, desktop 1440×900 and native Mobile 390×844. Baseline full-frame costs: mobile tee 796,868 / putt 1,165,912 triangles; desktop tee 2,223,651 / putt 2,455,363. Profiles and images in artifacts/wave-two/before-*.

Measured surfaces: entire 104k-triangle terrain, 58k/125k course-wide contact shadow geometry, merged course furniture submit whole meshes outside the visible play region. Initial implementation target: conservative static triangle partitioning with original vertex/normal/UV/color data preserved and native frustum culling, without changing physics terrain or art density. Profile again before considering any quality reductions.

### Wave-two completed implementation and checks

Selected 128 m static cells after comparing 64 m and 128 m tradeoffs. Triangles: Mobile tee 796868→642584 (-19.4%), putt 1165912→964073 (-17.3%); Desktop tee 2223651→1932832 (-13.1%), putt 2455363→2076541 (-15.4%). Draw calls increase to 101/109 Mobile and 160/141 Desktop; no geometry simplification. Four matched camera positions identical. Four synchronous culling-on/off raw GPU readbacks have zero changed channels. Unit invariants cover original triangle/attribute data, shadow hooks/materials, seam raycast, RNG, disposal and fallback behavior.

Independent audit reproduced and implemented pointer mute focus blocking gameplay keys and tools navigation sticking on hidden/disabled actions. New regressions pass. Rendering review found no actionable issues and inspected before/final putt captures.

Build passes; 17 test files pass (+1), production input/resource suite 21 checks (+5) passes; aim camera regression + 1242 lies across all four courses passes. Four fresh named-state hardware inspector reports pass; wave-two evidence checker confirms seven declared artifacts. New motion through flight/contact inspected. Final reports/captures in artifacts/wave-two; separate wave-two section in final-evidence.md explains all deltas, draw/buffer cost and remaining limits.

Implementation commits c020405 and 5a5f054. Original source checkout untouched. Retained limitations: physical-phone/Safari FPS, Mobile texture counts 44/46, remaining triangle overruns, multiplayer recertification. This is lower submitted geometry, not an FPS multiplier claim. No new generation, paid service, merge or deployment.
