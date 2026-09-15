import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true});
const prefix=process.env.QA_PREFIX||'18';
const result={};
async function boot(empty=false){const context=await browser.newContext({viewport:{width:430,height:932}});if(empty)await context.route('**/assets/manifest.json',r=>r.fulfill({contentType:'application/json',body:'{}'}));const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8093');await page.waitForFunction(()=>!!window.__chains);return {context,page,errors};}
const {page,context,errors}=await boot();
// Actual renderer export for course thumbnails: original 3D world, no copied art.
await page.setViewportSize({width:960,height:360});
for(const id of ['pine','meadow','lake']){
 await page.evaluate(async id=>{const C=window.__chains;await C.loadCourse(id);C.cam.mode='courses';document.getElementById('menu').classList.add('hidden');},id);
 await page.waitForTimeout(1600);await page.screenshot({path:fileURLToPath(new URL(`../../assets/courses/${id}_toon.jpg`,import.meta.url)),type:'jpeg',quality:70});
}
await page.setViewportSize({width:430,height:932});
await page.evaluate(async()=>{const C=window.__chains;C.G.settings.quality='high';const m=await import('/src/models.js');await m.loadModels(C.renderer,'high');await C.loadCourse('pine');C.makeHero();await C.startGame({mode:'solo',holeCount:3,players:[{name:'You',avatar:C.G.avatar}]});C.G.introT=10;C.G.maxDt=.7;});
await page.waitForFunction(()=>window.__chains.G.phase==='aim');
result.fullActor=await page.evaluate(()=>({source:window.__chains.G.players[0].char.source,clips:window.__chains.G.players[0].char.clips}));assert.equal(result.fullActor.source,'glb');
// Actual pointer swipe through the input handler, then wait for a settled throw.
const pad=await page.locator('#pad').boundingBox();await page.mouse.move(pad.x+pad.width*.10,pad.y+pad.height*.5);await page.mouse.down();await page.mouse.move(pad.x+pad.width*.75,pad.y+pad.height*.5,{steps:12});await page.mouse.up();
await page.waitForFunction(()=>window.__chains.G.players[0].strokes>0,{timeout:45000});result.manualSwipe=true;
// Complete the same hole using the existing planner and real trajectory playback.
for(let shot=0;shot<12;shot++){
 if(await page.evaluate(()=>window.__chains.G.players[0].done))break;
 await page.waitForFunction(()=>window.__chains.G.phase==='aim',{timeout:20000});
 await page.evaluate(async()=>{const C=window.__chains;const {planBotThrow}=await import('/src/bot.js');const p=C.G.players[0];const plan=await planBotThrow({pos:p.lie,world:C.world,difficulty:'hard'});C.G.throwType=plan.throwType;C.G.discId=plan.discId;C.G.aim.yaw=Math.atan2(plan.dir[1],plan.dir[0]);C.doThrow(0,plan);});
 await page.waitForFunction(()=>['result','holeEnd'].includes(window.__chains.G.phase),{timeout:45000});
}
result.fullHole=await page.evaluate(()=>({done:window.__chains.G.players[0].done,scores:window.__chains.G.players[0].scores,source:window.__chains.G.players[0].char.source}));assert(result.fullHole.done);
// Deterministic near-basket fixture still uses production doThrow, events and playback.
await page.evaluate(async()=>{const C=window.__chains;document.getElementById('score').classList.add('hidden');await C.startGame({mode:'solo',holeCount:3,players:[{name:'You',avatar:C.G.avatar}]});C.G.introT=10;});await page.waitForFunction(()=>window.__chains.G.phase==='aim');
const fixture=await page.evaluate(()=>{const C=window.__chains,p=C.G.players[0],h=C.holes[0];p.lie=[h.basket[0],C.world.height(h.basket[0],h.basket[1]-4),h.basket[1]-4];p.strokes=1;C.setupTurn(0);for(let power=.3;power<1;power+=.01){const params={throwType:'putt',discId:'putter',power,pos:[p.lie[0],p.lie[1]+1.15,p.lie[2]],dir:[0,1],hyzer:0,yawOffset:0,launchOffset:0};const sim=C.runSim(params);if(sim.result.holed){C.G.throwType='putt';C.G.discId='putter';C.doThrow(0,{power},{...sim,params});return {power,events:sim.events};}}return null;});
assert(fixture,'holed putt fixture exists');result.feedbackFixture=fixture;
await page.waitForFunction(()=>document.getElementById('toastTitle').textContent==='Chains!',{timeout:20000});
await page.screenshot({path:fileURLToPath(new URL(`${prefix}-live-chains.png`,import.meta.url))});
await page.waitForFunction(()=>window.__chains.G.phase==='result',{timeout:20000});
await page.waitForTimeout(450);
await page.screenshot({path:fileURLToPath(new URL(`${prefix}-live-birdie.png`,import.meta.url))});result.feedbackTitle=await page.locator('#toastTitle').innerText();
result.errors=errors;await context.close();
const fallback=await boot(true);
result.emptyAssets=await fallback.page.evaluate(async()=>{const C=window.__chains;const out=[];for(const quality of ['low','high']){C.G.settings.quality=quality;await (await import('/src/models.js')).loadModels(C.renderer,quality);await C.loadCourse('pine');C.makeHero();await C.startGame({mode:'solo',holeCount:3,players:[{name:'You',avatar:C.G.avatar}]});C.G.introT=10;const p=C.G.players[0],h=C.holes[0];const sim=C.runSim({throwType:'backhand',discId:'driver',power:.8,pos:[h.tee[0],h.teeY+1.15,h.tee[1]],dir:[0,1]});out.push({quality,source:p.char.source,finite:sim.traj.every(a=>a.every(Number.isFinite)),points:sim.traj.length});}return out;});
assert(result.emptyAssets.every(r=>r.source==='procedural'&&r.finite&&r.points>2));result.emptyErrors=fallback.errors;await fallback.context.close();
await browser.close();await writeFile(new URL(`${prefix}-integration-results.json`,import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
