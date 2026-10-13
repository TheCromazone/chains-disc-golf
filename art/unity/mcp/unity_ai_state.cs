// Read-only dump of the Unity AI account gates (com.unity.ai.toolkit Account states): sign-in, cloud project link, org settings
// (AI Generators enabled, terms of service accepted), points balance. Nothing is accepted or bought.
// Run through the Unity MCP eval tool, this file JSON-escaped as the "code" argument:
//   python -I art/unity/mcp/mcp_list_tools.py --call eval '{"code": "...", "timeout": 20000}' -- unity mcp --project-path <ChainsUnity>
// Needs com.unity.ai.generators to compile first (it does not on 6000.6.0f1: art/unity/evidence/unity-ai-gate-windows.txt).
System.Type acc = null;
foreach (var a in System.AppDomain.CurrentDomain.GetAssemblies())
{
    acc = a.GetType("Unity.AI.Toolkit.Accounts.Services.Account");
    if (acc != null) break;
}
if (acc == null) return "com.unity.ai.toolkit not loaded (package missing or not compiled yet)";
var sb = new System.Text.StringBuilder();
foreach (var f in acc.GetFields())
{
    var st = f.GetValue(null);
    foreach (var p in st.GetType().GetProperties())
    {
        if (p.GetIndexParameters().Length > 0 || p.PropertyType.IsSubclassOf(typeof(System.Delegate))) continue;
        object v;
        try { v = p.GetValue(st); } catch (System.Exception e) { v = "<" + e.GetType().Name + ">"; }
        var s = v == null ? "null" : (v is string || v.GetType().IsPrimitive || v.GetType().IsEnum) ? v.ToString() : UnityEngine.JsonUtility.ToJson(v);
        if (string.IsNullOrEmpty(s) || s == "{}") s = v?.ToString();
        sb.Append(f.Name).Append('.').Append(p.Name).Append(" = ").Append(s).Append('\n');
    }
}
return sb.ToString();
