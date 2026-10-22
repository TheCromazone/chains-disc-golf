#!/usr/bin/env bash
# Render the course skies in the running ChainsUnreal editor (launch command: REPORT-windows.md), then make the game's WebPs:
#   bash art/unreal/sky-render.sh [pine meadow lake bluff]
# Each course is two jobs (scripts/sky_panorama.py: prep, then shoot) so the sky light and cloud history settle in between.
set -e
cd "$(dirname "$0")/../.."
root=$(pwd -W 2>/dev/null || pwd); tmp=$(mktemp -d)
courses=${*:-pine meadow lake bluff}
node art/unreal/uepy.mjs art/unreal/scripts/cloud_material.py
for c in $courses; do
  for m in prep shoot; do
    printf 'SKY = "%s:%s"\nexec(open(r"%s/art/unreal/scripts/sky_panorama.py", encoding="utf-8").read())\n' "$m" "$c" "$root" > "$tmp/sky_$m.py"
    node art/unreal/uepy.mjs "$tmp/sky_$m.py"
  done
done
python tools/sky-webp.py $courses
