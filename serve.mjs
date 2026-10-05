// Zero-dependency static server: `node serve.mjs` then open http://localhost:8093
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), process.argv.includes('--dist') ? 'dist' : '.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.exr': 'image/x-exr', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
// /api/* runs the same Vercel Function modules locally (Web Request in, Response out), with file storage in .data/.
const api = { '/api/match': () => import('./api/match.js'), '/api/ice': () => import('./api/ice.js') };
async function runApi(req, res, load) {
  try {
    const mod = await load(), handler = mod[req.method]; if (!handler) { res.writeHead(405); return res.end(); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const out = await handler(request);
    res.writeHead(out.status, Object.fromEntries(out.headers)); res.end(Buffer.from(await out.arrayBuffer()));
  } catch (e) { console.error(e); res.writeHead(500); res.end('api error'); }
}
createServer(async (req, res) => {
  const route = api[req.url.split('?')[0]]; if (route) return runApi(req, res, route);
  let p; try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(root, '.' + p), rel = relative(root, file);
  if (rel.startsWith('..') || rel.includes(':') || p.includes('\\') || rel.split(/[\\/]/).some(s => s.startsWith('.'))) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(process.env.PORT || 8093, () => console.log(`Chains → http://localhost:${process.env.PORT || 8093}`));
