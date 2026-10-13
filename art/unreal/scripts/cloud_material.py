# Chains' own volumetric cloud material for the offline sky panoramas (sky_panorama.py), built only from engine material
# nodes: one Custom node of our HLSL (hash-based gradient and cellular noise, no textures), the cloud sample attributes,
# the volumetric advanced output. No Epic sample, Fab, Quixel or Marketplace content.
#   node art/unreal/uepy.mjs art/unreal/scripts/cloud_material.py     (rebuilds /Game/Sky/M_ChainsCumulus + MI_ChainsCumulus)
# Look: fair-weather cumulus (flat grey bases, sunlit cauliflower tops, sizes from wisps to 2 km towers, clear stretches
# between busier ones), a thin streaked cirrus sheet near the top of the layer over parts of the sky.
# Parameters (MI_ChainsCumulus, set per course by sky_panorama.py): Coverage (~.25-.4 of the sky from above), Seed (which
# sky), LayerKm (must match the cloud component's layer height), Density (cumulus extinction per metre), Cirrus.
import unreal

MEL = unreal.MaterialEditingLibrary
PATH, MI_PATH = "/Game/Sky/M_ChainsCumulus", "/Game/Sky/MI_ChainsCumulus"

HLSL = r"""
struct ChainsCloud {
  float3 h33(float3 p) { p = frac(p * float3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return frac((p.xxy + p.yxx) * p.zyx); }
  float gn(float3 p) {   // gradient noise, about [-1, 1]
    float3 i = floor(p), f = frac(p), u = f * f * f * (f * (f * 6. - 15.) + 10.);
    #define G(o) dot(h33(i + o) * 2. - 1., f - o)
    float r = lerp(lerp(lerp(G(float3(0, 0, 0)), G(float3(1, 0, 0)), u.x), lerp(G(float3(0, 1, 0)), G(float3(1, 1, 0)), u.x), u.y),
                   lerp(lerp(G(float3(0, 0, 1)), G(float3(1, 0, 1)), u.x), lerp(G(float3(0, 1, 1)), G(float3(1, 1, 1)), u.x), u.y), u.z);
    #undef G
    return r * 1.7;
  }
  // [loop]: unrolled, the dozen inlined call sites took the compiler 1-3 minutes per cloud shader permutation
  float fbm(float3 p, int o) { float s = 0., a = .5, n = 0.; [loop] for (int i = 0; i < o; i++) { s += a * gn(p); n += a; p = p * 2.03 + float3(17.1, 3.7, 9.2); a *= .5; } return saturate(s / n * .5 + .5); }
  float wor(float3 p) {   // 1 at a cell's feature point, falling off between: one billow per cell
    float3 i = floor(p), f = frac(p); float d = 1.;
    [loop] for (int k = 0; k < 27; k++) { float3 c = float3(k % 3, (k / 3) % 3, k / 9) - 1., r = c + h33(i + c) - f; d = min(d, dot(r, r)); }
    return 1. - sqrt(d);
  }
  float rmp(float v, float a, float b) { return saturate((v - a) / (b - a)); }
};
ChainsCloud C;
float3 p = P * 1e-5 + float3(Seed * 37.13, Seed * -11.71, 0.);   // km
float alt = H * LayerKm;                                           // km above the cloud base
// Where cumulus grow: a 2-3 km cell field thresholded to the coverage, the coverage itself swinging over ~25 km so some
// stretches of sky are nearly clear and others busy.
float big = C.fbm(float3(p.xy / 25., Seed), 2);
float cov = saturate(Coverage + (big - .5) * 1.2);
float cell = C.fbm(float3(p.xy / 2.4, .5), 3);           // ~N(.5, .12): the threshold below puts about `cov` of the sky under cloud
float thr = .5 + (.5 - cov) * .32;
float core = C.rmp(cell, thr, thr + .12);                 // 0 at a cloud's footprint edge, 1 in its core
// Flat base, domed top: a round heap over the footprint (sqrt(1 - r^2) with r = 1 - core), not an extruded column or a
// cone; 0.4-1.9 km tall by region.
float top = (.4 + 1.5 * C.fbm(float3(p.xy / 7., 3.3), 2)) * sqrt(core * (2. - core));
float shape = C.rmp(alt, 0., .06) * C.rmp(alt, top, top - .3);
// Billows: cellular lumps ~550 m and ~230 m, a little taller than wide, over a smooth fbm so they merge into heaps.
float3 sp = float3(p.xy, alt * 1.3) / .55;
float pw = saturate(C.wor(sp) * .4 + C.wor(sp * 2.4 + 5.) * .25 + C.fbm(sp * .45, 3) * .55 - .08);
float dens = shape > 1e-3 ? C.rmp(pw, 1. - shape, 1.) * shape : 0.;
// Detail: smaller cauliflower bumps on the tops, torn and wispy at the base and on thin clouds.
if (dens > 0.) {
  float3 dp = float3(p.xy, alt * 1.2) / .13;
  float det = C.wor(dp) * .55 + C.wor(dp * 2.4) * .3 + C.fbm(dp * 5., 2) * .15;
  float er = lerp(1. - det, det, C.rmp(alt, .05, .35)) * .42;
  dens = C.rmp(dens, er, 1.);
}
// Cirrus: a thin sheet 300-600 m under the layer top, long fibrous streaks along the upper wind, over parts of the sky only.
float ca = C.rmp(alt, LayerKm - .75, LayerKm - .5) * C.rmp(alt, LayerKm - .08, LayerKm - .3);
float cir = 0.;
if (ca > 0.) {
  float2 cr = float2(dot(p.xy, float2(.8, .6)), dot(p.xy, float2(-.6, .8)));
  float fib = C.fbm(float3(cr.x / 9., cr.y / .8, 7.), 4) * .6 + C.fbm(float3(cr.x / 2.5, cr.y / .22, 2.), 3) * .4;
  float cm = C.rmp(C.fbm(float3(p.xy / 30., 11. + Seed), 2), .53, .63);
  cir = C.rmp(fib, .5, .78) * cm * ca * Cirrus;
}
AO = lerp(.45, 1., C.rmp(alt, 0., max(top, .3)));   // sky light reaching into a heap: its base sits in its own shade
return dens * Density + cir * .0007;                  // extinction per metre
"""

