import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
if (relative(root, out) !== 'dist') throw new Error('Invalid build output');
await rm(out, { recursive: true, force: true });
await mkdir(resolve(out, 'vendor'), { recursive: true });
await cp(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
// ui.css moves from src/ to the root of dist, so its '../assets/' urls become 'assets/' (a '../' at the site root only
// worked because the root clamps it; one level down, as Huck Yeah's /discgolf/, it would leave the game)
await writeFile(resolve(out, 'ui.css'), (await readFile(resolve(root, 'src/ui.css'), 'utf8')).replaceAll("url('../assets/", "url('assets/"));
await cp(resolve(root, 'node_modules/peerjs/dist/peerjs.min.js'), resolve(out, 'vendor/peerjs.min.js'));
await cp(resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf'), resolve(out, 'vendor/draco'), { recursive: true });
await cp(resolve(root, 'node_modules/three/examples/jsm/libs/basis'), resolve(out, 'vendor/basis'), { recursive: true });
await cp(resolve(root, 'manifest.webmanifest'), resolve(out, 'manifest.webmanifest'));
await cp(resolve(root, 'icon.svg'), resolve(out, 'icon.svg'));
await cp(resolve(root, 'sw.js'), resolve(out, 'sw.js'));   // invite-match turn alerts (served from the root so it controls the whole site)
await build({ entryPoints: [resolve(root, 'src/main.js')], outdir: resolve(out, 'js'), bundle: true, minify: true,
  splitting: true, format: 'esm', target: ['es2022', 'safari16'], entryNames: '[name]-[hash]', chunkNames: '[name]-[hash]', metafile: true,
}).then(async result => {
  const entry = Object.entries(result.metafile.outputs).find(([, v]) => v.entryPoint?.endsWith('src/main.js'))[0];
  let html = await readFile(resolve(root, 'index.html'), 'utf8');
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
    .replace('href="src/ui.css"', 'href="ui.css"')
    .replace('src="node_modules/peerjs/dist/peerjs.min.js"', 'src="vendor/peerjs.min.js"')
    .replace('src="src/main.js"', `src="${relative(out, resolve(entry)).replaceAll('\\', '/')}"`);
  await writeFile(resolve(out, 'index.html'), html);
});
console.log('Built dist/: bundled game, local codecs and PeerJS, runtime assets only.');
