# Gauntlet against Disc Golf Masters

Reference: the nine store screenshots of [Disc Golf Masters](https://store.steampowered.com/app/2819400/Disc_Golf_Masters/) (Spin Off Games), viewed in the browser and not copied into the repo. Our side: the five gauntlet moments from `tools/capture.mjs` (menu, flyover, tee, putt, scorecard) on Pine Hollow, Lakeshore Links and Gull Point Bluffs, desktop Full 1600×900 and phone Lite 430×932. The images here are before (left) and after (right).

| Area | Before | After | Named problems fixed |
|---|---:|---:|---|
| Basket | 5 | 7.5 | Chains read as smooth white plastic rods; the whole basket was one pale off-white with a blue-white tray; inner and outer chain sets the same value |
| Air at the putt | 5 | 7.5 (Lakeshore 8) | A pale wall 20 m past the pin, read as sea fog on the coast courses; far greens desaturated to grey cardboard |
| Flight readability | 5 | 7.5 | Nothing showed where a throw went: a 21 cm disc 40 m out is a few pixels |
| Tee and flyover | 6.5 | 7 | Dusty olive greens (the grade halved green saturation) |

## What changed

- **Basket** (`src/props.js`): the tray is powder-coated in the band's gold, like their yellow tray and band framing silver chains. Chains are galvanised links shaded per pixel (`CHAIN_GLSL`): a dark pinch every 2.8 cm, alternate links turned face-on with their hole showing, a per-chain phase so 36 chains never band into rings, half-metal so they stay bright zinc in shade and glint in sun. The inner set sits a shade darker. Saturated steel-list parts are paint, not metal. [Close-up](basket.jpg).
- **Air** (`src/course.js`, `src/effects.js`): the putt's air thins (density 1.8 → .7, clear 24 → 28 m); the haze takes 30% of a colour instead of 80%; the air is a little dimmer and bluer; leaves keep more of their saturation into the distance; the grade's olive pull on greens drops from .5 to .25, with saturation 1.06. Measured on the putt frame, the share of the top half where green leads went from .15 to .19-.44 (theirs: .5-.78), and mean saturation from .30-.33 to .36-.38 (theirs: .39-.53). [Putts](putt-air.jpg), [tee and flyover](tee-flyover.jpg).
- **Flight ribbon** (`src/flight-trail.js`): a camera-facing ribbon in the disc's colour over the last .8 s of flight, a fixed ~7 px wide at the disc on a 1080p screen at any distance, fading toward the tail and within a few metres of the lens. Local rendering only; nothing on the network changes. [Frames](flight-trail.jpg), [drive](drive.mp4), [putt](putt.mp4).
- `tools/capture.mjs --course pine|meadow|lake|bluff` picks the course for a capture.

## Round 2: tee glare and treeline

| Area | Before | After | Named problems |
|---|---:|---:|---|
| Tee | 6 | 7.5 | A cream veil over the canopy within ~35° of the sun (the upper left of every tee, the left half on Lakeshore, Meadows and Bluffs); the far treeline olive-yellow and pale, not green |
| Flyover | 6.5 | 7 | Milky ground under an in-frame sun on Meadows and Bluffs |

Live A/B on frozen tee frames (fog off, bloom off, shafts off, then each lever alone) showed the fog itself, not the glare, washed the treeline: the air is near-white, so even a quarter of it over dark trunks 80 m out reads as a grey wall. The veiling glare (the light-shaft pass's lens flood round a hidden sun) made Pine Hollow's cream disc.

- `TEE_AIR` (`src/course.js`): the density scale away from the pin 2.25 -> .9, .4x the optical depth (~11% at 80 m, 31% at 150). The putt keeps `PUTT_AIR`.
- Veiling glare .5 -> .2 (`src/effects.js`). The light shafts and the sun disc stay: the backlight is still the key-art look.
- Share of the tee's top half where green leads: Pine .20 -> .25, Meadows .29 -> .36, Lakeshore .35 -> .44, Bluffs .35 -> .39. [Four tees, before and after](tee-glare.jpg).
- Tried and dropped: bloom .35 -> .2, the fog's forward-scatter glow and its warm lobe at half each moved the flyover by under .01 on every measure; what remains round an in-frame sun is the sun and its shafts.
- `__chains.post.passes` (shafts, bloom, grade) is exposed for this kind of live A/B.

## Round 3: saturation and far trees

| Area | Before | After | Named problems |
|---|---:|---:|---|
| Tee | 7.5 | 8 | Crowns grey-olive near and far; Bluffs' far spruce blue-grey |
| Putt | 7.5 | 8 | A milky wall past ~40 m on Meadows; Bluffs' woods behind the pin blue-grey |
| Flyover | 7 | 7.5 | Every canopy dusty olive under a pale sky |

A new measure: foliage pixels only (hue 35-170°, with some chroma), top half of the frame. On the reference stills those leaves sit at saturation .40-.54 and value .21-.39: dark, rich greens. Ours sat at .24-.41 and .37-.60, too pale and too grey. The leaves were losing colour in five places at once: the albedo (45%), a further 10% on the lit result, the fog, the far squeeze and the grade's olive pull. Live A/B on frozen frames found the albedo and the air did almost all of it; the far squeeze barely moved anything and stays.

- Leaves (`src/course.js`): the albedo keeps 80% of its colour on Full (was 55%), and the extra 10% on the lit leaf is gone. Lite keeps 55%: it has no grade pass, and on the phone its crowns went lime (.64).
- Grade (`src/effects.js`): saturation 1.06 -> 1.12 and the olive pull's desaturation off (`uOlive` .25 -> 0); greens still lean olive in hue.
- Putt air: density .7 -> .4 and a darker air away from the sun (haze .6/.72/1.05 -> .42/.52/.78), so the far rows sit darker inside it instead of lifting to white. The rows still step back. Tee air: `TEE_AIR` .9 -> .55.

| Top half, foliage saturation | Pine | Meadows | Lakeshore | Bluffs |
|---|---|---|---|---|
| Tee | .41 -> .51 | .35 -> .41 | .28 -> .36 | .30 -> .36 |
| Putt | .37 -> .47 | .31 -> .38 | .31 -> .42 | .28 -> .32 |
| Flyover | .39 -> .51 | .33 -> .43 | .27 -> .39 | .24 -> .32 |

Whole-frame saturation went from .31-.39 to .35-.45 (the reference: .39-.54). Top-half green-lead on the putt: Pine .19 -> .29, Meadows .21 -> .42, Lakeshore .44 -> .58, Bluffs .26 -> .45. Phone Lite on Pine and Lakeshore: top-half foliage saturation .34-.49 -> .37-.55. [Tees and putts, before and after on each course](saturation.jpg).

Still short of the reference: Bluffs (the haziest air and the most sky) at .32-.36 foliage saturation, and the reference's woods are denser, with near-black shade under them, where ours show more open, lit floor.

## Round 4: canopy density and woods shade

| Area | Before | After | Named problems |
|---|---:|---:|---|
| Putt | 8 | 8.5 | The woods behind the pin read as a park: tall trunks over bare floor, nothing between knee and crown, so every gap ran on to lit ground 50-100 m back; those far stands lifted to a pale yellow-grey |
| Tee, flyover | 8, 7.5 | unchanged | (the stands either side of a tee are the fairway's edge rank, which the shrubs keep clear of) |

The reference's woods are green down to the ground and dark inside. A live A/B on the Meadows and Bluffs putts (sun off, air off, sky fill off, crown shadows solid) found the air was what lifted the far stands. With it off they went deep green; the sun and the crowns' shadows barely changed them.

- **Woods shrubs** (`src/course.js`): a shrub layer 1.7-3.6 m tall under the canopy, in clumps, only where a tree stands within 8 m. They start 4 m outside the fairway's edge, with none within 18 m of a basket or 24 m of a tee, and none on a prop (checked against the dressing's colliders). Scenery only: the disc passes through them as it does the existing edge bushes. They draw in 3D near the eye and as impostor cards beyond, so the cost is 5 draws and ~15k triangles on Full and one draw on Lite, with frame time unchanged. About 1,600 on Meadows and 2,100 on Pine Hollow.
- **Putt air** density .4 -> .25.
- Measured on the putt's top half (foliage only), before -> after:

| Putt, top half | Pine | Meadows | Lakeshore | Bluffs |
|---|---|---|---|---|
| Green-lead | .29 -> .33 | .42 -> .55 | .58 -> .64 | .45 -> .58 |
| Foliage value | .44 -> .42 | .41 -> .36 | .38 -> .36 | .47 -> .43 |
| Foliage saturation | .47 -> .50 | .38 -> .43 | .42 -> .47 | .32 -> .36 |

[Putts, before and after on each course](woods.jpg).

**Tried and dropped:**
- A fuller crown shadow (the course-wide shadow cut .95 -> .6 or .35) laid one even shade over Pine Hollow's whole tee and lost its sun dapple, and changed nothing on the other courses.
- A shadow box of 280 m instead of 120 m changed nothing.
- Darkening the floor under crowns (albedo 20% -> 45%) moved no measure: the floor you see near a pin is lawn by design.

Still open: from the tee the side stands are trunks on lit grass, and Meadows and Bluffs are thin by design (tree density .3 and .22). Making them read as woods means more trees, and trees are colliders, so that would change play.

## Round 5: woods on Meadows and Bluffs, play kept fair

Meadows and Bluffs (tree density .3 and .22) read as a park from the flyover and tee: a few trunks on lit grass either side of each hole. The ask was more trees with fair play, and trees are colliders. So the new ones go only where play does not:

- 12 m or more outside the fairway's edge;
- none within 45 m of a tee or 28 m of a basket, none in a putt lane, 4 m from any other trunk.

They come from a separate pass with its own rng (`def.woods`, 1 on both courses), so every existing tree, prop and bush stays where it was. They cast no shadow and are kept out of the dressing, and a check found no trunk inside any prop's collider. Meadows gains 600 trees (1,891 -> 2,490) and Bluffs 820 (1,699 -> 2,519). Lite adds ~30k triangles on Bluffs with no new draws; frame time is unchanged.

**Fair play, measured** (`tools/qa/fairness.mjs`, new): the game's own medium bot plays every hole 120 times through the real physics and its execution error, wind calm. Math.random is seeded per hole and run, so the two layouts throw identically until a tree changes something.

| 120 plays a hole | Meadows before | after | Bluffs before | after |
|---|---:|---:|---:|---:|
| Strokes over par a hole | +.43 | +.42 | +.69 | +.69 |
| Tee shots touching a tree | 166 | 158 | 192 | 192 |
| Throws touching a tree | 352 | 348 | 357 | 360 |
| Tee shots resting on the fairway | 83% | 83% | 59% | 60% |

Per hole the change is within ±.16 strokes and goes both ways. Bluffs 4 is the largest at +.16, with no throw there touching a tree: the bot's best tee lines are the same, so the change builds up in later shots. For scale, Pine Hollow and Lakeshore play +.61 and +.48 with 31% and 22% of tee shots touching a tree.

[Flyover and tee, before and after](back-woods.jpg). Meadows' menu blurb no longer says "few trees".

## Round 6: the stands beside the tee

| Area | Before | After | Named problems |
|---|---:|---:|---|
| Tee-side stands | 6.5 | 7 | No shade: the open side's trees, the young edge trees, the clearing groves and the back woods skipped the shadow pass, so they stood as trunks on evenly sunlit grass. The floor under them was a pale sandy tan that read as sunlit even in shade. Nothing grew between the floor and the crowns, 8 m up |

The reference's tee shots stand in woods: foliage at every height, a dark floor with sun patches.

- **Every tree casts** (`src/course.js`, the `quiet` flag is gone). Cost: ~90k triangles and ~.5 ms a frame on Pine Hollow's tee and flyover (12.25 -> 12.75 ms and 11.0 -> 11.7 ms, Full at 1600x900, measured alone, twice each). Draw calls fall by 10, because the quiet trees no longer need their own batch. Lite is unchanged (its trees are impostors).
- **Floor under crowns** up to 40% darker (was 20%), with less of the pale dry grass (.15, was .4).
- **Shrubs** now grow under the tee clearing's groves and from 14 m of a tee (was 24), but 6 m off the fairway's edge (was 4).

**Fair play.** No collider moved, and the bot plays every course stroke for stroke as before. A shrub is scenery: a disc resting in one leaves the player standing in a bush. So `tools/qa/fairness.mjs` now also counts throws that rest inside an edge bush or a woods shrub. With shrubs right up to the fairway edge that count doubled, so they were held back:

| Rests in a shrub, ~2,000 bot throws a course | Pine | Meadows | Lakeshore | Bluffs |
|---|---:|---:|---:|---:|
| Before (round 4 rules) | 29 | 15 | 10 | 28 |
| Shrubs 1.5 m off the edge, denser (tried) | 60 | 35 | 33 | 53 |
| Shipped | 28 | 12 | 10 | 6 |

In the right-hand stand from the tee, green foliage in the lower band went from 3% to 5% on Pine Hollow and 4% to 6% on Lakeshore, and the floor darkened slightly. Meadows and Bluffs barely move: the trunks seen there stand within a few metres of the fairway, where shrubs would catch discs. [Right-hand stands, before and after](tee-stands.jpg) (top: Pine, Meadows; bottom: Lakeshore, Bluffs).

Still open: the bare 0-6 m band near the fairway. Filling it means low foliage where discs land, so it needs either collision for shrubs (a play change) or low-branching species in the front rank (new colliders); either should go through `fairness.mjs`.

## Round 7: low-branching front row, fairness checked

| Area | Before | After | Named problem |
|---|---:|---:|---|
| Fairway edges (flyover, tee) | 7 | 7.5 | The trees beside a fairway carry their crowns 8 m up (broadleaf, birch, Scots pine), so the edge reads as bare trunks on lit grass |

Spruce is the one species whose boughs reach the ground. `src/course.js` swaps the species inside `plant()`, in place: same spots, same rng streams, the props' colliders identical (checked). Only a tree's collider changes, its trunk and crown sphere. Each variant went through `tools/qa/fairness.mjs` (medium bot, 120 plays a hole, seeded, calm) against master, side by side:

| Strokes over par a hole | Pine | Meadows | Lakeshore | Bluffs |
|---|---:|---:|---:|---:|
| Master | +.54 | +.42 | +.47 | +.69 |
| Every front-row species -> spruce (tried) | +.56 | +.43 | +.43 | **+.75** |
| Broadleaves only -> spruce (shipped) | +.55 | +.45 | +.41 | +.67 |

- **Every species, dropped.** As spruce a birch's or Scots pine's crown sphere drops 3-5 m, into the low flights along the edge. Bluffs 9 played half a stroke harder (4.61 -> 5.15, OB 38 -> 102). A new spruce turned the bot's best tee line from a straight forehand to a backhand 18° right, which finds the fairway but leaves the approach over the water.
- **Broadleaves only, shipped.** A broadleaf's crown sphere is only .8 m higher than a spruce's and its trunk 8 cm thicker, so the collider barely moves. Every course total is within .06 of master, and each hole within ±.23 both ways, as noisy as the last round's holes with no tree on the line. Out of bounds 68/3/156/38 -> 68/3/129/42.
- Spruce within 22 m of a fairway's centre line: Pine 162 -> 275, Meadows 41 -> 147, Lakeshore 89 -> 207, Bluffs 103 -> 130. Each tee's framing broadleaf stays.

[Flyovers, before and after](front-row.jpg): spruce now stands either side of each arch on Meadows, Lakeshore and Bluffs. From the tee the change is smaller: the near right-hand crown is the framing tree, and the trunks behind it stand more than 6 m out.

`tools/qa/fairness.mjs` now checks the course it loaded: under eight parallel runs one page booted the default course and reported Pine Hollow as Bluffs. Every result above was re-run with the check.

## Kept on purpose

The low golden sun and its glare on the tee are the key-art look (`art/keyart/chatgpt-keyart-wide.jpg`); their clean midday was not copied. Characters already read as more realistic than theirs and were left alone. Lite is unchanged apart from the gold tray and links (it has no grade pass; its saturation was already .43).

## Checks

`npm test` (9 files, including `test/trail.test.mjs`), `npm run build`, `node tools/verify-browser.mjs --dist` (15/15), `node tools/verify-matches.mjs` (8/8), `node tools/verify-premium.mjs`. No console or shader errors in any capture.
