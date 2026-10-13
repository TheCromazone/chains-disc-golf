#!/usr/bin/env bash
# Everything the gauntlet judges, captured in parallel from the current checkout:
#   bash tools/gauntlet/capture-all.sh <out_dir> <base_port> [stills|motion|all]
# phone/   = Mobile tier as a phone shows it (960x540 CSS at 2x, coarse pointer, quality low) -> 1920x1080 JPEGs
# desktop/ = Desktop tier at 1920x1080
# motion/  = capture-motion.mjs clips (flyover, drive, putt, idle) at 1280x720, Desktop tier
# Uses ports base, base+1, base+2 (and +1000 each for Chrome). Prints each tool's summary; exits non-zero if any failed.
set -u
out=$1; p=$2; what=${3:-all}
cd "$(dirname "$0")/../.."
mkdir -p "$out"
# At most two capture-all runs at once on this machine (each starts 2-3 headless Chromes on the GPU), so parallel builders
# never pin the owner's PC: wait for a free slot. A slot older than 20 minutes belongs to a capture that died; take it.
slots="${TMPDIR:-/tmp}/chains-capture-slots"; mkdir -p "$slots"; slot=
while [ -z "$slot" ]; do
  for s in 1 2; do
    [ -n "$(find "$slots/$s" -maxdepth 0 -mmin +20 2>/dev/null)" ] && rm -rf "$slots/$s"
    if mkdir "$slots/$s" 2>/dev/null; then slot="$slots/$s"; break; fi
  done
  [ -z "$slot" ] && sleep 5
done
trap 'rm -rf "$slot"' EXIT
pids=()
if [ "$what" != motion ]; then
  node tools/capture.mjs --out "$out/phone" --port "$p" --size 960x540 --dpr 2 --mobile --quality low > "$out/phone.log" 2>&1 & pids+=($!)
  node tools/capture.mjs --out "$out/desktop" --port $((p + 1)) --size 1920x1080 --quality high > "$out/desktop.log" 2>&1 & pids+=($!)
fi
if [ "$what" != stills ]; then
  node tools/capture-motion.mjs --out "$out/motion" --port $((p + 2)) > "$out/motion.log" 2>&1 & pids+=($!)
fi
fail=0; for pid in "${pids[@]}"; do wait "$pid" || fail=1; done
tail -n 6 "$out"/*.log
exit $fail
