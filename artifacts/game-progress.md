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
