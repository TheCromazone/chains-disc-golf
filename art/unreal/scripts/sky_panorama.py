# Offline sky backdrop spike: UE's physical SkyAtmosphere + VolumetricCloud lit by each course's sun, captured to an HDR cube and
# exported as an equirect .hdr (~/Documents/ChainsUnreal/Saved/Sky/<course>.hdr; preview with art/unreal/blender/hdr_preview.py).
# Run in the ChainsUnreal editor (OpenWorld start-up map) with: node art/unreal/uepy.mjs art/unreal/scripts/sky_panorama.py
# Two phases so the atmosphere LUTs, sky light and cloud history settle between them: the first run sets the scene up,
# the second (any later run) captures and exports.
# Axes: UE +X = the game's +z (hole 1's direction from the tee), UE -Y = the game's screen-left (positive azimuth).
import unreal, math, os, json

OUT = os.path.join(os.path.expanduser("~"), "Documents", "ChainsUnreal", "Saved", "Sky")
# course id: (disc elevation, disc azimuth) from src/course.js COURSES[].sun[2], sun[3]
COURSES = {"pine": (12, 10), "meadow": (10, 22), "lake": (11, 26), "bluff": (12, 24)}
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)


def actors(cls):
    return [a for a in EAS.get_all_level_actors() if isinstance(a, cls)]


def sun_rotator(elev, azim):
    e, a = math.radians(elev), math.radians(azim)
    to_sun = (math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), math.sin(e))
    fwd = [-c for c in to_sun]
    return unreal.Rotator(roll=0.0, pitch=math.degrees(math.asin(fwd[2])), yaw=math.degrees(math.atan2(fwd[1], fwd[0])))


def setup():
    for cls in (unreal.Landscape, unreal.LandscapeStreamingProxy, unreal.StaticMeshActor):
        for a in actors(cls):
            a.set_is_temporarily_hidden_in_editor(True)
            a.set_actor_hidden_in_game(True)
    cap = actors(unreal.SceneCaptureCube)
    if not cap:
        cap = [EAS.spawn_actor_from_class(unreal.SceneCaptureCube, unreal.Vector(0, 0, 200))]
    rt = unreal.AssetToolsHelpers.get_asset_tools().create_asset("RT_SkyCube", "/Game/Sky", unreal.TextureRenderTargetCube, unreal.TextureRenderTargetCubeFactoryNew()) \
        if not unreal.EditorAssetLibrary.does_asset_exist("/Game/Sky/RT_SkyCube") else unreal.load_asset("/Game/Sky/RT_SkyCube")
    rt.set_editor_property("size_x", 2048)
    rt.set_editor_property("hdr", True)
    comp = cap[0].get_component_by_class(unreal.SceneCaptureComponentCube)
    comp.set_editor_property("texture_target", rt)
    comp.set_editor_property("capture_every_frame", False)
    comp.set_editor_property("always_persist_rendering_state", True)   # volumetric clouds need view history between captures
    return "setup"


def capture():
    os.makedirs(OUT, exist_ok=True)
    sun = actors(unreal.DirectionalLight)[0]
    cloud = actors(unreal.VolumetricCloud)
    comp = actors(unreal.SceneCaptureCube)[0].get_component_by_class(unreal.SceneCaptureComponentCube)
    rt = comp.get_editor_property("texture_target")
    comp.set_editor_property("always_persist_rendering_state", True)   # without view history the clouds render empty
    done = {}
    for cid, (elev, azim) in COURSES.items():
        sun.set_actor_rotation(sun_rotator(elev, azim), False)
        for _ in range(16):  # ponytail: repeated captures let the cloud and sky-light history converge; tick the world if it ever looks noisy
            comp.capture_scene()
        path = os.path.join(OUT, f"{cid}.hdr")
        task = unreal.AssetExportTask()
        task.set_editor_property("object", rt)
        task.set_editor_property("filename", path)
        task.set_editor_property("automated", True)
        task.set_editor_property("prompt", False)
        task.set_editor_property("replace_identical", True)
        task.set_editor_property("exporter", unreal.RenderTargetCubeExporterHDR())
        ok = unreal.Exporter.run_asset_export_task(task)
        done[cid] = {"ok": ok, "bytes": os.path.getsize(path) if os.path.exists(path) else 0, "sun": [elev, azim], "clouds": len(cloud)}
    return done


RESULT = capture() if unreal.EditorAssetLibrary.does_asset_exist("/Game/Sky/RT_SkyCube") and actors(unreal.SceneCaptureCube) else setup()
