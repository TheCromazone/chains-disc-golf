# Asset generation prompts for Codex (image gen 2.5)

Chains runs with zero asset files: every texture, the avatar, the courses and every sound are generated in code. This document is the drop-in upgrade path. Generate the files below, put them under `assets/`, list them in `assets/manifest.json` (example at the bottom), reload. Anything missing in the manifest keeps using the procedural version, so you can add assets one at a time and compare.

Rules that apply to every image prompt:

- No text, logos, watermarks, people or UI chrome unless the prompt asks for it.
- Tileable textures must be seamless in both axes. Ask for "seamless, tileable, no visible repetition, evenly lit, no vignette, top-down orthographic".
- Deliver PNG for anything with alpha, JPEG (quality 85) otherwise. Keep each file under 1 MB; the game loads on phones over CDN-free static hosting.
- Colour textures are sRGB. Normal maps are OpenGL-style (green up), linear.

## 1. Terrain and course textures (`assets/textures/`)

Manifest key `textures`. All of these are 1024×1024 unless noted.

| key | file | prompt |
|---|---|---|
| `grass` | `grass.jpg` | Seamless tileable top-down photo texture of a mown disc golf fairway: short healthy turf, mixed green blades with a few clover leaves and tiny brown patches, natural sunlight from directly above, no shadows, no vignette, evenly lit, photoreal, 1024×1024, tiles perfectly in both directions. |
| `grass_normal` | `grass_normal.png` | OpenGL tangent-space normal map generated from the previous grass texture, seamless, medium strength, blade-level detail, 1024×1024. |
| `bark` | `bark.jpg` | Seamless tileable texture of mature pine bark, deep vertical fissures, grey-brown plates with orange undertones, soft diffuse light, photoreal, 512×1024 (taller than wide), tiles vertically and horizontally. |
| `concrete` | `concrete.jpg` | Seamless tileable texture of a weathered concrete disc golf tee pad: broom-finished surface, light grey with subtle stains and a few dark speckles, faint dirt in the grooves, evenly lit, photoreal, 512×512. |
| `tuft` | `tuft.png` | A single clump of tall wild grass on a fully transparent background, 9 to 12 blades fanning upward, blades gradient from dark green base to yellow-green tips, photoreal, viewed straight from the side, no ground, no shadow, PNG with alpha, 512×512. |
| `water_normal` | `water_normal.png` | Seamless tileable OpenGL normal map of a calm pond surface with fine wind ripples and a few overlapping wavelets, low amplitude, 512×512. |

## 2. Course cards (`assets/courses/`)

Manifest key `courses`. 640×480 JPEG each. These replace the vector mini-maps on the course select screen and the home card.

| key | file | prompt |
|---|---|---|
| `pine` | `pine.jpg` | Aerial three-quarter view of a wooded disc golf course at midday: narrow mown fairways winding between tall pines and oaks, three small ponds, a yellow disc golf basket visible on one fairway, rich greens, soft haze in the distance, cinematic, photoreal, no text, 640×480. |
| `meadow` | `meadow.jpg` | Aerial three-quarter view of an open rolling-meadow disc golf course at golden hour: long wide fairways of yellow-green grass over gentle hills, scattered cedars, one pond, long warm shadows, low sun flare on the horizon, cinematic, photoreal, no text, 640×480. |
| `lake` | `lake.jpg` | Aerial three-quarter view of a lakeside disc golf course in cool morning light: fairways wrapping around five blue ponds, sandy shorelines, mixed trees, a basket on a small island green, mist on the water, cinematic, photoreal, no text, 640×480. |

## 3. Disc stamps (`assets/discs/`)

Manifest key `discs`. 512×512 PNG with alpha, circular design that fills the canvas. The game prints these on the top of each disc. Keep the centre clean because the flight-number text is drawn there.

| key | file | prompt |
|---|---|---|
| `driver` | `driver.png` | Circular hot-stamp foil artwork for a distance driver named VORTEX: a stylised swirling vortex in metallic silver and black on a transparent background, thin outer ring, aggressive, premium, vector style, 512×512, no text. |
| `fairway` | `fairway.png` | Circular hot-stamp artwork for a fairway driver named FALCON: minimalist falcon silhouette diving, metallic gold on transparent, thin outer ring, vector style, 512×512, no text. |
| `mid` | `mid.png` | Circular hot-stamp artwork for a midrange named MERIDIAN: clean compass-rose and latitude lines, metallic blue on transparent, thin outer ring, vector style, 512×512, no text. |
| `putter` | `putter.png` | Circular hot-stamp artwork for a putter named ANCHOR: bold anchor with a rope circle, matte black on transparent, thin outer ring, vector style, 512×512, no text. |