# Forward-scattering droplets with a little back scatter (silver linings toward the disc, bright faces away from it);
# two multiple-scattering octaves so thick cores stay soft and luminous instead of dark grey.
ADV = {"const_phase_g": .55, "const_phase_g2": -.3, "const_phase_blend": .3, "const_multi_scattering_contribution": .4,
       "const_multi_scattering_occlusion": .6, "const_multi_scattering_eccentricity": .6, "multi_scattering_approximation_octave_count": 2,
       "ground_contribution": True}


def make():
    at = unreal.AssetToolsHelpers.get_asset_tools()
    if unreal.EditorAssetLibrary.does_asset_exist(PATH):
        mat = unreal.load_asset(PATH)
        for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():   # recompiling a material the cloud is drawing crashed the renderer
            if isinstance(a, unreal.VolumetricCloud):
                a.get_component_by_class(unreal.VolumetricCloudComponent).set_material(None)
        for e in MEL.get_material_expressions(mat):   # delete_all_material_expressions leaves some behind
            MEL.delete_material_expression(mat, e)
    else:
        mat = at.create_asset("M_ChainsCumulus", "/Game/Sky", unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("material_domain", unreal.MaterialDomain.MD_VOLUME)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_ADDITIVE)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
    mat.set_editor_property("used_with_volumetric_cloud", True)   # without it the cloud pass has no shader and the capture comes out black

    def node(cls, x, y, **props):
        e = MEL.create_material_expression(mat, cls, x, y)
        for k, v in props.items():
            e.set_editor_property(k, v)
        return e

    def param(name, v, y):
        return node(unreal.MaterialExpressionScalarParameter, -900, y, parameter_name=name, default_value=v)

    pos = node(unreal.MaterialExpressionWorldPosition, -900, -200)
    csa = node(unreal.MaterialExpressionCloudSampleAttribute, -900, -60)
    pars = {"Coverage": param("Coverage", .32, 60), "Seed": param("Seed", 0., 160), "LayerKm": param("LayerKm", 4., 260),
            "Density": param("Density", .06, 360), "Cirrus": param("Cirrus", 1., 460)}
    def cin(n):
        i = unreal.CustomInput()
        i.set_editor_property("input_name", n)
        return i

    ao = unreal.CustomOutput()
    ao.set_editor_property("output_name", "AO")
    ao.set_editor_property("output_type", unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    cus = node(unreal.MaterialExpressionCustom, -500, 0, code=HLSL, output_type=unreal.CustomMaterialOutputType.CMOT_FLOAT1, description="ChainsCloud",
               inputs=[cin(n) for n in ["P", "H", *pars]], additional_outputs=[ao])
    links = {"P": MEL.connect_material_expressions(pos, "", cus, "P"), "H": MEL.connect_material_expressions(csa, "NormAltitudeInLayer", cus, "H")}
    for n, e in pars.items():
        links[n] = MEL.connect_material_expressions(e, "", cus, n)
    alb = node(unreal.MaterialExpressionConstant3Vector, -200, -140, constant=unreal.LinearColor(.96, .96, .96, 1.))
    links["albedo"] = MEL.connect_material_property(alb, "", unreal.MaterialProperty.MP_BASE_COLOR)
    links["extinction"] = MEL.connect_material_property(cus, "", unreal.MaterialProperty.MP_SUBSURFACE_COLOR)   # the Volume domain's Extinction pin
    links["AO"] = MEL.connect_material_property(cus, "AO", unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
    adv = node(unreal.MaterialExpressionVolumetricAdvancedMaterialOutput, -200, 300) if ADV else None
    for k, v in ADV.items():
        adv.set_editor_property(k, v)
    MEL.recompile_material(mat)
    unreal.EditorAssetLibrary.save_asset(PATH)
    if unreal.EditorAssetLibrary.does_asset_exist(MI_PATH):
        mi = unreal.load_asset(MI_PATH)
    else:
        mi = at.create_asset("MI_ChainsCumulus", "/Game/Sky", unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, mat)
    unreal.EditorAssetLibrary.save_asset(MI_PATH)
    return {"material": PATH, "instance": MI_PATH, "links": links}


RESULT = make()
