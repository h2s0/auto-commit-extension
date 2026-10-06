import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createOAuthHandler} from '../server/oauth-handler.mjs';
const id='a'.repeat(32), origin=`chrome-extension://${id}`, redirectUri=`https://${id}.chromiumapp.org/github`;
const config={clientId:'client',clientSecret:'server-only-secret',redirectUri};
const request=(body={code:'code',codeVerifier:'v'.repeat(43),redirectUri},options={})=>new Request(`http://localhost:8787${options.path??'/oauth/exchange'}`,{method:options.method??'POST',headers:{Origin:options.origin??origin,'Content-Type':'application/json'},body:options.method==='OPTIONS'?undefined:JSON.stringify(body)});
test('broker sends secret to GitHub only and returns narrowly scoped token fields',async()=>{
 const handler=createOAuthHandler(config,async(url,init)=>{
  assert.equal(url,'https://github.com/login/oauth/access_token');const body=JSON.parse(init.body);assert.equal(body.client_secret,config.clientSecret);assert.equal(body.code_verifier,'v'.repeat(43));assert.equal(body.redirect_uri,redirectUri);
  return new Response(JSON.stringify({access_token:'token',token_type:'bearer',scope:'repo',client_secret:'must-never-escape',arbitrary:'hidden'}));
 });
 const result=await handler(request());assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);assert.deepEqual(await result.json(),{access_token:'token',token_type:'bearer',scope:'repo'});
});
test('unapproved origins and redirect destinations never trigger GitHub exchange',async()=>{
 let calls=0;const handler=createOAuthHandler(config,async()=>{calls++;return new Response('{}');});
 assert.equal((await handler(request(undefined,{origin:'https://attacker.example'}))).status,403);
 assert.equal((await handler(request({code:'c',codeVerifier:'v'.repeat(43),redirectUri:'https://attacker.example'}))).status,400);
 assert.equal((await handler(request({code:'c',codeVerifier:'short',redirectUri}))).status,400);assert.equal(calls,0);
});
test('CORS preflight accepts only registered extension origin',async()=>{
 const handler=createOAuthHandler(config);const result=await handler(request(undefined,{method:'OPTIONS'}));assert.equal(result.status,204);assert.equal(result.headers.get('Access-Control-Allow-Origin'),origin);
});
test('broker refresh uses server secret and upstream failure is sanitized',async()=>{
 const handler=createOAuthHandler(config,async(url,init)=>{const body=JSON.parse(init.body);assert.equal(body.grant_type,'refresh_token');assert.equal(body.refresh_token,'refresh');return new Response(JSON.stringify({error:'expired_token',error_description:'secret diagnostic'}));});
 const response=await handler(request({refreshToken:'refresh',redirectUri},{path:'/oauth/refresh'}));assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'authorization_failed'});
});
test('rate limits repeated requests without logging secrets',async()=>{
 const handler=createOAuthHandler(config,async()=>new Response('{}'));
 for(let i=0;i<30;i++) await handler(request());assert.equal((await handler(request())).status,429);
});
test('broker validates stable extension callback and rejects oversized input',async()=>{
 assert.throws(()=>createOAuthHandler({...config,redirectUri:'https://attacker.example/callback'}));
 const handler=createOAuthHandler(config);assert.equal((await handler(request({large:'x'.repeat(9000)}))).status,413);
});
