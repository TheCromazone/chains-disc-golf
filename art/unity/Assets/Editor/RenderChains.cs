using System;
using System.IO;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.Rendering;

// Offline art renderer. This project is never part of the web runtime.
public class RenderChains {
 [Serializable] public class Pack { public Course[] courses; }
 [Serializable] public class Definition { public float[] sun; public string sunColor; public float pine; }
 [Serializable] public class Tree { public float x,y,z,h,fr,fy; }
 [Serializable] public class Pond { public float x,z,rx,rz,level; }
 [Serializable] public class Hole { public float[] tee,basket; public float teeY,basketY; }
 [Serializable] public class Course { public string id; public Definition def; public float[] heights; public Tree[] trees; public Pond[] ponds; public Hole[] holes; }
 static string root;
 static Color Hex(string h) { Color c; ColorUtility.TryParseHtmlString(h,out c); return c; }
 static Material Mat(Color c,float gloss=0) { var m=new Material(Shader.Find("Standard"));m.color=c;m.SetFloat("_Glossiness",gloss);return m; }
 static GameObject Primitive(PrimitiveType type,Vector3 p,Vector3 scale,Material m) {var g=GameObject.CreatePrimitive(type);g.transform.position=p;g.transform.localScale=scale;g.GetComponent<Renderer>().sharedMaterial=m;UnityEngine.Object.DestroyImmediate(g.GetComponent<Collider>());return g;}
 static Vector3 Pos(float[] p,float y) {return new Vector3(p[0],y,p[1]);}
 public static void Run() {
  root=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
  var pack=JsonUtility.FromJson<Pack>(File.ReadAllText(Path.Combine(Application.dataPath,"courses.json")));
  QualitySettings.shadowDistance=250;QualitySettings.shadows=ShadowQuality.All;QualitySettings.shadowResolution=ShadowResolution.VeryHigh;QualitySettings.antiAliasing=4;
  foreach(var c in pack.courses) Render(c);
  Debug.Log("CHAINS_UNITY_RENDER_COMPLETE");
 }
 static void Render(Course c) {
  EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
  var sun=new GameObject("Sun").AddComponent<Light>();sun.type=LightType.Directional;sun.color=Hex(c.def.sunColor);sun.intensity=c.id=="meadow"?1.6f:1.3f;sun.shadows=LightShadows.Soft;sun.transform.rotation=Quaternion.Euler(c.def.sun[0],c.def.sun[1],0);RenderSettings.sun=sun;
  var sky=new Material(Shader.Find("Skybox/Procedural"));sky.SetFloat("_SunSize",.035f);sky.SetFloat("_AtmosphereThickness",c.id=="meadow"?1.55f:1.05f);sky.SetColor("_SkyTint",c.id=="meadow"?new Color(.57f,.48f,.42f):new Color(.45f,.52f,.6f));sky.SetFloat("_Exposure",1.15f);RenderSettings.skybox=sky;RenderSettings.ambientMode=AmbientMode.Trilight;RenderSettings.ambientSkyColor=new Color(.42f,.5f,.58f);RenderSettings.ambientEquatorColor=new Color(.30f,.35f,.28f);RenderSettings.ambientGroundColor=new Color(.12f,.15f,.09f);
  RenderSettings.fog=true;RenderSettings.fogMode=FogMode.Exponential;RenderSettings.fogDensity=.0035f;RenderSettings.fogColor=c.id=="meadow"?new Color(.72f,.61f,.43f):new Color(.63f,.74f,.82f);
  var camera=new GameObject("Art camera").AddComponent<Camera>();camera.allowHDR=true;camera.farClipPlane=1800;camera.nearClipPlane=.1f;camera.clearFlags=CameraClearFlags.Skybox;
  // Sky-only HDR equirectangular map, authored separately from the course card.
  var cube=new RenderTexture(512,512,24,RenderTextureFormat.ARGBHalf);cube.dimension=TextureDimension.Cube;cube.Create();
  camera.RenderToCubemap(cube,63);var eq=new RenderTexture(1024,512,0,RenderTextureFormat.ARGBHalf);eq.Create();cube.ConvertToEquirect(eq,Camera.MonoOrStereoscopicEye.Mono);
  RenderTexture.active=eq;var hdr=new Texture2D(1024,512,TextureFormat.RGBAHalf,false,true);hdr.ReadPixels(new Rect(0,0,1024,512),0,0);hdr.Apply();
  File.WriteAllBytes(Path.Combine(root,"assets/skies/"+c.id+".exr"),hdr.EncodeToEXR(Texture2D.EXRFlags.CompressZIP));RenderTexture.active=null;cube.Release();eq.Release();UnityEngine.Object.DestroyImmediate(hdr);
  var verts=new Vector3[105*81];var uv=new Vector2[verts.Length];var colors=new Color[verts.Length];var tris=new int[104*80*6];
  for(int z=0;z<81;z++)for(int x=0;x<105;x++){int i=z*105+x;verts[i]=new Vector3(-260+x*5,c.heights[i],-200+z*5);uv[i]=new Vector2(x*.18f,z*.18f);colors[i]=Color.white;}
  int k=0;for(int z=0;z<80;z++)for(int x=0;x<104;x++){int i=z*105+x;tris[k++]=i;tris[k++]=i+105;tris[k++]=i+1;tris[k++]=i+1;tris[k++]=i+105;tris[k++]=i+106;}
  var mesh=new Mesh();mesh.vertices=verts;mesh.uv=uv;mesh.triangles=tris;mesh.RecalculateNormals();var ground=new GameObject("Course terrain");ground.AddComponent<MeshFilter>().sharedMesh=mesh;
  var gm=Mat(c.id=="meadow"?new Color(.68f,.67f,.38f):new Color(.44f,.58f,.32f));var grass=new Texture2D(2,2);grass.LoadImage(File.ReadAllBytes(Path.Combine(root,"assets/textures/grass.jpg")));grass.wrapMode=TextureWrapMode.Repeat;gm.mainTexture=grass;ground.AddComponent<MeshRenderer>().sharedMaterial=gm;
  var bark=Mat(new Color(.24f,.16f,.09f));var foliage=Mat(c.id=="meadow"?new Color(.45f,.49f,.17f):new Color(.18f,.35f,.15f));
  var h=c.holes[0];var focal=Pos(h.basket,h.basketY);int count=0;
  foreach(var t in c.trees){if(Vector3.Distance(new Vector3(t.x,t.y,t.z),focal)>185)continue;Primitive(PrimitiveType.Cylinder,new Vector3(t.x,t.y+t.h*.5f,t.z),new Vector3(.5f,t.h*.5f,.5f),bark);
   for(int j=0;j<3;j++)Primitive(PrimitiveType.Sphere,new Vector3(t.x+Mathf.Sin(j*2.4f)*.6f,t.y+t.fy+j*.8f,t.z+Mathf.Cos(j*2.4f)*.6f),new Vector3(t.fr*1.7f,t.fr*1.3f,t.fr*1.7f),foliage);count++;}
  var water=Mat(c.id=="meadow"?new Color(.30f,.44f,.43f):new Color(.17f,.40f,.54f),.95f);water.SetFloat("_Metallic",.35f);
  foreach(var p in c.ponds)Primitive(PrimitiveType.Cylinder,new Vector3(p.x,p.level,p.z),new Vector3(p.rx*2.5f,.02f,p.rz*2.5f),water);
  var steel=Mat(new Color(.63f,.67f,.7f),.7f);steel.SetFloat("_Metallic",.8f);var yellow=Mat(new Color(1,.7f,.03f),.5f);
  // Foreground tournament basket, with twenty visible chain strands.
  Vector3 bp=focal;Primitive(PrimitiveType.Cylinder,bp+Vector3.up*.75f,new Vector3(.055f,.75f,.055f),steel);
  Primitive(PrimitiveType.Cylinder,bp+Vector3.up*1.4f,new Vector3(.58f,.05f,.58f),yellow);
  Primitive(PrimitiveType.Cylinder,bp+Vector3.up*.64f,new Vector3(.7f,.015f,.7f),steel);
  for(int i=0;i<20;i++){float a=i*Mathf.PI*.1f;var top=bp+new Vector3(Mathf.Cos(a)*.24f,1.34f,Mathf.Sin(a)*.24f);var bottom=bp+new Vector3(Mathf.Cos(a)*.06f,.8f,Mathf.Sin(a)*.06f);var chain=Primitive(PrimitiveType.Cylinder,(top+bottom)/2,new Vector3(.011f,(top-bottom).magnitude*.5f,.011f),steel);chain.transform.up=(top-bottom).normalized;}
  Vector3 d=(Pos(h.basket,0)-Pos(h.tee,0)).normalized;Vector3 r=Vector3.Cross(Vector3.up,d);
  camera.transform.position=focal+d*8+r*3+Vector3.up*3.4f;camera.transform.LookAt(focal-d*18+Vector3.up*2);camera.fieldOfView=58;
  var target=new RenderTexture(1280,960,24,RenderTextureFormat.ARGB32);target.antiAliasing=4;target.Create();camera.targetTexture=target;camera.Render();RenderTexture.active=target;var card=new Texture2D(1280,960,TextureFormat.RGB24,false);card.ReadPixels(new Rect(0,0,1280,960),0,0);card.Apply();File.WriteAllBytes(Path.Combine(root,"assets/courses/"+c.id+"_unity.jpg"),card.EncodeToJPG(90));camera.targetTexture=null;RenderTexture.active=null;target.Release();UnityEngine.Object.DestroyImmediate(card);
  EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(),"Assets/"+c.id+".unity");Debug.Log("CHAINS_CARD "+c.id+" trees="+count);
 }
}
