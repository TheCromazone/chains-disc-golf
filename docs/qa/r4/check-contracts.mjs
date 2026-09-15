import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const stage=process.env.CANOPY_STAGE||'after';
const before=JSON.parse(await readFile(new URL('before-canopy.json',import.meta.url)));
const after=JSON.parse(await readFile(new URL(`${stage}-canopy.json`,import.meta.url)));
const layout=JSON.parse(await readFile(new URL('after-browser-results.json',import.meta.url)));
assert((await stat(new URL('after-browser-results.json',import.meta.url))).mtimeMs >= (await stat('src/canopy-data.js')).mtimeMs, 'Layout/startup capture must follow the final canopy build');
const unchanged=['src/main.js','src/physics.js','src/throw-poses.js','src/player.js','src/gltf-player.js','src/materials.js','src/ui.js','src/ui.css','src/net.js','src/models.js','assets/manifest.json'];
for(const file of unchanged){const previous=execFileSync('git',['show',`c15b0ee:${file}`]);const now=await readFile(file);assert.equal(createHash('sha256').update(now.toString().replaceAll('\r\n','\n')).digest('hex'),createHash('sha256').update(previous.toString().replaceAll('\r\n','\n')).digest('hex'),file);}
for(const row of after){const prev=before.find(b=>b.quality===row.quality&&b.view===row.view);assert(prev);assert.equal(row.terrainHash,prev.terrainHash);assert.equal(row.collisionHash,prev.collisionHash);assert.equal(row.collisionCount,3154);assert.equal(row.errors.length,0);}
assert.equal(layout.length,6);for(const row of layout){assert(row.result.res.every(s=>s.endsWith('ov:- off:- clipped:-')));assert(!row.errors.some(e=>!e.includes('GPU stall due to ReadPixels')));}
const startup=layout.map(row=>({viewport:`${row.width}x${row.height}`,encoded:row.startup.reduce((n,r)=>n+r.encoded,0),transfer:row.startup.reduce((n,r)=>n+r.transfer,0),models:row.startup.filter(r=>r.url.includes('/assets/models/')).length}));
for(const row of startup.filter(r=>!r.models))assert(row.transfer<2000000,'Lite startup stays below2MB');
const report={baseline:'c15b0ee',unchanged,terrainAnd3154CollidersUnchanged:true,canopy:after.map(({startup,...r})=>r),startup,allSixLayoutsPass:true,physicalDeviceFps:'Pending user overlay readings; desktop readouts excluded.'};
await writeFile(new URL('contracts.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({unchanged,startup,allSixLayoutsPass:true},null,2));
