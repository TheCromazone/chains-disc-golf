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

## Kept on purpose

The low golden sun and its glare on the tee are the key-art look (`art/keyart/chatgpt-keyart-wide.jpg`); their clean midday was not copied. Characters already read as more realistic than theirs and were left alone. Lite is unchanged apart from the gold tray and links (it has no grade pass; its saturation was already .43).

## Checks

`npm test` (9 files, including `test/trail.test.mjs`), `npm run build`, `node tools/verify-browser.mjs --dist` (15/15), `node tools/verify-matches.mjs` (8/8), `node tools/verify-premium.mjs`. No console or shader errors in any capture.
