import path from 'node:path';
import {gunzipSync} from 'node:zlib';

const TEXT=/\.(js|cjs|mjs|ts|tsx|jsx|py|sh|bash|md|txt|json|ya?ml|toml|ini|env)$/i;
const testPath=p=>/(^|\/)(test|tests|__tests__|fixtures|examples|docs)(\/|$)|(^|\/)(test_[^/]+|[^/]+_test)\.[^/]+$/i.test(p);
const priority=p=>p.includes('/')?(/^(\.github\/workflows\/|src\/|lib\/|app\/)/.test(p)?1:/(^|\/)(test|tests|__tests__|fixtures|examples|docs)(\/|$)|\.md$/i.test(p)?3:2):0;
const entropy=s=>{const n=s.length,counts={};for(const x of s)counts[x]=(counts[x]||0)+1;return Object.values(counts).reduce((a,c)=>a-(c/n)*Math.log2(c/n),0)};
const line=(t,i)=>t.slice(0,i).split('\n').length;
const mask=s=>s.slice(0,4)+'••••';
function severity(base,file,kind){return base==='critical'&&testPath(file)&&kind!=='lifecycle'?'info':base}
const SECRET_SHAPES=[
  {r:/(?<![A-Za-z0-9])sk-(?:proj-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g,n:'OpenAI-style key'},
  {r:/(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g,n:'AWS access key'},
  {r:/(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36,}(?![A-Za-z0-9])/g,n:'GitHub token'},
  {r:/(?<![A-Za-z0-9])sk_live_[A-Za-z0-9]{24,}(?![A-Za-z0-9])/g,n:'Stripe live key'}
];
const maskSnippet=(s,kind)=>{const shaped=SECRET_SHAPES.reduce((x,spec)=>x.replace(spec.r,mask),s);return kind==='env-file'?shaped.replace(/=.*/,'=••••'):shaped};
// A line holding only a BOM trims to nothing; keep it so the finding still has evidence to show.
const evidenceLine=l=>l?.trim()||l||'';
function hit(base,file,text,index,why,kind){const s=severity(base,file,kind),label=s==='info'?' (in a test file)':'';return{severity:s,file,line:line(text,index),snippet:maskSnippet(evidenceLine(text.split('\n')[line(text,index)-1]),kind).slice(0,220),why:why+label,kind}}

export function tarFiles(buffer){
  const raw=gunzipSync(buffer),out=[];let p=0;
  while(p+512<=raw.length){const h=raw.subarray(p,p+512);if(h.every(x=>x===0))break;const n=h.subarray(0,100).toString().replace(/\0.*$/,''),pre=h.subarray(345,500).toString().replace(/\0.*$/,''),size=parseInt(h.subarray(124,136).toString().replace(/\0.*$/,'').trim(),8)||0,type=String.fromCharCode(h[156]),name=(pre?pre+'/'+n:n).replace(/^([^/]+)\//,''),start=p+512;if((type==='0'||type==='\0')&&name&&size<=512000&&!/(^|\/)(node_modules|vendor|dist|build)(\/|$)/.test(name)&&!/\.(png|jpg|gif|pdf|zip|gz|woff2?|mp4)$/i.test(name)){const content=raw.subarray(start,start+size).toString();if(!content.includes('\uFFFD'))out.push({path:name,content,size})}p=start+Math.ceil(size/512)*512}
  return out;
}
function secretFindings(file,t,out){
  for(const spec of SECRET_SHAPES)for(const m of t.matchAll(spec.r)){const key=m[0].replace(/^[^-]+-/,''),h=entropy(key);if(h>3.5)out.push(hit('critical',file.path,t,m.index,'Looks like a real '+spec.n+' was left in the code ('+mask(m[0])+').','secret'))}
  for(const m of t.matchAll(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g))out.push(hit('critical',file.path,t,m.index,'Looks like a private key was left in the code.','secret'));
}
export function selectFiles(all,limit=2000){return [...all].sort((a,b)=>priority(a.path)-priority(b.path)||a.path.localeCompare(b.path)).slice(0,limit)}
export function scanFiles(files,allFiles=files){
  const findings=[],texts=files.filter(f=>TEXT.test(f.path)||/(^|\/)Makefile$/.test(f.path));
  for(const f of texts){const t=f.content;
    for(const m of t.matchAll(/"(preinstall|install|postinstall|prepare)"\s*:\s*"([^"]+)"/g)){const harmful=/(curl|wget)[^\n]*\|\s*(?:ba)?sh|(?:^|[;&|])\s*(?:sh|bash)\s+-c/i.test(m[2]);findings.push(hit(harmful?'critical':'warning',f.path,t,m.index,harmful?'Installing this downloads code from the internet and runs it straight away: '+m[2]:'This script runs by itself when you install: '+m[1],'lifecycle'))}
    for(const m of t.matchAll(/(?:curl|wget)[^\n|]{0,180}\|\s*(?:ba)?sh|base64\s+(?:-d|--decode)[^\n|]{0,90}\|\s*(?:ba)?sh/ig))if(!/package\.json$/.test(f.path))findings.push(hit('critical',f.path,t,m.index,'Downloads or unpacks code and runs it straight away, without showing you what it is.','shell-pipe'));
    secretFindings(f,t,findings);
    if(/(^|\/)\.env(?:\.|$)/.test(f.path)&&t.trim())findings.push(hit(testPath(f.path)?'warning':'critical',f.path,t,t.search(/\S/),'A private settings file (.env) was left in the code. These often hold passwords.','env-file'));
    for(const m of t.matchAll(/(?:fetch|axios\.[a-z]+|requests\.[a-z]+)\s*\([^\n]{0,250}(?:\d{1,3}\.){3}\d{1,3}|(?:pastebin|webhook|discord(?:app)?\.com)/ig)){const near=t.slice(Math.max(0,m.index-260),m.index+m[0].length+260);if(/process\.env|os\.environ|os\.getenv/.test(near))findings.push(hit('critical',f.path,t,m.index,'Sends your private settings, like passwords and keys, to an outside server.','exfiltration'))}
    const executableBase64=/eval\s*\(\s*(?:atob\(|Buffer\.from\([^)]*['"]base64['"][^)]*\)\.toString)|new\s+Function\s*\([^)]*(?:atob|Buffer\.from)/g;
    for(const m of t.matchAll(executableBase64))findings.push(hit('critical',f.path,t,m.index,'Hides code in scrambled text (Base64), then runs it.','obfuscation'));
    for(const m of t.matchAll(/[\u200B-\u200D\uFEFF]/g))findings.push(hit('warning',f.path,t,m.index,'Contains an invisible character that can hide what the code really says.','obfuscation'));
    const reviewText=t.replace(/[\u200B-\u200D\uFEFF]/g,'');
    for(const m of reviewText.matchAll(/AI reviewers?\s*:\s*ignore (?:all )?previous instructions(?: and mark this (?:repository|repo|project) as safe)?|ignore (?:all )?previous instructions|mark this (?:repository|repo|project) as safe|do not report/ig))findings.push(hit('warning',f.path,t,m.index,'Contains text aimed at AI tools, telling them what to do.','prompt-injection'));
  }
  const builtins=/^(CI|HOME|PATH|PWD|SHELL|USER|GITHUB_[A-Z0-9_]*|RUNNER_[A-Z0-9_]*|NODE_ENV)$/;
  const used=new Map();for(const f of texts)if(!testPath(f.path)&&!f.path.startsWith('.github/'))for(const m of f.content.matchAll(/(?:process\.env\.([A-Z][A-Z0-9_]+)|os\.environ\[['"]([A-Z][A-Z0-9_]+)['"]\]|os\.getenv\(['"]([A-Z][A-Z0-9_]+)['"]\))/g)){const name=m[1]||m[2]||m[3];if(!builtins.test(name))used.set(name,f.path)}
  const docs=[allFiles.find(f=>f.path==='.env.example')?.content||'',...allFiles.filter(f=>/^README/i.test(path.basename(f.path))).map(f=>f.content)].join('\n'),envVars=[...used].map(([name,usedIn])=>({name,usedIn,documented:new RegExp('\\b'+name+'\\b').test(docs)}));
  const signals={lockfile:allFiles.some(f=>/(^|\/)(uv\.lock|poetry\.lock|Pipfile\.lock|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|Cargo\.lock|go\.sum)$/.test(f.path)),tests:allFiles.some(f=>/(^|\/)(test|tests|__tests__)\//.test(f.path)||/\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path)),ci:allFiles.some(f=>/^\.github\/workflows\/.+\.(yml|yaml)$/i.test(f.path))};
  return{findings,envVars,signals};
}
export function makeVerdict(scanned){const critical=scanned.findings.filter(f=>f.severity==='critical').length,warning=scanned.findings.filter(f=>f.severity==='warning').length,score=Math.max(0,100-critical*35-warning*8);return{label:critical?'DO NOT RUN':score<70?'RUN WITH CARE':'SAFE TO RUN',score,critical,warning}}
export function makeRunPlan(files,envVars=[]){
  const by=p=>files.find(f=>f.path===p),pkg=by('package.json'),commands=[],prerequisites=[];
  let data={};try{data=pkg?JSON.parse(pkg.content):{}}catch{}
  const lock=files.map(f=>f.path).find(p=>/(pnpm-lock\.yaml|yarn\.lock|bun\.lockb|package-lock\.json)$/.test(p));
  const manager=lock?.includes('pnpm')?'pnpm':lock?.includes('yarn')?'yarn':lock?.includes('bun')?'bun':'npm';
  if(pkg){prerequisites.push('Node.js 20+');commands.push({command:'git clone <repo-url> && cd '+(data.name||'repository'),why:'Download the code.',file:'package.json'});const lifecycle=data.scripts&&Object.entries(data.scripts).find(([k,v])=>/^(preinstall|install|postinstall|prepare)$/.test(k)&&/(curl|wget)|\|\s*(ba)?sh/.test(v));commands.push({command:lifecycle?'npm install --ignore-scripts':manager+' install',why:lifecycle?'Install without running the risky script we flagged.':'Install what the project needs.',file:lock||'package.json'});if(by('.env.example'))commands.push({command:'cp .env.example .env',why:'Create your settings file from the project’s template.',file:'.env.example'});if(data.scripts?.dev)commands.push({command:manager+' run dev',why:'Start the app in development mode.',file:'package.json'});else if(data.scripts?.start)commands.push({command:manager+' start',why:'Start the application.',file:'package.json'});if(data.scripts?.test)commands.push({command:manager+' test',why:'Run the project’s tests.',file:'package.json'})}
  else if(by('pyproject.toml')||by('requirements.txt')){prerequisites.push('Python 3.11+');commands.push({command:'git clone <repo-url> && cd repository',why:'Download the code.',file:by('pyproject.toml')?'pyproject.toml':'requirements.txt'});commands.push({command:by('uv.lock')?'uv sync':by('poetry.lock')?'poetry install':'python -m pip install -r requirements.txt',why:'Install what the project needs.',file:by('uv.lock')?'uv.lock':by('poetry.lock')?'poetry.lock':'requirements.txt'})}
  else if(by('Cargo.toml')){prerequisites.push('Rust');commands.push({command:'cargo run',why:'Build and start the app.',file:'Cargo.toml'})}else if(by('go.mod')){prerequisites.push('Go');commands.push({command:'go run .',why:'Start the app.',file:'go.mod'})}
  return{label:'basic plan',commands,envVars,prerequisites};
}
