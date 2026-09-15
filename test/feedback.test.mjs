import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('function onFlightEvent('),source.indexOf('function resolveThrow('));
function run(holed,events){const calls=[];const G={flight:{result:{holed},params:{power:.9}}};const context=vm.createContext({G,sfx:new Proxy({}, {get:(_,n)=>(...args)=>calls.push([n,...args])}),UI:{toast:(...a)=>calls.push(['toast',...a])}});vm.runInContext(handler,context);for(const event of events)context.onFlightEvent(event);return calls;}
assert.equal(run(true,['rim','drop']).filter(c=>c[0]==='ohh').length,0,'ricochet makes never trigger disappointment');
assert.equal(run(false,['rim','band','chainout']).filter(c=>c[0]==='ohh').length,1,'one gallery miss reaction per throw');
assert.deepEqual(run(true,['chains'])[0],['chains',.9],'chain playback receives speed class input');
assert(run(true,['chains']).some(c=>c[0]==='toast'&&c[1]==='Chains!'));
console.log('Feedback event outcomes OK');
