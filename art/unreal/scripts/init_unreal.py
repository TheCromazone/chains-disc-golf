# Copy to <ChainsUnreal>/Content/Python/init_unreal.py. Runs at editor start-up.
# Job runner for art/unreal/uepy.mjs: every <name>.py dropped in <project>/Saved/PyJobs runs on the game thread in one shared
# namespace; the result goes to <name>.out.json as {ok, output, result, error, started, finished}. A script sets RESULT for a JSON result.
import unreal, os, io, sys, json, time, traceback, contextlib

JOBS = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()), "PyJobs")
os.makedirs(JOBS, exist_ok=True)
NS = {"__name__": "__uepy__", "unreal": unreal}
_last = [0.0, False]   # last poll, a job running


def _run(path):
    name = path[:-3]
    rec = {"ok": False, "started": time.time()}
    buf = io.StringIO()
    try:
        NS.pop("RESULT", None)
        with contextlib.redirect_stdout(buf):
            exec(compile(open(path, encoding="utf-8").read(), path, "exec"), NS)
        rec["ok"] = True
        rec["result"] = NS.get("RESULT")
    except Exception:
        rec["error"] = traceback.format_exc()
    rec["output"] = buf.getvalue()
    rec["finished"] = time.time()
    os.replace(path, name + ".done.py")
    with open(name + ".out.json.tmp", "w", encoding="utf-8") as f:
        json.dump(rec, f, default=str)
    os.replace(name + ".out.json.tmp", name + ".out.json")


def _tick(dt):
    now = time.time()
    if _last[1] or now - _last[0] < 0.25:  # ponytail: 4 Hz poll, a file watcher if latency ever matters
        return
    _last[0] = now
    _last[1] = True   # a job that saves or compiles pumps Slate, which ticks us again: without this guard the same job re-ran inside itself until the editor crashed
    try:
        for f in sorted(os.listdir(JOBS)):
            if f.endswith(".py") and not f.endswith(".done.py"):
                _run(os.path.join(JOBS, f))
    finally:
        _last[1] = False


unreal.register_slate_post_tick_callback(_tick)
unreal.log(f"[chains] PyJobs runner watching {JOBS}")
