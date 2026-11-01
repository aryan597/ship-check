#!/usr/bin/env node
// Observe codex exec --json events and forward normalized activity to local Pet Patrol.
// This does not stop or gate Codex; it is an activity visualizer only.
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const prompt=process.argv.slice(2).join(' ').trim();
if(!prompt){console.error('Usage: node adapters/codex-json.mjs "your Codex task prompt"');process.exit(2);}
const base=process.env.PET_PATROL_URL||'http://127.0.0.1:4173';
const cwd=process.env.CODEX_REPO||process.cwd();
const child=spawn('codex',['exec','--json','--cd',cwd,prompt],{stdio:['ignore','pipe','inherit']});
let seq=0;
const ingests=[];
const rl=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
rl.on('line',line=>{
  process.stdout.write(line+'\n');
  let raw;try{raw=JSON.parse(line);}catch{return;}
  if(!['item.started','item.completed'].includes(raw.type))return;
  const item=raw.item||{};
  if(!['command_execution','file_change','mcp_tool_call'].includes(item.type))return;
  const action=item.command||item.title||item.type;
  const event={id:`codex-${Date.now()}-${++seq}`,actor:'Codex',kind:item.type==='command_execution'?'command':item.type==='file_change'?'write':'tool',action:`${raw.type==='item.started'?'Started':'Finished'} ${item.type.replaceAll('_',' ')}`,command:item.command||'',path:item.path||'',detail:action,risk:item.type==='file_change'?'high':'low',observeOnly:true};
  ingests.push(fetch(`${base}/api/events`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event)}).catch(err=>console.error('Pet Patrol ingest failed:',err.message)));
});
child.on('error',err=>{console.error('Could not start Codex CLI:',err.message);process.exitCode=1;});
child.on('close',async code=>{rl.close();await Promise.allSettled(ingests);process.exitCode=code??1;});
