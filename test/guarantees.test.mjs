import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {scanFiles} from '../scanner.mjs';

const ALLOWED_IMPORTS=new Set(['node:http','node:fs/promises','node:path','node:url','node:zlib','./scanner.mjs']);
const FORBIDDEN=/child_process|node:vm|worker_threads|node:cluster|writeFile|appendFile|createWriteStream|mkdtemp|\bimport\s*\(/;
const file=(p,content)=>({path:p,content,size:content.length});
async function trapFiles(dir='demo/trap-repo'){const out=[];async function walk(folder){for(const name of await readdir(folder)){const full=path.join(folder,name),info=await stat(full);if(info.isDirectory())await walk(full);else out.push(file(path.relative(dir,full).split(path.sep).join('/'),await readFile(full,'utf8')))}}await walk(dir);return out}

test('never executes a line: the scanner cannot spawn processes or write to disk',async()=>{for(const name of ['scanner.mjs','server.mjs']){const source=await readFile(name,'utf8');for(const [,spec] of source.matchAll(/^import\s.*?from\s+'([^']+)'/gm))assert.ok(ALLOWED_IMPORTS.has(spec),name+' imports '+spec);assert.doesNotMatch(source,FORBIDDEN,name)}});
test('no evidence, no finding: every finding has a file, a line, and a snippet',async()=>{const edgeCases=[file('.env','\n\nDB_PASSWORD=hunter2hunter2'),file('src/a.js','﻿\nconst ok=1'),file('src/b.js','​')],scan=scanFiles([...await trapFiles(),...edgeCases]);assert.ok(scan.findings.length>10);for(const f of scan.findings){assert.ok(f.file,'missing file');assert.ok(f.line>0,'missing line in '+f.file);assert.ok(f.snippet.length>0,'missing snippet in '+f.file+':'+f.line)}});
