// Compile the runtime's exact paths once. PNG is source; KTX2 is the shipped Full atlas.
import { createRequire } from 'node:module';import { mkdir,writeFile } from 'node:fs/promises';import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
await page.goto('http://localhost:8093/docs/qa/character-inspector.html?quality=low');await page.waitForFunction(()=>window.characterQA?.ready);
const data=await page.evaluate(()=>window.characterQA.drawFaceAtlas(document.createElement('canvas')).toDataURL('image/png').split(',')[1]);
await mkdir('assets/appearance',{recursive:true});await writeFile('assets/appearance/face-parts.png',Buffer.from(data,'base64'));await browser.close();
execFileSync(process.env.TOKTX||'C:/Users/matth/.codex/tools/ktx/bin/toktx.exe',['--t2','--encode','uastc','--assign_oetf','srgb','--zcmp','18','--threads','4','assets/appearance/face-parts.ktx2','assets/appearance/face-parts.png'],{stdio:'inherit'});
