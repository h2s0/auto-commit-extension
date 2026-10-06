import { readFile, readdir, access } from 'node:fs/promises';
import { Script } from 'node:vm';
import { dirname, resolve } from 'node:path';
const manifest = JSON.parse(await readFile('dist/manifest.json','utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
for (const path of [manifest.background.service_worker,manifest.action.default_popup,manifest.options_page,...manifest.content_scripts.flatMap(entry=>entry.js)]) await access(`dist/${path}`);
let files=0;
async function verify(dir) {
 for (const entry of await readdir(dir,{withFileTypes:true})) {
  const file=`${dir}/${entry.name}`;
  if(entry.isDirectory()) await verify(file);
  else if(file.endsWith('.js')) {
   files++;
   const source=await readFile(file,'utf8');
   if(file.includes('/injected/')) new Script(source,{filename:file}); // MAIN script must parse as a classic script.
   for(const [,path] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if(!path.endsWith('.js')) throw new Error(`Uncompiled import in ${file}: ${path}`);
    await access(resolve(dirname(file),path));
   }
  }
 }
}
await verify('dist/src');
console.log(`Manifest entrypoints, MAIN script syntax, and imports verified (${files} JavaScript files).`);
