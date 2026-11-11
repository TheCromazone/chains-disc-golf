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
const root=fileURLToPath(new URL('../',import.meta.url));const out=root+'/artifacts/polish-2026-11-11';
process.chdir(deps);
const b=await chromium.launch({executablePath:CHROME,headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=metal','--mute-audio']});
try {for(const mobile of [false,true]){
 const ctx=await b.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
 await ctx.addInitScript(()=>{localStorage.setItem('chains.coach','["aim","throw","both"]');window.__THREE_GAME_TEST_HOOKS__={async setState(name){if(name!=='active-play')throw Error('Unknown state: '+name);const c=window.__chains;await c.startGame({mode:'solo',courseId:'pine',holeCount:3,players:[{name:'You',avatar:c.G.avatar}]});c.G.introT=99;while(c.G.phase!=='aim')await new Promise(r=>setTimeout(r,20));await new Promise(r=>setTimeout(r,900));return {state:name}},setPausedForScreenshot(paused){const c=window.__chains;c.G.maxDt=paused?1e-12:.05;if(paused){const r=c.renderer;r.info.autoReset=false;r.info.reset();c.renderFrame();window.__THREE_GAME_DIAGNOSTICS__={renderer:{...r.info.render,...r.info.memory},state:c.G.phase,quality:c.G.settings.quality,performance:c.performance()};r.info.autoReset=true;}}};});
 const page=await ctx.newPage();const goto=page.goto.bind(page);page.goto=async(...args)=>{const r=await goto(...args);await page.waitForFunction(()=>!!window.__chains,{},{timeout:120000});return r};
 const mode=mobile?'mobile':'desktop';const report=await inspectPage(page,{url:'http://localhost:8189/?mute=1',out,mobile,state:'active-play',runId:'polish-2026-11-11-final',screenshotPath:out+'/'+mode+'-inspected.png',wait:0});await writeFile(out+'/'+mode+'-inspected.json',JSON.stringify(report,null,2)+'\n');console.log(summarize(report,out+'/'+mode+'-inspected.json'));if(!report.result?.ok||report.consoleErrorCount||report.pageErrorCount)process.exitCode=1;await ctx.close();
}}finally{await b.close()}
