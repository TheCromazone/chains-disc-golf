# Unity 6.6 + MCP for Chains (2026-10-10)

## MCP server: Unity CLI `unity mcp` (com.unity.pipeline 0.8.0-exp.1)
- Unity's supported server (the AI Assistant package's MCP is deprecated in favour of the CLI). Free, no AI subscription, 127.0.0.1 only.
- CLI 1.0.0-beta.12 at `~/.unity/bin/unity` (already signed in). Project: `~/Documents/ChainsUnity` (audio off: AudioManager `m_DisableAudio: 1`;
  manifest adds `com.unity.pipeline` 0.8.0-exp.1 and `com.unity.formats.fbx` 5.1.6).
- The windowed editor is blocked by a "Unity Editor Software Terms" dialog for 6000.6.5f1 (not accepted on the user's behalf), so the
  editor runs in batch mode:
  `open -g -n -a /Applications/Unity/Hub/Editor/6000.6.5f1/Unity.app --args -batchmode -projectPath ~/Documents/ChainsUnity -logFile ~/Documents/ChainsUnity/Logs/editor-batch.log`
  Stop: `~/.unity/bin/unity close ~/Documents/ChainsUnity`.
- Register for Claude Code (stdio):
  `claude mcp add --scope user --transport stdio unity -- /Users/matthewcromaz/.unity/bin/unity mcp --project-path /Users/matthewcromaz/Documents/ChainsUnity`
- Verified with `art/unity/mcp/mcp_list_tools.py`: 160 tools (schemas in `art/unity/mcp/tools.json`); editor_status, console, eval, eval_file work.

## Unity AI (Animation generator): not available
Needs the editor terms dialog accepted, a Unity Hub sign-in (logs: "Access token is unavailable"), the Unity AI terms and paid Unity
Credits (~5 per text-to-motion clip); the local license is Personal + Asset Store only. Nothing was accepted, signed in or bought.
Evidence: `art/unity/evidence/unity-ai-gate.txt`.

## Does Unity beat Blender for Chains? No
- Humanoid retargeting fails on the game rig: ChainsRig has 11 joints (`root hipL knL hipR knR spine head shL elL shR elR`), no
  feet/hands/neck/chest (Unity needs 15), and the auto-mapper swapped left/right.
- FBX round trip Blender → Unity → FBX Exporter → Blender works (max joint drift 0.33 cm) but adds nothing without Unity AI.
- Render pipelines, VFX Graph, Shader Graph don't carry over to three.js; light baking is no better than Cycles.

## Recommendation
Keep animation in Blender; extending the rig (feet, hands, neck, chest) is what would unlock better motion and clean mocap
retargets. Players teleporting between lies is a code change: `assets/models/golfer-walk.glb` already has a 1 s walk loop.
Files: `art/unity/mcp/*` (client, tool schemas, humanoid + FBX tests), `art/unity/blender/*` (GLB→FBX, round-trip check).
