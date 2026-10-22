# Unreal 5.8 + Unity 6.6 on the Windows PC (2026-10-12)

Follows `REPORT.md` (the Mac pass) and `../unity/REPORT.md`. Nothing in `src/` changed.

## What each engine can give Chains, ranked by visible impact
| # | Contribution | Engine | Status | Cost |
|---|---|---|---|---|
| 1 | MetaHuman faces for the two athletes (Blender has no equivalent) | Unreal | blocked on owner step 1 | ~1 day for a two-face spike; 5-7 days for 6-8 faces |
| 2 | Volumetric-cloud sky panorama per course, lit by each course's own sun | Unreal | works now: `scripts/sky_panorama.py` renders all four in ~4 s; previews `evidence/windows/sky/*.jpg` | own cloud material 3-4 h, then a `src` task of 2-3 h to use it in `skyDome()` |
| 3 | Facial expressions as face morphs | Unreal | after #1; needs the owner's Epic sign-in for MetaHuman's cloud face rig | 1-2 days |
| 4 | Mocap retargeting with the IK Retargeter onto an extended rig | Unreal | untested | 2-3 days, only with mocap the game may ship |
| 5 | Unity AI text-to-motion | Unity | blocked: `com.unity.ai.generators` 1.7.0-pre.1 fails to compile on 6000.6.0f1 (3 obsolete-API errors); removed again. Evidence `../unity/evidence/unity-ai-gate-windows.txt` | - |

Not worth it: Unreal's impostor baker (Blender already bakes the tree impostors), lightmap baking (courses are built at runtime), Unity's render pipelines.

## Owner to-do
1. Epic Games Launcher -> Library -> 5.8 -> the arrow next to Launch -> Options -> tick "MetaHuman Creator Core Data" (5.75 GiB) -> Apply. Unblocks #1.
2. For #3: sign in to Epic inside the Unreal editor when MetaHuman asks for cloud services.
3. Before release: read Epic's licence terms on shipping rendered images and MetaHuman assets in a non-Unreal game (the licence page returned HTTP 403 to the agent).
4. Optional, Unity AI: upgrade to 6000.6.5f1 in Unity Hub (untested whether the package compiles there), accept the editor and Unity AI terms, enable AI Generators for the organisation in the Unity Dashboard, get points.
5. Start the editor before using either MCP (commands below).

## Unreal set-up
- MCP `http://127.0.0.1:8000/mcp`, registered as `unreal` (user scope). Project `C:\Users\matth\Documents\ChainsUnreal` (local disk, not OneDrive); descriptor and config copied in `project/`; the server auto-starts from `DefaultEditorPerProjectUserSettings.ini`.
- Launch: `"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe" C:\Users\matth\Documents\ChainsUnreal\ChainsUnreal.uproject -nosound -nosplash -unattended -NoLiveCoding`; the MCP answers ~20 s later.
- `tools/list` returns 3 meta-tools over 52 toolsets; `SearchCVars` and `get_execution_environment` verified. No MetaHuman toolset until Core Data is installed.
- The Python job runner (`scripts/init_unreal.py`, used by `uepy.mjs`) was missing from the repo and was recreated.
- With the editor minimised, `CaptureViewport` returns "Viewport has zero size": render through a scene capture instead.

## MetaHuman Core Data
Launcher install option `metahuman_content`: 1,816 files, 5.75 GiB, all under `MetaHumanCharacter/Content/Optional/`, which is absent, so not installed (1.2 TB free). Once installed, `REPORT.md`'s "Conditional go" plan runs offline.

## Sky renders
- 4096x2048 HDR per course, kept local in `ChainsUnreal/Saved/Sky`; JPEG previews tone-mapped by `blender/hdr_preview.py`.
- Axes: Unreal +X is the game's +z (hole 1's direction); positive azimuth is Unreal -Y.
- Gotcha: clouds render empty unless the scene capture has `always_persist_rendering_state` on and captures repeatedly.
- Shipped (sky pass): `scripts/cloud_material.py` builds our own cloud material (one Custom node of our HLSL noise, no engine cloud content); `sky-render.sh` renders all four courses through `scripts/sky_panorama.py` and `tools/sky-webp.py` into `assets/skies/*.webp`, which `skyDome()` draws. Close the editor after a batch.
- Gotchas: a cloud material needs `used_with_volumetric_cloud` (else the capture is black); unrolled noise loops take minutes per shader permutation; recompiling the material while the cloud draws it crashed the renderer; cube render targets clamp to 2048 a face; `r.VolumetricCloud.HighQualityAerialPerspective 1` trips an RDG ensure in captures.

## Unity
- Unity CLI 1.0.0-beta.8, already signed in by the owner, Personal licence. `unity pipeline install` added `com.unity.pipeline` 0.8.0-exp.1; the MCP lists 160 tools; registered as `unity` (user scope).
- Batch launch: `"C:\Program Files\Unity\Hub\Editor\6000.6.0f1\Editor\Unity.exe" -batchmode -projectPath C:\Users\matth\Documents\ChainsUnity`. `unity close` does not find the batch editor on Windows: end the process.
- Unity AI's gates are server-side (terms, AI Generators enabled for the organisation, a points balance). `../unity/mcp/unity_ai_state.cs` reads them without changing anything, once the package compiles.
