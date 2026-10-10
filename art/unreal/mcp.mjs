#!/usr/bin/env node
// Tiny MCP client for the Unreal Engine 5.8 "Unreal MCP" plugin (streamable HTTP, JSON-RPC 2.0).
//
//   node art/unreal/mcp.mjs list                                # tools/list (native tools)
//   node art/unreal/mcp.mjs call <tool> '<json args>'           # tools/call
//   node art/unreal/mcp.mjs toolsets                            # = call list_toolsets {}
//   node art/unreal/mcp.mjs describe <toolset>                  # = call describe_toolset {toolset_name}
//   node art/unreal/mcp.mjs ct <toolset> <tool> '<json args>'   # = call call_tool {toolset_name, tool_name, arguments}
//
// Options (env): MCP_URL (default http://localhost:8000/mcp), MCP_RAW=1 prints the raw JSON-RPC
// result instead of unwrapping text content, MCP_PROGRESS=1 asks for progress (SSE) on tools/call,
// MCP_TIMEOUT_MS (default 600000), MCP_IMAGE_OUT=<file.png> saves image content (e.g. CaptureAssetImage) to disk.
//
// Flow per invocation: initialize -> notifications/initialized -> <request> -> DELETE session.
// Handles the Mcp-Session-Id header and either application/json or text/event-stream replies.

import { writeFileSync } from 'node:fs';

const URL_ = process.env.MCP_URL || 'http://localhost:8000/mcp';
const TIMEOUT = Number(process.env.MCP_TIMEOUT_MS || 600000);
const PROTOCOL = '2025-11-25';

let sessionId = null;
let negotiated = null;
let nextId = 1;

async function rpc(method, params, { notify = false } = {}) {
  const body = { jsonrpc: '2.0', method };
  if (params !== undefined) body.params = params;
  const id = notify ? undefined : nextId++;
  if (!notify) body.id = id;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  if (negotiated) headers['Mcp-Protocol-Version'] = negotiated;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  let res;
  try {
    res = await fetch(URL_, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(`HTTP request to ${URL_} failed: ${e.cause?.code || e.message}`);
  }
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  if (notify) {
    clearTimeout(timer);
    await res.arrayBuffer().catch(() => {});
    if (!res.ok && res.status !== 202) throw new Error(`${method}: HTTP ${res.status}`);
    return null;
  }
  const ctype = res.headers.get('content-type') || '';
  let msg;
  try {
    if (ctype.includes('text/event-stream')) msg = await readSse(res, id);
    else {
      const text = await res.text();
      if (!text) throw new Error(`${method}: empty body (HTTP ${res.status})`);
      msg = JSON.parse(text);
    }
  } finally {
    clearTimeout(timer);
  }
  if (msg.error) {
    const err = new Error(`${method}: JSON-RPC error ${msg.error.code}: ${msg.error.message}`);
    err.rpc = msg.error;
    throw err;
  }
  return msg.result;
}

// Read an SSE stream until the JSON-RPC response with our id arrives. Progress / log
// notifications go to stderr.
async function readSse(res, id) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      let m;
      try { m = JSON.parse(data); } catch { continue; }
      if (m.id === id && (m.result !== undefined || m.error !== undefined)) {
        reader.cancel().catch(() => {});
        return m;
      }
      if (m.method) process.stderr.write(`[${m.method}] ${JSON.stringify(m.params ?? {})}\n`);
    }
    if (done) throw new Error('SSE stream ended without a response');
  }
}

async function open() {
  const init = await rpc('initialize', {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'chains-mcp-cli', version: '0.1.0' },
  });
  negotiated = init.protocolVersion;
  await rpc('notifications/initialized', undefined, { notify: true });
  return init;
}

async function close() {
  if (!sessionId) return;
  try {
    await fetch(URL_, { method: 'DELETE', headers: { 'Mcp-Session-Id': sessionId } });
  } catch { /* ignore */ }
}

function parseArgs(s) {
  if (s === undefined || s === '') return {};
  try { return JSON.parse(s); } catch (e) { throw new Error(`arguments must be JSON: ${e.message}`); }
}

// Unwrap a CallToolResult: print structuredContent / text content (parsed as JSON when possible).
function show(result) {
  if (process.env.MCP_RAW) return console.log(JSON.stringify(result, null, 2));
  if (result?.structuredContent !== undefined) {
    console.log(JSON.stringify(result.structuredContent, null, 2));
  } else if (Array.isArray(result?.content)) {
    for (const c of result.content) {
      if (c.type === 'text') {
        let v;
        try { v = JSON.parse(c.text); } catch { console.log(c.text); continue; }
        // toolset image results arrive as {returnValue: {mimeType, data(base64)}} inside a text block
        const img = v?.returnValue?.mimeType?.startsWith('image/') && (v.returnValue.data || v.returnValue.imageData);
        if (img && process.env.MCP_IMAGE_OUT) {
          writeFileSync(process.env.MCP_IMAGE_OUT, Buffer.from(img, 'base64'));
          console.log(`[${v.returnValue.mimeType} saved to ${process.env.MCP_IMAGE_OUT}]`);
        } else console.log(JSON.stringify(v, (k, x) => (typeof x === 'string' && x.length > 400 ? `${x.slice(0, 60)}...(${x.length} chars)` : x), 2));
      } else if (c.type === 'image') {
        console.log(`[image ${c.mimeType}, ${c.data?.length ?? 0} b64 chars]`);
        if (process.env.MCP_IMAGE_OUT && c.data) {
          const n = (show.images = (show.images || 0) + 1);
          const out = n === 1 ? process.env.MCP_IMAGE_OUT : process.env.MCP_IMAGE_OUT.replace(/(\.\w+)?$/, `_${n}$1`);
          writeFileSync(out, Buffer.from(c.data, 'base64'));
          console.log(`  saved ${out}`);
        }
      } else console.log(JSON.stringify(c));
    }
  } else console.log(JSON.stringify(result, null, 2));
  if (result?.isError) process.exitCode = 2;
}

async function callTool(name, args) {
  const params = { name, arguments: args };
  if (process.env.MCP_PROGRESS) params._meta = { progressToken: `p${Date.now()}` };
  return rpc('tools/call', params);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '-h') {
    console.log('usage: mcp.mjs list | call <tool> [json] | toolsets | describe <toolset> | ct <toolset> <tool> [json] | info');
    return;
  }
  const init = await open();
  try {
    switch (cmd) {
      case 'info':
        console.log(JSON.stringify({ url: URL_, sessionId, ...init }, null, 2));
        break;
      case 'list': {
        const r = await rpc('tools/list', {});
        if (process.env.MCP_RAW) console.log(JSON.stringify(r, null, 2));
        else for (const t of r.tools) console.log(`${t.name}\n    ${(t.description || '').split('\n')[0]}`);
        break;
      }
      case 'call':
        if (!rest[0]) throw new Error('call needs a tool name');
        show(await callTool(rest[0], parseArgs(rest[1])));
        break;
      case 'toolsets':
        show(await callTool('list_toolsets', parseArgs(rest[0])));
        break;
      case 'describe':
        show(await callTool('describe_toolset', { toolset_name: rest[0], ...parseArgs(rest[1]) }));
        break;
      case 'ct':
        show(await callTool('call_tool', { toolset_name: rest[0], tool_name: rest[1], arguments: parseArgs(rest[2]) }));
        break;
      default:
        throw new Error(`unknown command ${cmd}`);
    }
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
