import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
let oauth={clientId:'',brokerUrl:''};
try {
  const raw=JSON.parse(await readFile('auth.config.json','utf8'));
  if(Object.keys(raw).some(key=>!['clientId','brokerUrl'].includes(key))) throw new Error('auth.config.json accepts only public clientId and brokerUrl. Never put a client secret in the extension.');
  if(typeof raw.clientId!=='string'||typeof raw.brokerUrl!=='string'||!raw.clientId) throw new Error('Set public OAuth clientId and brokerUrl.');
  const url=new URL(raw.brokerUrl);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))) throw new Error('OAuth broker must use HTTPS (HTTP loopback is development-only).');
  oauth={clientId:raw.clientId,brokerUrl:url.origin};
} catch(error) {
  if(error.code!=='ENOENT') throw error;
}
await rm('dist', { recursive: true, force: true });
async function walk(dir) {
  await mkdir(`dist/${dir}`, { recursive: true });
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else if (path.endsWith('.ts')) {
      let source = stripTypeScriptTypes(await readFile(path, 'utf8')).replace(/from (['"])([^'"]+)\.ts\1/g, 'from $1$2.js$1');
      if (path.startsWith('src/injected/')) source = `(() => {\n${source.replace(/export /g, '')}\n})();`;
      await writeFile(`dist/${path.replace(/\.ts$/, '.js')}`, source);
    }
    else await copyFile(path, `dist/${path}`);
  }
}
await walk('src');
await writeFile('dist/src/background/oauth-config.js',`export const oauthConfig = ${JSON.stringify(oauth)};\n`);
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
if(oauth.brokerUrl) manifest.host_permissions.push(`${new URL(oauth.brokerUrl).origin}/*`);
await writeFile('dist/manifest.json',JSON.stringify(manifest,null,2)+'\n');
for (const file of ['popup.html', 'options.html']) await copyFile(file, `dist/${file}`);
console.log('Load unpacked: dist/');

if(!oauth.clientId) console.log('GitHub OAuth is not configured yet; see server/README.md for publisher setup.');
