#!/bin/bash
# Step 1 (MCP only): create a MetaHuman and set skin tone, eye colour and body through the MetaHumanGenerator toolset.
#   bash art/unreal/scripts/make_metahumans_mcp.sh <Name> <lightness> <redness> <eyeTemp> <eyeBright> <masc_fem> <fat> <musc> <height_cm>
# Never call create on a name that already exists: UE shows an "overwrite?" modal (invisible under -nullrhi) and the
# editor hangs unless it was launched with -unattended (then create just fails).
set -e
cd "$(dirname "$0")/../../.."
T=metahuman_toolset.metahuman.MetaHumanToolset
M="node art/unreal/mcp.mjs"
$M ct $T create "{\"asset_path\":\"/Game/MetaHumans/$1\"}" | tr -d '\n '; echo
S=$($M ct $T begin_edit "{\"object_path\":\"/Game/MetaHumans/$1.$1\"}" | python3 -c "import json,sys;print(json.load(sys.stdin)['returnValue']['refPath'])")
echo "$1 session $S"
# Without the optional MetaHuman Creator Core Data, a lightness below 0.5 flips the body skin-tone texture set (V2 -> V1),
# which loads /MetaHumanCharacter/Optional/BodyTextures/T_Skin_V1_* and dies on check(BodyTexture)
# (MetaHumanCharacterBodyTextureUtils.cpp:109): the editor crashes. Only set tones >= 0.5 until the Core Data is installed.
if python3 -c "import sys; sys.exit(0 if float('$2') >= 0.5 else 1)"; then
  $M ct $T set_skin_tone "{\"session\":{\"refPath\":\"$S\"},\"skin_tone\":{\"lightness\":$2,\"redness\":$3}}" >/dev/null
else
  echo "skip set_skin_tone lightness=$2 (< 0.5 crashes without MetaHuman Creator Core Data); tone applied downstream"
fi
$M ct $T set_eye_color "{\"session\":{\"refPath\":\"$S\"},\"eye_color\":{\"temperature\":$4,\"brightness\":$5}}" >/dev/null
$M ct $T set_body_shape "{\"session\":{\"refPath\":\"$S\"},\"body_shape\":{\"masculine_feminine\":$6,\"fat\":$7,\"muscularity\":$8,\"height_cm\":$9}}" >/dev/null
$M ct $T get_skin_tone "{\"session\":{\"refPath\":\"$S\"}}" | tr -d '\n '; echo
$M ct $T get_eye_color "{\"session\":{\"refPath\":\"$S\"}}" | tr -d '\n '; echo
$M ct $T get_body_shape "{\"session\":{\"refPath\":\"$S\"}}" | tr -d '\n '; echo
