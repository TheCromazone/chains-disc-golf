// Run in the ChainsUnity editor via the Unity CLI MCP server (tool: eval_file).
// Imports Assets/Chains/golfer_clips.fbx (Blender export of golfer.glb + walk/celebrate/slump),
// tries Mecanim Humanoid, and reports whether Unity can build a human Avatar for the 11-joint rig.
// eval_file body: the Pipeline wrapper already imports System, System.Linq, UnityEngine, UnityEditor.

var sb = new System.Text.StringBuilder();
const string path = "Assets/Chains/golfer_clips.fbx";
AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

var imp = (ModelImporter)AssetImporter.GetAtPath(path);
sb.AppendLine("importer: " + (imp != null));

// 1) Generic import: what bones and clips does Unity see?
imp.animationType = ModelImporterAnimationType.Generic;
imp.SaveAndReimport();
var all = AssetDatabase.LoadAllAssetsAtPath(path);
var clips = all.OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).ToArray();
sb.AppendLine("generic clips: " + string.Join(", ", clips.Select(c => $"{c.name} {c.length:F2}s {AnimationUtility.GetCurveBindings(c).Length} curves")));
var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
var smr = go.GetComponentsInChildren<SkinnedMeshRenderer>(true);
var bones = smr.SelectMany(s => s.bones).Where(b => b != null).Select(b => b.name).Distinct().ToArray();
sb.AppendLine($"skinned meshes: {smr.Length}, bones: {string.Join(" ", bones)}");

// 2) Humanoid: let Unity auto-map the rig.
imp.animationType = ModelImporterAnimationType.Human;
imp.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
imp.SaveAndReimport();
var avatar = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Avatar>().FirstOrDefault();
sb.AppendLine($"humanoid avatar: exists={avatar != null} isValid={avatar && avatar.isValid} isHuman={avatar && avatar.isHuman}");
var hd = imp.humanDescription;
sb.AppendLine("auto-mapped human bones: " + (hd.human == null ? "none" :
    string.Join(", ", hd.human.Select(h => h.humanName + "=" + h.boneName))));
var required = HumanTrait.BoneName.Where((n, i) => HumanTrait.RequiredBone(i)).ToArray();
sb.AppendLine($"Unity requires {required.Length} human bones: {string.Join(", ", required)}");

// Leave the asset as Generic so later FBX exports work.
imp.animationType = ModelImporterAnimationType.Generic;
imp.SaveAndReimport();
return sb.ToString();
