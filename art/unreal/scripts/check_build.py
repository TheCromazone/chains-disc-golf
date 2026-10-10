# Is assembly (BuildMetaHuman) possible offline? Logs the reason when it is not.
import os
exec(open(os.path.expanduser("~/Documents/chains-disc-golf/art/unreal/scripts/mh_lib.py")).read())
ch = mh_load("Chains_M1", create=False)
RESULT = {"can_build": SUB.can_build_meta_human(ch, True), "has_high_res_textures": ch.has_high_resolution_textures if isinstance(ch.has_high_resolution_textures, bool) else ch.has_high_resolution_textures(),
          "optional_content_installed": unreal.MetaHumanGeneratorSubsystemWrapper.is_optional_content_installed()}
