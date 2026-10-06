import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const id=[...createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest().subarray(0,16)].map(byte=>String.fromCharCode(97+(byte>>4),97+(byte&15))).join('');
console.log(`Extension ID: ${id}`);
console.log(`GitHub OAuth callback URL: https://${id}.chromiumapp.org/github`);
