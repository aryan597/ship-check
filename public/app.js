const $=s=>document.querySelector(s), feed=$('#feed');
let events=[], receipts=[], selected=null;
const icons={scan:'🔎',read:'📖',write:'🛠️',command:'⚡',injected_instruction:'📜'};
function render(){
  $('#action-count').textContent=events.length;
  $('#pending-count').textContent=events.filter(e=>e.status==='pending').length;
  $('#blocked-count').textContent=events.filter(e=>e.status==='blocked').length;
  $('#feed-count').textContent=events.length;
  $('#pet-state').textContent=events.some(e=>e.status==='pending')?'Waiting at the toll gate':events.length?'Patrol in progress':'Ready for a walk';
  if(!events.length){feed.innerHTML='<div class="empty"><div>🦴</div><strong>All quiet on the street</strong><small>Start the replay to see Mochi patrol.</small></div>';return;}
  feed.innerHTML=[...events].reverse().map(e=>`<div class="feed-row" data-id="${e.id}"><div class="event-icon">${icons[e.kind]||'🐾'}</div><div class="event-main"><strong>${esc(e.action)}</strong><small>${esc(e.path||e.command||'repository')}</small></div><span class="tag ${e.status==='observed'?'observed':e.status==='pending'?'confirm':e.status==='blocked'?'blocked':e.status==='denied'?'denied':''}">${e.status==='observed'?`OBS · ${e.decision.toUpperCase()}`:e.status==='pending'?'CONFIRM':e.status==='denied'?'DENIED':e.status==='done'&&e.decision==='confirm'?'APPROVED':e.decision.toUpperCase()}</span></div>`).join('');
  feed.querySelectorAll('.feed-row').forEach(row=>row.onclick=()=>showReceipt(row.dataset.id));
  document.querySelectorAll('.house').forEach(h=>h.classList.remove('active'));
  for(const e of events){if(e.status==='blocked'){document.querySelector(`[data-file="${CSS.escape(e.path)}"]`)?.classList.add('risky');}}
}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function showReceipt(id){const r=receipts.find(x=>x.id===id);if(!r)return;$('#receipt-detail').innerHTML=`<div class="receipt-row"><strong>${esc(r.action)}</strong><div class="receipt-meta">${esc(r.decision)} · ${esc(r.outcome)} · ${esc(r.at)}</div><code class="hash">${r.hash}</code><div class="receipt-meta">prev ${r.prevHash.slice(0,18)}…</div></div>`;}
function updateReceipts(list){receipts=list;const r=receipts.at(-1);if(r)showReceipt(r.id);}
const source=new EventSource('/api/stream');
source.onmessage=({data})=>{const m=JSON.parse(data);if(m.type==='snapshot'){events=m.events;updateReceipts(m.receipts);render();}if(m.type==='reset'){events=[];receipts=[];$('#receipt-detail').innerHTML='<div class="empty-receipt">Waiting for the first pawprint…</div>';render();}if(m.type==='event'){const i=events.findIndex(e=>e.id===m.event.id);if(i<0)events.push(m.event);else events[i]=m.event;render();const e=m.event;if(e.status==='pending'){selected=e;$('.gate').classList.add('show');const house=document.querySelector(`[data-file="${CSS.escape(e.path)}"]`);house?.classList.add('active');$('#walker').style.left='50%';$('#walker').style.top='65%';$('#modal-title').textContent='Mochi reached the toll gate';$('#modal-copy').textContent=e.reason;$('#modal-action').textContent=`${e.action} · ${e.path||e.command||''}`;$('#modal').classList.add('open');}}if(m.type==='receipt'){receipts.push(m.receipt);showReceipt(m.receipt.id);}};
$('#replay').onclick=async()=>{const b=$('#replay');b.disabled=true;b.textContent='🐾 Mochi is walking…';try{await fetch('/api/replay',{method:'POST'});}finally{b.disabled=false;b.textContent='↻ Replay trap run';$('.gate').classList.remove('show');$('#walker').style.left='19%';$('#walker').style.top='68%';}};
async function decide(choice){if(!selected)return;const e=selected;$('#modal').classList.remove('open');$('.gate').classList.remove('show');selected=null;await fetch(`/api/events/${encodeURIComponent(e.id)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:choice})});}
$('#approve').onclick=()=>decide('approve');$('#deny').onclick=()=>decide('deny');$('#close').onclick=()=>$('#modal').classList.remove('open');
$('#verify').onclick=async()=>{const r=await fetch('/api/verify').then(r=>r.json());$('#verify-status').textContent=r.valid?`Verified · ${r.count} receipts`:`TAMPERED at #${r.at}`;$('#verify-status').style.color=r.valid?'#438653':'#c54543';};
document.querySelectorAll('.house').forEach(h=>h.onclick=()=>{const e=events.findLast(e=>e.path===h.dataset.file);if(e)showReceipt(e.id);});
fetch('/api/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({files:['src/app.ts','src/greeting.ts','README.md','.env','docs/NOTES.md']})}).then(r=>r.json()).then(scan=>{for(const file of scan.risky)document.querySelector(`[data-file="${CSS.escape(file)}"]`)?.classList.add('risky');$('.small-pill').textContent=`PRE-FLIGHT · ${scan.risky.length} red flag${scan.risky.length===1?'':'s'}`;$('.small-pill').title=scan.summary;}).catch(()=>{});
