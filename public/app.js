const $=s=>document.querySelector(s),feed=$('#feed'),walker=$('#walker');
let events=[],receipts=[],selected=null,motion=Promise.resolve(),lastBranch=null,lastGateT=.42;
const visited=new Set(),plaza={x:50,y:52};
const icons={scan:'🔎',read:'📖',write:'🛠️',command:'⚡',injected_instruction:'📜'};
const branches={
  'src/app.ts':{c1:[38,50],c2:[23.5,56.7]},
  'src/greeting.ts':{c1:[47,60.6],c2:[44.5,65.8]},
  'README.md':{c1:[43,42.3],c2:[35,37.5]},
  '.env':{c1:[64,39.4],c2:[74,38.5]},
  'docs/NOTES.md':{c1:[65,62.5],c2:[76.5,71.2]}
};
let walkerPoint={...plaza};

function render(){
  $('#action-count').textContent=events.length;
  $('#pending-count').textContent=events.filter(e=>e.status==='pending').length;
  $('#blocked-count').textContent=events.filter(e=>e.status==='blocked').length;
  $('#feed-count').textContent=events.length;
  $('#pet-state').textContent=events.some(e=>e.status==='pending')?'Waiting at the toll gate':events.length?'Patrol in progress':'Ready for a walk';
  if(!events.length){feed.innerHTML='<div class="empty"><div>🦴</div><strong>All quiet on the street</strong><small>Start the replay to see Mochi patrol.</small></div>';return;}
  feed.innerHTML=[...events].reverse().map(e=>`<div class="feed-row" data-id="${esc(e.id)}"><div class="event-icon">${icons[e.kind]||'🐾'}</div><div class="event-main"><strong>${esc(e.action)}</strong><small>${esc(e.path||e.command||'repository')}</small></div><span class="tag ${e.status==='observed'?'observed':e.status==='pending'?'confirm':e.status==='blocked'?'blocked':e.status==='denied'?'denied':''}">${e.status==='observed'?`OBS · ${e.decision.toUpperCase()}`:e.status==='pending'?'CONFIRM':e.status==='denied'?'DENIED':e.status==='done'&&e.decision==='confirm'?'APPROVED':e.decision.toUpperCase()}</span></div>`).join('');
  feed.querySelectorAll('.feed-row').forEach(row=>row.onclick=()=>{const e=events.find(x=>x.id===row.dataset.id);if(e?.status==='pending')openApproval(e);else showReceipt(row.dataset.id);});
  for(const e of events)if(e.status==='blocked')document.querySelector(`[data-file="${CSS.escape(e.path)}"]`)?.classList.add('risky');
}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showReceipt(id){const r=receipts.find(x=>x.id===id);if(!r)return;$('#receipt-detail').innerHTML=`<div class="receipt-row"><strong>${esc(r.action)}</strong><div class="receipt-meta">${esc(r.decision)} · ${esc(r.outcome)} · ${esc(r.at)}</div><code class="hash">${r.hash}</code><div class="receipt-meta">prev ${r.prevHash.slice(0,18)}…</div></div>`;}
function updateReceipts(list){receipts=list;const r=receipts.at(-1);if(r)showReceipt(r.id);}
function animateCurve(from,c1,c2,to,duration){
  walker.classList.add('trotting');
  return new Promise(resolve=>{const start=performance.now();function frame(now){const p=Math.min(1,(now-start)/duration),t=1-Math.pow(1-p,3),u=1-t;
    const x=u*u*u*from.x+3*u*u*t*c1[0]+3*u*t*t*c2[0]+t*t*t*to.x;
    const y=u*u*u*from.y+3*u*u*t*c1[1]+3*u*t*t*c2[1]+t*t*t*to.y;
    walker.style.left=`${x}%`;walker.style.top=`${y}%`;if(p<1)requestAnimationFrame(frame);else{walkerPoint={...to};walker.classList.remove('trotting');resolve();}}
    requestAnimationFrame(frame);
  });
}
async function walkTo(path){
  const branch=branches[path],house=document.querySelector(`[data-file="${CSS.escape(path||'')}"]`);
  if(!branch||!house)return;
  const [x,y]=house.dataset.pos.split(',').map(Number),target={x,y};
  if(lastBranch){const prior=branches[lastBranch],[px,py]=document.querySelector(`[data-file="${CSS.escape(lastBranch)}"]`).dataset.pos.split(',').map(Number);await animateCurve(walkerPoint,prior.c2,prior.c1,plaza,300);walkerPoint={...plaza};}
  await animateCurve(walkerPoint,branch.c1,branch.c2,target,lastBranch?300:600);
  lastBranch=path;
  document.querySelectorAll('.house').forEach(h=>h.classList.toggle('active',h===house));
}
function branchPoint(path,t){const b=branches[path],[x,y]=document.querySelector(`[data-file="${CSS.escape(path)}"]`).dataset.pos.split(',').map(Number),from=plaza,u=1-t;return{x:u*u*u*from.x+3*u*u*t*b.c1[0]+3*u*t*t*b.c2[0]+t*t*t*x,y:u*u*u*from.y+3*u*u*t*b.c1[1]+3*u*t*t*b.c2[1]+t*t*t*y};}
function lerp(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
async function animateBranchRange(path,fromT,toT,duration){const b=branches[path],house=document.querySelector(`[data-file="${CSS.escape(path)}"]`),[x,y]=house.dataset.pos.split(',').map(Number),p0=plaza,p1={x:b.c1[0],y:b.c1[1]},p2={x:b.c2[0],y:b.c2[1]},p3={x,y};walker.classList.add('trotting');return new Promise(resolve=>{const start=performance.now();function frame(now){const p=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-p,3),t=fromT+(toT-fromT)*ease,u=1-t;const point={x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};walker.style.left=`${point.x}%`;walker.style.top=`${point.y}%`;if(p<1)requestAnimationFrame(frame);else{walkerPoint=point;walker.classList.remove('trotting');resolve();}}requestAnimationFrame(frame);});}
async function stopAtGate(path){const [,houseY]=document.querySelector(`[data-file="${CSS.escape(path)}"]`).dataset.pos.split(',').map(Number);lastGateT=houseY>62?.42:.74;await animateBranchRange(path,1,lastGateT,320);const p=branchPoint(path,lastGateT),gate=$('#gate'),card=$('#approval-card'),gateX=Math.max(16,Math.min(84,p.x<50?p.x-3:p.x+3)),cardX=Math.max(20,Math.min(80,p.x<50?gateX+18:gateX-18));gate.style.left=`${gateX}%`;gate.style.top=`${p.y}%`;card.style.left=`${cardX}%`;card.style.top=`${Math.max(34,p.y-3)}%`;card.style.setProperty('--tail-x',p.x<50?'10%':'90%');}
async function returnToPlaza(){
  if(!lastBranch)return;
  const endpoint=branchPoint(lastBranch,1),fromT=Math.hypot(walkerPoint.x-endpoint.x,walkerPoint.y-endpoint.y)<1?1:lastGateT;
  await animateBranchRange(lastBranch,fromT,0,360);lastBranch=null;walkerPoint={...plaza};
}
function openApproval(e){selected=e;$('.gate').classList.remove('lifted');$('.gate').classList.add('show');$('#approval-command').textContent=e.command||e.detail||e.path||e.action;$('#approval-reason').textContent=e.reason;$('#approval-card').classList.add('open');}
const source=new EventSource('/api/stream');
source.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.type==='snapshot'){events=m.events;updateReceipts(m.receipts);render();}
  if(m.type==='reset'){events=[];receipts=[];visited.clear();selected=null;motion=motion.then(()=>returnToPlaza());document.querySelectorAll('.house').forEach(h=>{h.classList.remove('active');if(h.dataset.file!=='.env')h.classList.remove('risky');});$('#approval-card').classList.remove('open');$('.gate').classList.remove('show','lifted');$('#receipt-detail').innerHTML='<div class="empty-receipt">Waiting for the first pawprint…</div>';render();}
  if(m.type==='event'){
    const e=m.event,old=events.find(x=>x.id===e.id);if(old)Object.assign(old,e);else events.push(e);render();
    if(e.status==='pending'&&!visited.has(e.id)){visited.add(e.id);motion=motion.then(async()=>{await walkTo(e.path);await stopAtGate(e.path);openApproval(e);});}
    else if(e.status!=='pending'&&!visited.has(e.id)){visited.add(e.id);motion=motion.then(()=>walkTo(e.path));}
  }
  if(m.type==='receipt'){receipts.push(m.receipt);showReceipt(m.receipt.id);}
};
$('#replay').onclick=async()=>{const b=$('#replay');b.disabled=true;b.textContent='🐾 Mochi is walking…';try{const r=await fetch('/api/replay',{method:'POST'});if(!r.ok)throw new Error('Replay request failed');}catch(e){$('#pet-state').textContent='Could not reach the local server';console.error(e);}finally{b.disabled=false;b.textContent='↻ Replay trap run';$('.gate').classList.remove('show');}};
async function decide(choice){if(!selected)return;const e=selected,b=$('#gate');$('#approval-card').classList.remove('open');if(choice==='approve'){b.classList.add('lifted');await new Promise(r=>setTimeout(r,420));await animateBranchRange(e.path,lastGateT,1,300);}else{walker.classList.add('turning');await returnToPlaza();walker.classList.remove('turning');document.querySelectorAll('.house').forEach(h=>h.classList.remove('active'));}b.classList.remove('show','lifted');selected=null;await fetch(`/api/events/${encodeURIComponent(e.id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:choice})});}
$('#approve').onclick=()=>decide('approve');$('#deny').onclick=()=>decide('deny');
$('#verify').onclick=async()=>{const r=await fetch('/api/verify').then(r=>r.json());$('#verify-status').textContent=r.valid?`Verified · ${r.count} receipts`:`TAMPERED at #${r.at}`;$('#verify-status').style.color=r.valid?'#438653':'#c54543';};
document.querySelectorAll('.house').forEach(h=>h.onclick=()=>{const e=events.findLast(e=>e.path===h.dataset.file);if(e)showReceipt(e.id);});
fetch('/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({files:['src/app.ts','src/greeting.ts','README.md','.env','docs/NOTES.md']})}).then(r=>r.json()).then(scan=>{for(const file of scan.risky)document.querySelector(`[data-file="${CSS.escape(file)}"]`)?.classList.add('risky');$('.small-pill').textContent=`PRE-FLIGHT · ${scan.risky.length} red flag${scan.risky.length===1?'':'s'}`;$('.small-pill').title=scan.summary;}).catch(()=>{});
