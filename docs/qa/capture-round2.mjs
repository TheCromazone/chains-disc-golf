// Reproducible screenshot and six-viewport audit runner. Run with installed Playwright.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? require(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const browser = await chromium.launch({headless:true});
const dir = new URL('./', import.meta.url); await mkdir(dir,{recursive:true});
const sizes = process.argv.includes('--all') ? [[360,740],[430,932],[812,375],[568,320],[768,1024],[1366,768]] : [[430,932]];
const prefix = process.env.QA_PREFIX || '08';
const audit = await readFile(new URL('overlap-audit.js',dir),'utf8');
const results=[];
for (const [width,height] of sizes) {
  const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
  const page=await context.newPage(), errors=[], requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  page.on('response',async r=>{try{const b=await r.body(); requests.push({url:r.url(),bytes:b.length,status:r.status()});}catch{}});
  await page.goto('http://localhost:8093'); await page.waitForFunction(()=>!!window.__chains,{timeout:60000});
  await page.waitForTimeout(1000);
  const startup=await page.evaluate(()=>[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')].map(r=>({url:r.name,encoded:r.encodedBodySize,transfer:r.transferSize})));
  await page.screenshot({path:fileURLToPath(new URL(`${prefix}-clubhouse-${width}.png`,dir))});
  await page.locator('#btnLocker').click(); await page.waitForTimeout(1200);
  await page.screenshot({path:fileURLToPath(new URL(`${prefix}-locker-${width}.png`,dir))});
  await page.locator('#btnLockerDone').click();
  const result=JSON.parse(await page.evaluate(`(async()=>{${audit.replace('JSON.stringify({ vw:', 'return JSON.stringify({ vw:')}})()`));
  await page.evaluate(()=>{document.getElementById('score').classList.add('hidden');document.getElementById('hud').classList.remove('hidden');window.__chains.G.phase='aim';window.__chains.cam.mode='aim';window.__chains.G.introT=10;});
  await page.waitForTimeout(3000);
  await page.screenshot({path:fileURLToPath(new URL(`${prefix}-hud-${width}.png`,dir))});
  if (width===430) { await page.evaluate(async()=>{const ui=await import('/src/ui.js');ui.toast('Chains!','Birdie · one under par',10000);}); await page.screenshot({path:fileURLToPath(new URL(`${prefix}-feedback-${width}.png`,dir))}); }
  results.push({width,height,result,errors,startup,requests});
  await context.close();
}
await writeFile(new URL(`${prefix}-browser-results.json`,dir),JSON.stringify(results,null,2));
await browser.close();
console.log(JSON.stringify(results.map(({width,height,result,errors,startup})=>({width,height,result,errors,localEncoded:startup.reduce((s,r)=>s+r.encoded,0)})),null,2));
