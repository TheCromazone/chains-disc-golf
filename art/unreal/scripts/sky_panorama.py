# Sky panoramas for the game's dome: UE's physical SkyAtmosphere + VolumetricCloud with our own cloud material
# (cloud_material.py, /Game/Sky/MI_ChainsCumulus), lit by each course's sun, captured to an HDR cube and exported as an
# equirect .hdr (~/Documents/ChainsUnreal/Saved/Sky/<course>.hdr); tools/sky-webp.py turns those into the game's WebPs.
# Run in the ChainsUnreal editor (OpenWorld start-up map) through art/unreal/uepy.mjs, two jobs per course so the
# atmosphere LUTs, the real-time sky light and the clouds settle on the new sun between them:
#   node art/unreal/uepy.mjs job.py   with job.py:  SKY = "prep:pine"; exec(open(r"<repo>/art/unreal/scripts/sky_panorama.py").read())
#   then the same with SKY = "shoot:pine". art/unreal/sky-render.sh drives all four courses and the WebP step.
# No sun disc in the render (the game's dome draws its own disc and glow); the camera sits 2 m up on the planet.
# Axes: UE +X = the game's +z (hole 1's direction from the tee), UE -Y = the game's +x (positive azimuth). In the exported
# equirect u = .75 - azimuth / 360, top row = zenith.
import unreal, math, os

OUT = os.path.join(os.path.expanduser("~"), "Documents", "ChainsUnreal", "Saved", "Sky")
# id: disc elevation and azimuth (src/course.js COURSES[].sun[2], sun[3]), sunColor, cloud coverage, seed (which sky)
COURSES = {"pine": (12, 10, "#ffe4cc", .37, 1.), "meadow": (10, 22, "#ffdcae", .40, 2.), "lake": (11, 26, "#fff2e0", .34, 3.), "bluff": (12, 24, "#fff4e4", .39, 4.)}
SIZE = 2048                  # cube face, the most a cube render target takes (4096 is clamped back); the export is 4096x2048
MIE = .002                   # SkyAtmosphere Mie scattering scale (default .004)
LAYER = (1.4, 2.8)           # cloud base and layer height, km: cumulus up to ~1.9 km over the base, the cirrus sheet in the top 700 m
                             # (it reads as cirrus from the ground; a thinner layer leaves the ray march finer steps)
EAS = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
MEL = unreal.MaterialEditingLibrary


def actors(cls):
    return [a for a in EAS.get_all_level_actors() if isinstance(a, cls)]


def cvar(c):
    unreal.SystemLibrary.execute_console_command(unreal.EditorLevelLibrary.get_editor_world(), c)


def sun_rotator(elev, azim):
    e, a = math.radians(elev), math.radians(azim)
    to_sun = (math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), math.sin(e))
    fwd = [-c for c in to_sun]
    return unreal.Rotator(roll=0.0, pitch=math.degrees(math.asin(fwd[2])), yaw=math.degrees(math.atan2(fwd[1], fwd[0])))


def srgb(h):
    return unreal.LinearColor(*(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)), 1.)


