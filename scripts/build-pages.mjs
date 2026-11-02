// Builds the GitHub Pages showcase in docs/: the real UI, replaying real recorded
// scans, because Pages can't run the Node scanner. Requires network for public repos.
import {spawn} from 'node:child_process';
import {copyFile,readFile,readdir,writeFile} from 'node:fs/promises';

const PORT=4188,BASE='https://aryan597.github.io/ship-check/',REPOS=['local:demo/trap-repo','sindresorhus/ky','langchain-ai/langchain'];
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(PORT),OPENAI_API_KEY:''},stdio:'ignore'});
try{
  await new Promise(r=>setTimeout(r,500));
  const scans={};
  for(const repo of REPOS){
    const text=await (await fetch(`http://127.0.0.1:${PORT}/api/scan-stream?repo=${encodeURIComponent(repo)}`)).text();
    const events=text.split('\n\n').filter(Boolean).map(x=>JSON.parse(x.slice(6)));
    if(!events.some(e=>e.type==='complete'))throw Error('Scan failed for '+repo+': '+text);
    scans[repo]=events;
    console.log(repo,events.at(-1).result.verdict);
  }
  await writeFile('docs/scans.json',JSON.stringify(scans));
  for(const name of await readdir('public'))if(name!=='index.html')await copyFile('public/'+name,'docs/'+name);
  const og=`<meta property="og:title" content="Never npm install a stranger's repo blindly."><meta property="og:description" content="ShipCheck reads a project's code without running it and shows you the exact lines that could hurt you."><meta property="og:image" content="${BASE}og.png"><meta property="og:url" content="${BASE}"><meta name="twitter:card" content="summary_large_image">`;
  const html=(await readFile('public/index.html','utf8')).replace('<html lang="en">','<html lang="en" data-mode="replay">').replace('<!--og-->',og);
  await writeFile('docs/index.html',html);
}finally{server.kill()}
