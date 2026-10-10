#!/usr/bin/env python3
"""Tiny stdlib-only MCP stdio client: start an MCP server, initialize, list its tools,
optionally call one tool, and print the result.

Usage:
  python3 -I art/unity/mcp/mcp_list_tools.py [--json out.json] [--call NAME '{"arg":1}'] -- <server command...>

Example (Unity CLI MCP server, editor already running with com.unity.pipeline):
  python3 -I art/unity/mcp/mcp_list_tools.py --json art/unity/mcp/tools.json -- \
      ~/.unity/bin/unity mcp --project-path ~/Documents/ChainsUnity
"""
import json
import os
import subprocess
import sys
import threading
import time


def main():
    argv = sys.argv[1:]
    out_json = None
    calls = []
    while argv and argv[0] != "--":
        flag = argv.pop(0)
        if flag == "--json":
            out_json = argv.pop(0)
        elif flag == "--call":
            name = argv.pop(0)
            args = json.loads(argv.pop(0))
            calls.append((name, args))
        else:
            sys.exit(f"unknown flag {flag}")
    if not argv:
        sys.exit("missing -- <server command>")
    cmd = [os.path.expanduser(a) for a in argv[1:]]

    env = dict(os.environ, UNITY_NO_BANNER="1", UNITY_NON_INTERACTIVE="1")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, bufsize=1, env=env)
    stderr_lines = []
    threading.Thread(target=lambda: [stderr_lines.append(l) for l in proc.stderr], daemon=True).start()

    next_id = [0]

    def send(method, params=None, notify=False):
        msg = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        if not notify:
            next_id[0] += 1
            msg["id"] = next_id[0]
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()
        if notify:
            return None
        deadline = time.time() + 120
        while time.time() < deadline:
            line = proc.stdout.readline()
            if not line:
                raise RuntimeError("server closed stdout; stderr:\n" + "".join(stderr_lines[-30:]))
            line = line.strip()
            if not line:
                continue
            try:
                resp = json.loads(line)
            except json.JSONDecodeError:
                print("[non-JSON stdout]", line[:200], file=sys.stderr)
                continue
            if resp.get("id") == msg["id"]:
                if "error" in resp:
                    raise RuntimeError(f"{method} error: {resp['error']}")
                return resp["result"]
        raise TimeoutError(method)

    t0 = time.time()
    init = send("initialize", {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "chains-mcp-probe", "version": "0.1"},
    })
    send("notifications/initialized", notify=True)
    info = init.get("serverInfo", {})
    print(f"server: {info.get('name')} {info.get('version')}  protocol {init.get('protocolVersion')}  "
          f"(init {time.time() - t0:.1f}s)")

    tools, cursor = [], None
    while True:
        res = send("tools/list", {"cursor": cursor} if cursor else {})
        tools += res.get("tools", [])
        cursor = res.get("nextCursor")
        if not cursor:
            break
    print(f"{len(tools)} tools:")
    for t in tools:
        desc = (t.get("description") or "").strip().splitlines()[0][:110] if t.get("description") else ""
        print(f"  - {t['name']}: {desc}")

    results = {}
    for name, args in calls:
        r = send("tools/call", {"name": name, "arguments": args})
        results[name] = r
        text = "".join(c.get("text", "") for c in r.get("content", []) if c.get("type") == "text")
        print(f"\ncall {name}({json.dumps(args)}) -> isError={r.get('isError', False)}\n{text[:2000]}")

    if out_json:
        with open(out_json, "w") as f:
            json.dump({"server": info, "protocolVersion": init.get("protocolVersion"),
                       "tools": tools, "calls": results}, f, indent=1)
        print(f"\nwrote {out_json}")

    proc.stdin.close()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


if __name__ == "__main__":
    main()
