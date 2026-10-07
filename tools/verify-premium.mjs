// Real-browser regressions for the landing guide and a short swipe's release.
// Run alongside npm run dev, or pass --url to an independently running build.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launch, pause } from './qa/cdp.mjs';

const arg = (key, fallback) => process.argv.includes(key) ? process.argv[process.argv.indexOf(key) + 1] : fallback;
const out = resolve(arg('--out', 'docs/qa/premium-interaction'));
mkdirSync(out, { recursive: true });
const browser = await launch({ port: 9341 }), page = await browser.newPage();
const report = { timestamp: new Date().toISOString(), layouts: [], checks: [] };
try {
  await page.device({ width: 430, height: 932, mobile: true, touch: true });
  await page.goto(arg('--url', 'http://localhost:8093/'));
  await page.waitFor('!!window.__chains && !!__chains.hero');
  await page.eval(`(async()=>{const c=__chains;await c.startGame({mode:'solo',holeCount:3,players:[{name:'You'}]});})()`);
  await page.waitFor('__chains.G.phase === "intro"');
  await page.eval('__chains.G.introT = 30');
  await page.waitFor('__chains.G.phase === "aim" && !!__chains.G.shotPreview');
  for (const [width,height] of [[360,740],[430,932],[812,375],[568,320],[768,1024],[1366,768]]) {
    await page.device({ width,height,mobile:width<1000,touch:width<1000 });
    await pause(500);
    const result = await page.eval(`(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const guide=document.getElementById('shotPlan'),r=rect(guide);
      const overlap=[];
      for(const id of ['top','conditions','power','controls','utilities']){
        const b=rect(document.getElementById(id));
        if(Math.min(r.right,b.right)-Math.max(r.x,b.x)>2 && Math.min(r.bottom,b.bottom)-Math.max(r.y,b.y)>2)overlap.push(id);
      }
      return {width:innerWidth,height:innerHeight,rect:r,overlap,visible:getComputedStyle(guide).display!=='none',text:guide.textContent,estimate:__chains.G.shotPreview};
    })()`);
    assert(result.visible && result.rect.x>=0 && result.rect.y>=0 && result.rect.right<=width && result.rect.bottom<=height,'visible guide fits viewport');
    assert.deepEqual(result.overlap,[],'guide clears existing HUD plates');
    assert(Number.isFinite(result.estimate.range+result.estimate.left),'finite flight estimate');
    assert(result.estimate.power>=.1 && result.estimate.power<=1,'legal suggested power');
    await page.shot(join(out,`tee-${width}.jpg`));
    const hazard = await page.eval(`(async()=>{const UI=await import('/src/ui.js');UI.setShotPlan({range:132,left:123,surface:'Water · penalty',danger:true,power:1},1);const e=document.getElementById('shotPlan'),r=e.getBoundingClientRect();const rect={x:r.x,y:r.y,right:r.right,bottom:r.bottom};const overlaps=[];for(const id of ['top','conditions','power','controls','utilities']){const b=document.getElementById(id).getBoundingClientRect();if(Math.min(r.right,b.right)-Math.max(r.x,b.x)>2&&Math.min(r.bottom,b.bottom)-Math.max(r.y,b.y)>2)overlaps.push(id);}const text=e.textContent;UI.setShotPlan(__chains.G.shotPreview,__chains.G.previewPower);return {rect,overlaps,text};})()`);
    assert(hazard.rect.x>=0&&hazard.rect.right<=width&&hazard.rect.bottom<=height,'hazard readout fits viewport');
    assert.deepEqual(hazard.overlaps,[],'hazard readout clears existing HUD plates');
    assert.match(hazard.text,/after drop/,'OB distance describes the legal next lie');
    result.hazard=hazard;
    report.layouts.push(result);
    console.log(`PASS landing guide ${width}x${height}`);
  }
  await page.device({width:430,height:932,mobile:true,touch:true});await pause(500);
  const yaw=await page.eval('__chains.G.aim.yaw');
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await pause(180);
  await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
  await page.waitFor('__chains.G.planDirty === false');
  assert((await page.eval('__chains.G.aim.yaw'))>yaw,'real keyboard aiming changes direction');
  report.checks.push('Suggested power refreshes after aim settles');
  // A putt is the player's own read: no landing ring, readout or suggested-power mark.
  await page.eval('document.querySelector("#throwRow [data-id=putt]").click()');await pause(400);
  const putt = await page.eval('({preview:__chains.G.shotPreview,shown:getComputedStyle(document.getElementById("shotPlan")).display!=="none",mark:document.getElementById("power").classList.contains("suggesting")})');
  assert(!putt.preview.guided && !putt.shown && !putt.mark,'putts get no landing guide or power suggestion');
  await page.eval('document.querySelector("#throwRow [data-id=backhand]").click()');await pause(400);
  assert(await page.eval('__chains.G.shotPreview.guided && document.getElementById("power").classList.contains("suggesting")'),'the guide returns for a drive');
  report.checks.push('Putts show no landing guide or suggested power; drives keep it while aiming');
  await page.eval('document.getElementById("btnTarget").click()');await pause(150);
  const pad = await page.eval(`(()=>{const r=document.getElementById('pad').getBoundingClientRect();return {x:r.left+30,y:r.top+r.height*.45};})()`);
  const touch = (type,x,y) => page.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
  await touch('touchStart',pad.x,pad.y);await touch('touchMove',pad.x+60,pad.y);await pause(150);
  const charging = await page.eval('({phase:__chains.G.phase,preview:__chains.G.shotPreview,shown:getComputedStyle(document.getElementById("shotPlan")).display!=="none"})');
  assert.equal(charging.phase,'windup');
  assert(charging.preview.power<.4,'ribbon follows the short swipe power');
  assert(!charging.preview.guided && !charging.shown,'landing ring and readout hide once the swipe starts');
  await touch('touchCancel');await page.waitFor('__chains.G.phase === "aim"');
  assert.equal(await page.eval('__chains.G.players[0].strokes'),0,'cancellation does not throw');
  report.checks.push('Swipe hides the landing estimate (ribbon follows power); OS cancellation preserves strokes');

  // Observe every rendered phase around pointer-up, including the first recovery
  // frame. A short swipe used to jump directly from phase ~.12 to phase .5.
  await page.eval(`window.__releaseFrames=[];window.__captureRelease=true;(()=>{const tick=()=>{if(!window.__captureRelease)return;const g=__chains.G;__releaseFrames.push({at:performance.now(),mode:g.phase,phase:g.players[0].char.getPhase(),pending:g.pending?{fired:g.pending.fired,start:g.pending.startPhase,leadIn:g.pending.leadIn}:null});requestAnimationFrame(tick)};requestAnimationFrame(tick)})()`);
  await touch('touchStart',pad.x,pad.y);await touch('touchMove',pad.x+60,pad.y);await pause(130);await touch('touchEnd');
  await page.waitFor('__chains.G.phase === "flight"');await pause(400);
  const frames = await page.eval('window.__captureRelease=false;__releaseFrames');
  const release = frames.filter(f=>f.mode==='release');
  assert(release.length>=2,'windup completion has multiple rendered frames');
  assert(release[0].phase<.35,'first release frame preserves short-swipe pose');
  assert(release.some(f=>f.phase>=.35&&f.phase<.5),'remaining windup is shown');
  assert(release.every(f=>!f.pending.fired),'disc stays held before launch');
  const flight=frames.find(f=>f.mode==='flight');
  assert(flight.phase>=.62 && flight.phase<.75,'disc leaves at the authored release');
  for(let i=1;i<release.length;i++)assert(release[i].phase>=release[i-1].phase,'release phases advance monotonically');
  report.releaseFrames=frames;
  report.checks.push('Short swipe completes windup continuously and launches at phase .62');
  await page.waitFor('__chains.G.players[0].strokes === 1',30000);
  report.checks.push('Real touch throw reaches a scored result');
  assert.deepEqual(page.errors,[],'no browser or shader errors');
  report.errors=page.errors;report.passed=true;
  console.log('PASS live charging, cancellation, continuous release, launch and scoring');
} catch(e) {report.passed=false;report.failure=String(e.stack||e);report.errors=page.errors;process.exitCode=1;console.error(report.failure);}
finally {writeFileSync(join(out,'results.json'),JSON.stringify(report,null,2)+'\n');await page.close();browser.close();}
