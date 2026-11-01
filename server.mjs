import http from 'node:http';
import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 4173);
const publicDir = path.join(ROOT, 'public');
const dataDir = path.join(ROOT, 'data');
const ledger = path.join(dataDir, 'receipts.jsonl');
const clients = new Set();
const approvalWaiters = new Map();
let events = [];
let receipts = [];
let queue = Promise.resolve();

const hash = value => createHash('sha256').update(value).digest('hex');
function policy(e) {
  const s = `${e.command || ''} ${e.path || ''} ${e.detail || ''}`.toLowerCase();
  if (/curl\s.*\|\s*(ba)?sh|\.env|\.ssh|\.aws|\.\.\/|%2e%2e/i.test(s) || e.kind === 'injected_instruction') return { decision:'blocked', reason:'Dangerous command, secret path, traversal, or injected instruction' };
  if (/rm\s+-rf|git push|npm publish|chmod|sudo|write|edit|delete/.test(s) || e.risk === 'high') return { decision:'confirm', reason:'This action changes files or has a broad effect' };
  return { decision:'auto', reason:'Read-only or low-impact action' };
}
function broadcast(message) { for (const client of clients) client.write(`data: ${JSON.stringify(message)}\n\n`); }
async function receipt(e, decision, outcome) {
  const prior = receipts.at(-1)?.hash || 'GENESIS';
  const body = { id:e.id, at:new Date().toISOString(), actor:e.actor || 'Pet Patrol replay', action:e.action || e.command || e.path || e.kind, decision, outcome, reason:e.reason || '', path:e.path || '', prevHash:prior };
  const record = { ...body, hash:hash(JSON.stringify(body)) };
  receipts.push(record);
  await appendFile(ledger, JSON.stringify(record)+'\n');
  broadcast({type:'receipt', receipt:record});
  return record;
}
async function loadLedger() {
  await mkdir(dataDir,{recursive:true});
  try { const text=await readFile(ledger,'utf8'); receipts=text.trim().split('\n').filter(Boolean).map(JSON.parse); } catch { receipts=[]; }
}
function json(res, status, data) { res.writeHead(status, {'content-type':'application/json','access-control-allow-origin':'*'}); res.end(JSON.stringify(data)); }
async function body(req) { let s=''; for await (const c of req) s+=c; return s ? JSON.parse(s) : {}; }

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); return res.end(); }
  if (url.pathname === '/api/events' && req.method === 'GET') return json(res,200,events);
  if (url.pathname === '/api/receipts' && req.method === 'GET') return json(res,200,receipts);
  if (url.pathname === '/api/verify' && req.method === 'GET') {
    let diskReceipts=[];
    try { const text=await readFile(ledger,'utf8'); diskReceipts=text.trim().split('\n').filter(Boolean).map(JSON.parse); }
    catch { return json(res,200,{valid:false,at:1,error:'Receipt ledger is unreadable'}); }
    let prev='GENESIS';
    for (let i=0;i<diskReceipts.length;i++) { const {hash:given,...record}=diskReceipts[i]; if (record.prevHash!==prev || hash(JSON.stringify(record))!==given) return json(res,200,{valid:false,at:i+1}); prev=given; }
    return json(res,200,{valid:true,count:diskReceipts.length,head:prev});
  }
  if (url.pathname === '/api/stream') { res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'}); clients.add(res); res.write(`data: ${JSON.stringify({type:'snapshot',events,receipts})}\n\n`); req.on('close',()=>clients.delete(res)); return; }
  if (url.pathname === '/api/events' && req.method === 'POST') {
    try { const e=await body(req); const decision=policy(e); const enriched={...e,...decision,status:e.observeOnly?'observed':decision.decision==='confirm'?'pending':decision.decision==='blocked'?'blocked':'done'}; events.push(enriched); broadcast({type:'event',event:enriched}); if(e.observeOnly) await receipt(enriched,decision.decision,'observed'); else if(decision.decision==='auto'||decision.decision==='blocked') await receipt(enriched,decision.decision,decision.decision==='auto'?'completed':'blocked'); return json(res,201,enriched); } catch { return json(res,400,{error:'Expected a JSON event'}); }
  }
  if (url.pathname.startsWith('/api/events/') && req.method==='POST') {
    const id=decodeURIComponent(url.pathname.split('/')[3]||'');
    const e=events.find(x=>x.id===id);
    if(!e || e.status!=='pending') return json(res,409,{error:'Action is not awaiting approval'});
    const {decision:choice}=await body(req);
    if(!['approve','deny'].includes(choice)) return json(res,400,{error:'Choose approve or deny'});
    e.status=choice==='approve'?'done':'denied'; e.outcome=choice; broadcast({type:'event',event:e});
    await receipt(e,'confirm',choice);
    approvalWaiters.get(id)?.(); approvalWaiters.delete(id);
    return json(res,200,e);
  }
  if(url.pathname==='/api/replay' && req.method==='POST') {
    queue=queue.then(async()=>{
      events=[]; receipts=[]; await writeFile(ledger,'');
      const fixture=JSON.parse(await readFile(path.join(ROOT,'fixtures','trap-run.json'),'utf8'));
      broadcast({type:'reset'});
      for(const e of fixture) { const d=policy(e); const x={...e,...d,status:d.decision==='confirm'?'pending':d.decision==='blocked'?'blocked':'done'}; events.push(x); broadcast({type:'event',event:x}); if(d.decision!=='confirm') await receipt(x,d.decision,d.decision==='auto'?'completed':'blocked'); else await new Promise(resolve=>approvalWaiters.set(e.id,resolve)); await new Promise(r=>setTimeout(r,700)); }
    });
    await queue; return json(res,200,{ok:true});
  }
  if(url.pathname==='/api/scan' && req.method==='POST') {
    const {files=[]}=await body(req); const risky=files.filter(f=>/\.env|\.pem$|id_rsa|secrets?/i.test(f));
    let summary=`Local pre-flight found ${risky.length} sensitive-looking path${risky.length===1?'':'s'}. Filenames only; file contents stay on this machine.`, source='local';
    if(process.env.OPENAI_API_KEY) {
      try {
        const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-6-astra',input:`Write one calm, plain-English preflight note (max 22 words) for a developer. A local filename-only scan found ${risky.length} sensitive-looking path(s). Do not claim contents were inspected.`})});
        if(ai.ok){const data=await ai.json();const text=data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;if(text){summary=text;source='openai-responses';}}
      } catch { /* Keep the offline summary if the optional API is unavailable. */ }
    }
    return json(res,200,{risky,summary,source});
  }
  const file=path.join(publicDir,url.pathname==='/'?'index.html':path.basename(url.pathname));
  try { const ext=path.extname(file); res.writeHead(200,{'content-type':ext==='.css'?'text/css':ext==='.js'?'text/javascript':'text/html'}); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end('Not found'); }
});
await loadLedger();
server.listen(PORT,'127.0.0.1',()=>console.log(`Pet Patrol at http://127.0.0.1:${PORT}`));