## 4. Avatar and people

The avatar is a procedural rig so it can wear any colour combination the player picks. Image assets that make it look better:

| key | file | prompt |
|---|---|---|
| `jersey_pattern` | `jersey_pattern.png` | Seamless tileable greyscale fabric weave for an athletic polyester jersey, fine mesh knit, very subtle, mid-grey average brightness so it can be tinted, 256×256. |
| `skin_normal` | `skin_normal.png` | Seamless tileable OpenGL normal map of fine skin pores, very low amplitude, 256×256. |

Store portraits for the lobby and scorecard (optional, manifest key `portraits`, 256×256 PNG, one per bot name: Ricky, Paige, Simon, Eagle, Calvin, Kristin): "Stylised 3D-rendered head-and-shoulders portrait of a disc golfer, [name-appropriate description], wearing a [colour] jersey and a cap, soft studio light, neutral dark background, friendly expression, game character art, 256×256."

## 5. Marketing and store

- App icon: "Flat app icon, a red disc golf disc seen from above with a white ring, sitting on a dark green circle, clean, no text, 1024×1024."
- Hero screenshot backplate (`assets/menu_bg.jpg`, key `ui.menu_bg`): "Wide cinematic shot of a disc golf fairway at golden hour, basket with chains in the mid-ground catching the light, shallow depth of field, no people, no text, 1920×1080."

## 6. Sounds (not image gen)

Codex image gen cannot make audio. Real recordings sound better than any synthesis. Sources with clear licences:

- freesound.org, search "disc golf chains", "disc golf basket", "frisbee throw", "disc hit tree". Filter to Creative Commons 0.
- Record your own with a phone at a local course: five chain hits from putt speed to driver speed, two band hits, a tray drop, a tree hit, a grass landing, a pond splash, a swing whoosh close to the mic.

Trim to the hit, normalise to −6 dBFS, export 44.1 kHz mono MP3 or OGG. Manifest key `sfx`, file names below. Any missing name keeps the synthesized version.

`whoosh`, `chains`, `chainout`, `band`, `thud`, `skip`, `tree`, `leaves`, `splash`, `roll`, `click`, `fanfare_ace`, `fanfare_eagle`, `fanfare_birdie`, `fanfare_par`, `bad`, `ambient` (a 30–60 s loopable outdoor bed: light wind, distant birds).

## Manifest

Create `assets/manifest.json` with only the entries you actually have:

```json
{
  "textures": { "grass": "textures/grass.jpg", "grass_normal": "textures/grass_normal.png", "bark": "textures/bark.jpg", "concrete": "textures/concrete.jpg", "tuft": "textures/tuft.png", "water_normal": "textures/water_normal.png" },
  "courses": { "pine": "courses/pine.jpg", "meadow": "courses/meadow.jpg", "lake": "courses/lake.jpg" },
  "discs": { "driver": "discs/driver.png", "fairway": "discs/fairway.png", "mid": "discs/mid.png", "putter": "discs/putter.png" },
  "sfx": { "chains": "sfx/chains.mp3", "band": "sfx/band.mp3", "tree": "sfx/tree.mp3", "thud": "sfx/thud.mp3", "splash": "sfx/splash.mp3", "whoosh": "sfx/whoosh.mp3", "ambient": "sfx/ambient.mp3" }
}
```

Paths are relative to `assets/`. `src/assets.js` reads the manifest once at boot; `src/audio.js` decodes the `sfx` entries on the first tap.

## One-shot prompt for a Codex session

Paste this into Codex with image generation enabled:

> Read docs/codex-asset-prompts.md in this repo. Generate every image in sections 1 to 3 with the exact prompts and sizes given, save them at the listed paths under assets/, then write assets/manifest.json listing the files you produced. Do not change any source file. Run `node serve.mjs`, open http://localhost:8093, and confirm in the browser console that there are no 404s for assets/.
