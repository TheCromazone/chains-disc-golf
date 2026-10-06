// Actual gameplay factory, four sides, both body meshes, LODs, hands and every animation.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative} from 'node:path';
import {parseArgs} from 'node:util';
import { CHROME } from './chrome-path.mjs';
const {values:o}=parseArgs({options:{out:{type:'string',default:'docs/qa/players'},port:{type:'string',default:'8161'},quick:{type:'boolean',default:false},chrome:{type:'string',default:CHROME}}});
const root=process.cwd(),out=resolve(o.out),port=+o.port,cdp=port+1000;mkdirSync(out,{recursive:true});
const profile=mkdtempSync(join(tmpdir(),'chains-players-')),server=spawn(process.execPath,['serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'}),chrome=spawn(o.chrome,['--headless=new',`--remote-debugging-port=${cdp}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--ignore-gpu-blocklist','--window-size=900,900','about:blank'],{stdio:'ignore'});
process.on('exit',()=>{chrome.kill();server.kill();if(relative(tmpdir(),profile).startsWith('chains-players-'))try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function poll(fn,what,timeout=60000){for(let start=Date.now();Date.now()-start<timeout;await sleep(100)){try{const value=await fn();if(value)return value;}catch{}}throw Error('Timed out: '+what);}
await poll(async()=>(await fetch(`http://localhost:${port}/`)).ok,'server');const url=await poll(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl,'Chrome');
const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map(),errors=[];ws.onmessage=ev=>{const m=JSON.parse(ev.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value??a.description).join(' '));};
const send=(method,params={})=>new Promise((r,j)=>{const id=++seq;pending.set(id,{resolve:r,reject:j});ws.send(JSON.stringify({id,method,params}));});async function js(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const shots=[];async function shot(name){await js('characterQA.render()');await sleep(80);const {data}=await send('Page.captureScreenshot',{format:'jpeg',quality:92,clip:{x:0,y:0,width:640,height:765,scale:1}});writeFileSync(join(out,name+'.jpg'),Buffer.from(data,'base64'));shots.push(name);}
const report={poses:[],wardrobe:[],errors};try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:640,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:`http://localhost:${port}/docs/qa/player-review.html`});await poll(()=>js('!!window.characterQA?.ready'),'gameplay models',120000);await sleep(1500);
 const actions=['idle','hero','ready','backhand','backhand_io','backhand_oi','forehand','forehand_io','forehand_oi','tomahawk','scoober','hammer','blade','putt','practice','celebrate','slump','walk'];
 for(const figure of ['male','female'])for(const lod of [false,true])for(const hand of o.quick?['right']:['right','left']){
  const avatar={figure,lod,hand,jersey:'#ff4d3d',shorts:'#1d3557',skin:'#c68a5e',wristband:'both'};await js(`characterQA.configure(${JSON.stringify(avatar)})`);
  for(const action of o.quick?['idle','backhand','celebrate']:actions)for(const phase of o.quick?[.7]:['hero','ready'].includes(action)?[0]:['celebrate','slump'].includes(action)?[0,.45,.9,1.4,2]:['idle','practice','walk'].includes(action)?[0,.5,1,2,3]:[0,.25,.5,.62,.8,1]){
   await js(`characterQA.pose(${JSON.stringify(action)},${phase})`);const result=await js('characterQA.telemetry()');report.poses.push({...result,hand,phase});
  }
  if(hand==='right'){for(const [name,action,phase] of [['idle','idle',1],['coil','backhand',.25],['release','backhand',.62],['celebrate','celebrate',.7]]){await js(`characterQA.pose('${action}',${phase})`);await shot(`${figure}-${lod?'lite':'full'}-${name}`);}await js(`characterQA.pose('celebrate',.7)`);for(const [view,yaw]of [['back',Math.PI],['left',Math.PI/2],['right',-Math.PI/2]]){await js(`characterQA.view(${yaw})`);await shot(`${figure}-${lod?'lite':'full'}-${view}`);}}
  console.log(figure,lod?'Lite':'Full',hand,'worst stretched edges',Math.max(...report.poses.filter(p=>p.figure===figure&&p.lod===lod&&p.hand===hand).map(p=>p.stretchedEdges)));
 }
 if(!o.quick){
 const options=await js(`(async()=>{const {AVATAR_OPTIONS}=await import('/src/player.js');return AVATAR_OPTIONS;})()`);
 for(const figure of ['male','female'])for(const lod of [false,true]){
  for(const hair of options.hair){await js(`characterQA.configure(${JSON.stringify({figure,lod,hair,headwear:'none'})});characterQA.pose('idle',.5);characterQA.view(0,true);`);await shot(`${figure}-${lod?'lite':'full'}-hair-${hair}`);report.wardrobe.push(await js('characterQA.telemetry()'));}
  for(const headwear of options.headwear.filter(h=>h!=='none')){await js(`characterQA.configure(${JSON.stringify({figure,lod,hair:'short',headwear,glasses:'sport'})});characterQA.pose('idle',.5);characterQA.view(.5,true);`);await shot(`${figure}-${lod?'lite':'full'}-hat-${headwear}`);report.wardrobe.push(await js('characterQA.telemetry()'));for(const [view,yaw]of [['front',0],['back',Math.PI],['left',Math.PI/2],['right',-Math.PI/2]]){await js(`characterQA.view(${yaw},true)`);await shot(`${figure}-${lod?'lite':'full'}-hat-${headwear}-${view}`);}}
 }
 }
 report.errors=errors;report.finite=[...report.poses,...report.wardrobe].every(p=>p.finite&&p.canvasCount===1);report.passed=report.finite&&errors.length===0&&report.poses.every(p=>p.stretchedEdges===0);report.shots=shots;writeFileSync(join(out,'results.json'),JSON.stringify(report,null,2));
 // A browser-rendered contact sheet of the actual screenshots, for visual review.
 await js(`document.body.innerHTML='<style>body{margin:0;background:#172826;color:white;font:14px system-ui}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:5px}</style><div class="grid">'+${JSON.stringify(shots)}.map(n=>'<figure><img src="/'+${JSON.stringify(relative(root,out).replaceAll('\\','/'))}+'/'+n+'.jpg"><figcaption>'+n+'</figcaption></figure>').join('')+'</div>';`);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1600,deviceScaleFactor:1,mobile:false});await sleep(500);const size=await js('document.body.scrollHeight');const {data}=await send('Page.captureScreenshot',{format:'jpeg',quality:92,captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:size,scale:1}});writeFileSync(join(out,'review-board.jpg'),Buffer.from(data,'base64'));console.log('Reviewed',report.poses.length,'poses and',report.wardrobe.length,'wardrobe cases; passed',report.passed,'errors',errors.length);if(!report.passed)process.exitCode=1;
}catch(e){report.failure=String(e.stack||e);writeFileSync(join(out,'results.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;}finally{ws.close();chrome.kill();server.kill();}
