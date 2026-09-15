# Round 2 — reference-aware visual critique

## Scope and verdict

I reviewed only the nine requested screenshots. This is a fresh-context, reference-aware comparison, not a scientifically blind test: the reference games are identifiable. I did not inspect source code. Different aspect ratios and screenshot purposes limit direct layout comparisons.

**Candid winner: the Wii/Switch references, by a substantial margin.** CHAINS has a readable mobile interface and a promising friendly color palette. Its current character rendering, scene lighting, and screen composition still read as a prototype. Rounded cards alone do not produce the controlled character presentation and material finish of the references.

| Area | Biggest gap | Concrete correction | Winner |
| --- | --- | --- | --- |
| Character | The body reads as assembled primitives: bulbous pelvis, disconnected mitten-like hands, abrupt limb joints, faceted shading, and almost no clothing or shoe construction. The front inspection's enormous head and squat torso amplify this. | Keep a deliberately simple family-sports silhouette, but rebuild the transitions: tapered torso into shorts, rounded shoulder-to-sleeve connection, wrist cuffs, a thumb silhouette, and shoes with distinguishable upper and sole. Smooth the broad skin surfaces. Add soft key/fill lighting and a grounded contact shadow. Judge the same neutral pose from front and side before adding more outfit choices. | Switch clearly; Wii also has more coherent simplicity. |
| Face parts | The high-quality front inspection appears visibly misregistered: a curved line sits high on the forehead, a tiny mark is near the middle, and two short slanted strokes sit below it. It does not read as an intact face. The locker screenshot has recognizable eyes and a smile, so the two presentations are inconsistent. | Fix face-part placement/orientation in the high-quality render first. Establish one face coordinate frame and place paired eyes below paired brows, nose beneath the eye line, and mouth beneath the nose. Check every face preset at front and three-quarter view. Then strengthen intentional eye/brow shapes; do not use glossy bead eyes as the only facial identity. | Switch overwhelmingly. This is the first acceptance blocker. |
| Locker room | The player is dark and visually tangled with giant trees, while the editor covers the lower body. The reference gives the avatar a clean, evenly lit presentation area where the outfit and silhouette can be assessed. | Give customization a dedicated pale studio backdrop or strongly simplified, defocused scene. Use a frontal soft light. Reserve a stable full-body preview area and let the controls occupy a separate region; when editing face parts, deliberately switch to a well-lit head close-up. | Switch clearly. CHAINS' tabs are legible, but the preview fails its main job. |
| HUD | The interface consumes the play view: top cards, a four-button rail, five throwing modes, four disc choices, and an oversized bottom gesture panel compete with a tiny player and distant target. The Wii screenshot lets the course and shot dominate. | Collapse the current throw/disc into two compact controls that open temporary selectors. Reduce the gesture instruction to a short bottom cue that fades after use. Give the recovered vertical space to the player-to-target corridor. Keep distance and power prominent and remove duplicate hole/par labels. | Wii for gameplay composition. The supplied Switch golf screenshot has no comparable HUD, so I cannot claim a direct Switch HUD comparison. |
| Clubhouse | There is no convincing focal stage: the avatar is dim, small, and partly swallowed by the panel; enormous repetitive trees fill the hero region. The photographic course card introduces an unrelated visual language beside the simple 3D scene. | Stage a larger, fully readable player on a compact tee platform with soft light and contact shadow, framed by fewer trees. Keep Play round dominant, move setup options into one secondary section, and replace the photographic course thumbnail with an in-engine course view that matches the scene. | Switch for avatar/menu presentation. The supplied references do not show a directly equivalent clubhouse screen. |

## What already works

- The coral primary action is easy to find in both menus.
- Navy text on pale panels is generally readable at the provided mobile size.
- Locker-room categories and eye thumbnails make the customization model understandable.
- The course corridor is legible despite the HUD crowding it.

## Priority for the next revision

1. Repair and verify the high-quality face rendering. A malformed face invalidates any claim of premium character finish.
2. Fix avatar lighting and presentation in the actual locker and clubhouse screens. The inspection and product screens should look like the same asset under compatible lighting.
3. Simplify gameplay controls to restore a useful play viewport.
4. Refine body transitions, shoes, hands, and material response. The model does not need Switch-level detail, but it does need deliberate construction.

These are visual observations and proposed corrections, not source-level diagnoses. A screenshot cannot establish why the face differs between the inspection and locker screens, nor verify animation quality or touch usability.