def prep(cid):
    elev, azim, col, cov, seed = COURSES[cid]
    for cls in (unreal.Landscape, unreal.LandscapeStreamingProxy, unreal.StaticMeshActor, unreal.ExponentialHeightFog):
        for a in actors(cls):   # the game hazes its own horizon; height fog here would add a second flat band
            a.set_is_temporarily_hidden_in_editor(True)
            a.set_actor_hidden_in_game(True)
    cap = actors(unreal.SceneCaptureCube) or [EAS.spawn_actor_from_class(unreal.SceneCaptureCube, unreal.Vector(0, 0, 200))]
    rt = unreal.load_asset("/Game/Sky/RT_SkyCube") if unreal.EditorAssetLibrary.does_asset_exist("/Game/Sky/RT_SkyCube") else         unreal.AssetToolsHelpers.get_asset_tools().create_asset("RT_SkyCube", "/Game/Sky", unreal.TextureRenderTargetCube, unreal.TextureRenderTargetCubeFactoryNew())
    rt.set_editor_property("size_x", SIZE)
    rt.set_editor_property("hdr", True)
    comp = cap[0].get_component_by_class(unreal.SceneCaptureComponentCube)
    comp.set_editor_property("texture_target", rt)
    comp.set_editor_property("capture_every_frame", False)
    comp.set_editor_property("always_persist_rendering_state", True)   # volumetric clouds need view history between captures
    mi = unreal.load_asset("/Game/Sky/MI_ChainsCumulus")
    for k, v in {"Coverage": cov, "Seed": seed, "LayerKm": LAYER[1]}.items():
        MEL.set_material_instance_scalar_parameter_value(mi, k, v)
    MEL.update_material_instance(mi)
    cloud = actors(unreal.VolumetricCloud)[0].get_component_by_class(unreal.VolumetricCloudComponent)
    cloud.set_material(mi)
    cloud.set_layer_bottom_altitude(LAYER[0])
    cloud.set_layer_height(LAYER[1])
    cloud.set_tracing_max_distance(80.)
    cloud.set_shadow_tracing_distance(4.)   # km; at the default 15 the low sun's near-level shadow rays stepped so coarsely the heaps lit in horizontal shelves
    for f in ("set_view_sample_count_scale", "set_reflection_view_sample_count_scale", "set_shadow_view_sample_count_scale", "set_shadow_reflection_view_sample_count_scale"):
        getattr(cloud, f)(4.)
    cloud.set_ground_albedo(unreal.Color(r=96, g=104, b=72, a=255))   # bounce off woods and turf under the bases
    for c in ("r.VolumetricCloud.ReflectionRaySampleMaxCount 512", "r.VolumetricCloud.ViewRaySampleMaxCount 1024", "r.VolumetricCloud.HighQualityAerialPerspective 0",
              "r.VolumetricCloud.EnableAerialPerspectiveSampling 1", "r.VolumetricCloud.Shadow.SampleAtmosphericLightShadowmap 0"):
        cvar(c)
    atmo = actors(unreal.SkyAtmosphere)[0].get_component_by_class(unreal.SkyAtmosphereComponent)
    atmo.set_mie_scattering_scale(MIE)   # half the default haze: the dome draws its own aureole round the disc, the render's would double it
    sun = actors(unreal.DirectionalLight)[0]
    sun.set_actor_rotation(sun_rotator(elev, azim), False)
    lc = sun.light_component
    lc.set_light_color(srgb(col), True)
    lc.set_editor_property("atmosphere_sun_disk_color_scale", unreal.LinearColor(0, 0, 0, 0))   # no second sun: the dome draws the disc
    return {"prep": cid}


def shoot(cid):
    """<cid>.hdr with clouds, then <cid>-clear.hdr without: sky-webp.py turns their difference into the cloud mask the dome
    hides its sun disc behind."""
    os.makedirs(OUT, exist_ok=True)
    comp = actors(unreal.SceneCaptureCube)[0].get_component_by_class(unreal.SceneCaptureComponentCube)
    rt = comp.get_editor_property("texture_target")
    cloud = actors(unreal.VolumetricCloud)[0].get_component_by_class(unreal.VolumetricCloudComponent)
    done = {}
    for name, clouds in ((cid, True), (cid + "-clear", False)):
        cloud.set_visibility(clouds)
        for _ in range(24):   # ponytail: repeated captures let the cloud and sky-light history converge; tick the world if it ever looks noisy
            comp.capture_scene()
        path = os.path.join(OUT, f"{name}.hdr")
        task = unreal.AssetExportTask()
        for k, v in {"object": rt, "filename": path, "automated": True, "prompt": False, "replace_identical": True, "exporter": unreal.RenderTargetCubeExporterHDR()}.items():
            task.set_editor_property(k, v)
        done[name] = unreal.Exporter.run_asset_export_task(task) and os.path.getsize(path)
    cloud.set_visibility(True)
    return done


_mode, _cid = globals().get("SKY", "prep:pine").split(":")
RESULT = prep(_cid) if _mode == "prep" else shoot(_cid)
