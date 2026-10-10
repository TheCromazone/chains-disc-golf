// Run in the ChainsUnity editor via the Unity CLI MCP server (tool: eval_file).
// Proves the FBX Exporter (com.unity.formats.fbx) path headlessly: instance the imported golfer rig,
// drive it with an AnimatorController holding one clip, export model+anim to ~/Documents/ChainsUnity/Exports.
// (Pipeline eval wrapper already imports System, System.Linq, UnityEngine, UnityEditor.)
const string src = "Assets/Chains/golfer_clips.fbx";
var clipName = "ChainsRig|celebrate";
var outDir = System.IO.Path.GetFullPath("Exports");
System.IO.Directory.CreateDirectory(outDir);
var outPath = System.IO.Path.Combine(outDir, "golfer_celebrate_unity.fbx");

var model = AssetDatabase.LoadAssetAtPath<GameObject>(src);
var clip = AssetDatabase.LoadAllAssetsAtPath(src).OfType<AnimationClip>().First(c => c.name == clipName);
var ctrl = UnityEditor.Animations.AnimatorController.CreateAnimatorControllerAtPathWithClip("Assets/Chains/celebrate.controller", clip);

var inst = (GameObject)PrefabUtility.InstantiatePrefab(model);
var animator = inst.GetComponent<Animator>() ?? inst.AddComponent<Animator>();
animator.runtimeAnimatorController = ctrl;

var opts = new UnityEditor.Formats.Fbx.Exporter.ExportModelOptions {
    ExportFormat = UnityEditor.Formats.Fbx.Exporter.ExportFormat.Binary,
    ModelAnimIncludeOption = UnityEditor.Formats.Fbx.Exporter.Include.ModelAndAnim,
};
var written = UnityEditor.Formats.Fbx.Exporter.ModelExporter.ExportObject(outPath, inst, opts);
UnityEngine.Object.DestroyImmediate(inst);
var len = written != null && System.IO.File.Exists(written) ? new System.IO.FileInfo(written).Length : -1;
return $"clip {clip.name} {clip.length:F2}s -> {written} ({len} bytes)";
