# UI reference retrieval — 14 September 2026

Fetched both requested 21st.dev components using the installed 21st connector. Search resolved the exact authors and demo IDs; `get_component` returned source and usage successfully for **12460** (jahed, Apple Tahoe Liquid Glass Button) and **3206** (designali-in, Liquid Glass Card). Their official preview images are saved in `references/` and were visually inspected before implementation.

- [Apple Tahoe Liquid Glass Button](https://21st.dev/@jahed/components/apple-tahoe-liquid-glass-button): layered rim lighting, separate label layer, smooth backdrop and inset shadow stack. Source implements an additional SVG/WebGL displacement renderer.
- [Liquid Glass Card](https://21st.dev/@designali-in/components/liquid-glass-card): subtle rim and inset highlights, translucent surface; source uses SVG turbulence and displacement.
- [Switch Sports gallery](https://miiwiki.org/wiki/Nintendo_Switch_Sports/gallery): gallery text fetched, including Mii character menus. Subsequently visually inspected `references/switch-menu.png` and `references/switch-creator.jpg` downloaded by the parent task: cyan selection colour, soft white surfaces and strong preview/control separation informed the implementation.
- [Refero screen one](https://refero.design/screens/db9db4b0-a790-401a-a581-feafc1780cfd) and [screen two](https://refero.design/screens/5ff8fe29-b0a0-4aed-8b3c-0e2667715076): both web fetches returned non-retryable safe-open errors. These images are **not claimed as viewed**.

## Implementation decisions

Native CSS recreates the surface properties with backdrop blur/saturation, translucent gradients, white specular rims and layered inset shadows. It does not transplant the React or second WebGL renderer; the game already owns a WebGL context and has a strict Lite budget. This is an original CSS adaptation, not a copied component. Keep every existing local SVG icon, dialog, identifier, storage key and message contract. Rounded rectangular controls and coral primary actions establish the sports menu hierarchy.

The prior screenshots `07-ui-after.png`, `07-locker.png` and `07-hud.png` are the before evidence for clubhouse, locker and HUD respectively. The parent capture harness records the after states and all six viewports. Physical Android and iPhone frame rates remain owed. Blind comparison wins require the separate critic's recorded result.

## Build handoff

- `e3396b5`: glass clubhouse foundation and retrieved references.
- `bb66dff`: live-preview locker tray, keyboard-operable category tabs, face-part tabs and visual cards, colour grids. Existing avatar fields remain; face options are supplied by the character module. Choice glyphs are illustrative and the live figure remains authoritative.
- `1b1b6ad`: compact white/cyan glass HUD, selected equipment states, outlined cheerful toast and corrected white course-card title.
- `node --check src/ui.js` passed. Browser clubhouse visually inspected after live integration. Parent owns full viewport audit and fresh critic loop; these are not claimed complete by the UI builder.
