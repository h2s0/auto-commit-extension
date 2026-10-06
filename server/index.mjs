import {createServer} from 'node:http';
import {createOAuthHandler} from './oauth-handler.mjs';
const handler=createOAuthHandler({clientId:process.env.GITHUB_OAUTH_CLIENT_ID,clientSecret:process.env.GITHUB_OAUTH_CLIENT_SECRET,redirectUri:process.env.GITHUB_OAUTH_REDIRECT_URI});
const port=Number(process.env.OAUTH_PORT||8787);
if (!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid OAUTH_PORT.');
const server=createServer(async(req,res)=>{
  let size=0;const chunks=[];
  try {
    for await (const chunk of req) {size+=chunk.length;if(size>8192){res.writeHead(413,{'Cache-Control':'no-store'});res.end();return;}chunks.push(chunk);}
    const request=new Request(new URL(req.url||'/',`http://127.0.0.1:${port}`),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method||'GET') ? {body:Buffer.concat(chunks)} : {})});
    const response=await handler(request,req.socket.remoteAddress||'unknown');
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(500,{'Cache-Control':'no-store'});res.end('Authentication service error');}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(port,process.env.OAUTH_BIND||'127.0.0.1',()=>console.log(`GitHub OAuth exchange server listening on port ${port}`));
