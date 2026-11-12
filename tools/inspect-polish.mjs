// Optional specialist canvas inspector; see artifacts/final-evidence.md for isolated dependencies.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {CHROME} from './chrome-path.mjs';
const deps=resolve(process.env.CHAINS_QA_DEPS || fileURLToPath(new URL('../',import.meta.url)));
const require=createRequire(resolve(deps,'package.json'));
const playwright=await import(pathToFileURL(require.resolve('@playwright/test')).href);
const {chromium}={...playwright.default,...playwright};
import {writeFile,mkdir} from 'node:fs/promises';
const inspector=process.env.CHAINS_CANVAS_INSPECTOR || resolve(homedir(),'.agents/skills/threejs-qa-release/scripts/inspect-threejs-canvas.mjs');
const {inspectPage,summarize}=await import(pathToFileURL(inspector).href);
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,arg('--out','artifacts/polish-2026-11-11'));
const url=arg('--url','http://localhost:8189'),runId=arg('--run-id','polish-2026-11-11-final'),states=arg('--states','active-play').split(',');
process.chdir(deps);
const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal','--mute-audio']});
try {for(const mobile of [false,true])for(const state of states){
 const ctx=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(()=>{localStorage.setItem('chains.coach','["aim","throw","both"]');window.__THREE_GAME_TEST_HOOKS__={async setState(name){if(!['active-play','putt'].includes(name))throw Error('Unknown state: '+name);const c=window.__chains;await c.startGame({mode:'solo',courseId:'pine',holeCount:3,players:[{name:'You',avatar:c.G.avatar}]});c.G.introT=99;while(c.G.phase!=='aim')await new Promise(r=>setTimeout(r,20));if(name==='putt'){const h=c.holes[0],p=c.G.players[0];p.lie=[h.basket[0],c.world.height(h.basket[0],h.basket[1]+6.5),h.basket[1]+6.5];p.strokes=1;p.lieDist=6.5;c.setupTurn(0);c.cam.snap=true;}await new Promise(r=>setTimeout(r,900));return {state:name}},setPausedForScreenshot(paused){const c=window.__chains;c.G.maxDt=paused?1e-12:.05;if(paused){const r=c.renderer;r.info.autoReset=false;r.info.reset();c.renderFrame();window.__THREE_GAME_DIAGNOSTICS__={renderer:{...r.info.render,...r.info.memory},state:c.G.phase,quality:c.G.settings.quality,performance:c.performance()};r.info.autoReset=true;}}};});
 const page=await ctx.newPage();const goto=page.goto.bind(page);page.goto=async(...args)=>{const r=await goto(...args);await page.waitForFunction(()=>!!window.__chains,{},{timeout:120000});return r};
 const mode=mobile?'mobile':'desktop',name=mode+(states.length>1?'-'+state:'')+'-inspected';const report=await inspectPage(page,{url:url+'/?mute=1&dpr=1',out,mobile,state,runId,screenshotPath:resolve(out,name+'.png'),wait:0});await writeFile(resolve(out,name+'.json'),JSON.stringify(report,null,2)+'\n');console.log(summarize(report,resolve(out,name+'.json')));if(!report.result?.ok||report.consoleErrorCount||report.pageErrorCount)process.exitCode=1;await ctx.close();
}}finally{await b.close()}
