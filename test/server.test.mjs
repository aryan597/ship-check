import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const PORT=4194,server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:'ignore'});
const scan=async repo=>(await (await fetch(`http://127.0.0.1:${PORT}/api/scan-stream?repo=${encodeURIComponent(repo)}`)).text()).split('\n\n').filter(Boolean).map(x=>JSON.parse(x.slice(6)));
test.before(()=>new Promise(r=>setTimeout(r,500)));
test.after(()=>server.kill());

test('local scans cannot escape the fixture folder',async()=>{for(const repo of ['local:demo/trap-repo/../..','local:demo/trap-repo/../../..','local:demo/trap-repo/..']){const events=await scan(repo);assert.ok(events.some(e=>e.type==='error'),repo);assert.ok(!events.some(e=>e.type==='complete'),repo)}});
test('the fixture itself still scans',async()=>{const done=(await scan('local:demo/trap-repo')).find(e=>e.type==='complete');assert.equal(done.result.verdict.label,'DO NOT RUN');assert.equal(done.result.ref,'local fixture')});
