# Unreal 5.8 MCP + MetaHuman faces for Chains (2026-10-10)

## MCP server
- `http://127.0.0.1:8000/mcp` (Epic's experimental ModelContextProtocol plugin), registered in Claude Code as `unreal` (user scope).
- Project `~/Documents/ChainsUnreal`; auto-start via `Config/DefaultEditorPerProjectUserSettings.ini`
  `[/Script/ModelContextProtocolEngine.ModelContextProtocolSettings] bAutoStartServer=True`.
- Launch: `UnrealEditor ~/Documents/ChainsUnreal/ChainsUnreal.uproject -nosound -nosplash -unattended` (GPU + window works since the
  Metal Toolchain 27A266a was installed; first launch 25 s, 984 shaders in ~11 s). `-unattended` turns hidden modal dialogs
  (e.g. "overwrite asset?") into failures instead of a hung game thread, which also stops the MCP server answering.
- `tools/list` → `list_toolsets`, `describe_toolset`, `call_tool`; 28 toolsets. Client: `art/unreal/mcp.mjs`
  (`info | list | toolsets | describe <ts> | call <tool> '<json>' | ct <ts> <tool> '<json>'`).
- Project `Content/Python/init_unreal.py` force-registers the MetaHuman toolset (the engine's refuses without Core Data) and runs a
  small job runner: any `.py` in `~/Documents/ChainsUnreal/Saved/PyJobs` is executed (client `art/unreal/uepy.mjs`).

## Gotchas
- `set_skin_tone` with lightness < 0.5 crashes the editor (engine bug, missing MetaHuman Creator Core Data).
- FBX export crashed the headless editor; glTF works. After a crash the crash reporter holds port 8000: kill it, `scripts/restart_mcp.py`.

## License
No MetaHuman license text ships with the install. Per Epic's public pages, since 5.6 MetaHumans fall under the standard UE EULA and may be
used in any engine (non-engine product: no royalty; seat rule for companies over $1M/yr; no AI training). Read the EULA wording on shipping
the assets before release.

## MetaHuman steps
| Step | Result |
|---|---|
| create, begin/end edit, body shape, eye colour (MCP) | works offline |
| skin tone (MCP) | lightness ≥ 0.5 only |
| face shape | editor Python landmark sculpting (`scripts/mh_lib.py`, `scripts/sculpt_four.py`) |
| presets / blending | blocked: need Core Data; blending not exposed to Python |
| texture synthesis | blocked: needs "MetaHuman Creator Core Data" (Epic Games Launcher, signed in); then offline at 1024 |
| high-res textures, face auto-rig, assembly | Epic cloud + MetaHuman EULA + login; not attempted |
| geometry export (glTF) | works offline |

Heads: `metahumans/Chains_{M1,M2,F1,F2}/Chains_*_head_lod{0,2,3,4}.glb` (LOD0 48k skin tris, LOD2 12k, LOD3 5k, LOD4 2.6k);
previews `metahumans/preview_all_lod0.jpg`, `ue_capture_heads.png`. The game head's face region is 581 vertices and ~190×190 px of
the 2048 body texture.

## Bake prototype
`bake/compare_M1.jpg`: M1's shape as a morph on the game's male head + re-baked normals (2.1 mm fit). It reads as a different person
without seams, but the scanned skin texture doubles the lower lip and smooths the skin: it needs a matching texture bake (Core Data).

## Files kept locally
The head and morph models (`*.glb`, ~25 MB), the baked normal map and full-size previews stay on the Mac mini (see `.gitignore`);
re-create them with `scripts/make_metahumans_mcp.sh`, `scripts/sculpt_four.py`, `blender/render_heads.py` and `blender/bake_face_prototype.py`.

## Recommendation
No-go with what is on this Mac today. Conditional go once "MetaHuman Creator Core Data" is installed: give the face its own 512² tile in
`tools/build-golfer-v3.py`, bake each MetaHuman's texture into it and its shape into a ~3.5 KB morph (40–90 KB per face, <1 MB for 8,
no extra draw calls). One-day spike on two faces first; 6–8 faces ≈ 5–7 working days.
