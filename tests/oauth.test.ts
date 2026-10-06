import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {authorizeGitHub,parseOAuthCallback,pkceChallenge,refreshGitHub,validateOAuthConfig,type Identity} from '../src/background/oauth.ts';
const redirectUri=`https://${'a'.repeat(32)}.chromiumapp.org/github`;
const config={clientId:'test-client',brokerUrl:'http://127.0.0.1:8787'};
function identity(callback?:(url:URL)=>string):Identity {
 return {getRedirectURL:()=>redirectUri,launchWebAuthFlow:async details=>{
  const url=new URL(details.url);assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(url.searchParams.get('state')!,/^[A-Za-z0-9_-]{43}$/);
  return callback ? callback(url) : `${redirectUri}?code=approved-code&state=${url.searchParams.get('state')}`;
 }};
}
test('GitHub approval opens web flow and exchanges code automatically using PKCE',async()=>{
 let challenge='';const auth=identity(url=>{challenge=url.searchParams.get('code_challenge')!;return `${redirectUri}?code=approved-code&state=${url.searchParams.get('state')}`;});
 const tokens=await authorizeGitHub(config,auth,async(input,init)=>{
  assert.equal(String(input),'http://127.0.0.1:8787/oauth/exchange');const body=JSON.parse(String(init?.body));assert.equal(body.code,'approved-code');assert.equal(body.redirectUri,redirectUri);assert.equal(await pkceChallenge(body.codeVerifier),challenge);assert.equal(body.client_secret,undefined);
  return new Response(JSON.stringify({access_token:'oauth-token',token_type:'bearer',scope:'repo',refresh_token:'refresh',expires_in:28800,refresh_token_expires_in:15897600}));
 });
 assert.equal(tokens.accessToken,'oauth-token');assert.equal(tokens.refreshToken,'refresh');assert.ok(tokens.expiresAt!>Date.now());
});
test('wrong state or callback never sends code to broker',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;return new Response('{}');};
 await assert.rejects(()=>authorizeGitHub(config,identity(()=>`${redirectUri}?code=code&state=wrong`),fetcher),/응답/);
 await assert.rejects(()=>authorizeGitHub(config,identity(url=>`https://attacker.example/github?code=code&state=${url.searchParams.get('state')}`),fetcher),/응답/);assert.equal(calls,0);
});
test('denial or closed auth window does not create a token',async()=>{
 await assert.rejects(()=>authorizeGitHub(config,identity(url=>`${redirectUri}?error=access_denied&state=${url.searchParams.get('state')}`)),/취소/);
 await assert.rejects(()=>authorizeGitHub(config,{getRedirectURL:()=>redirectUri,launchWebAuthFlow:async()=>{throw new Error('closed');}}),/취소/);
});
test('reject missing configuration and insecure remote broker',()=>{
 assert.throws(()=>validateOAuthConfig({clientId:'',brokerUrl:''}),/설정/);
 assert.throws(()=>validateOAuthConfig({...config,brokerUrl:'http://remote.example'}));
 assert.throws(()=>validateOAuthConfig({...config,brokerUrl:'https://user:secret@auth.example'}));
 assert.doesNotThrow(()=>validateOAuthConfig({...config,brokerUrl:'https://auth.example'}));
});
test('reject broker token without approved repository scope',async()=>{
 await assert.rejects(()=>authorizeGitHub(config,identity(),async()=>new Response(JSON.stringify({access_token:'token',token_type:'bearer',scope:'read:user'}))),/승인/);
});
test('refresh exchanges stored refresh token without any user token entry',async()=>{
 const token=await refreshGitHub(config,'refresh',redirectUri,async(input,init)=>{
  assert.ok(String(input).endsWith('/oauth/refresh'));assert.deepEqual(JSON.parse(String(init?.body)),{refreshToken:'refresh',redirectUri});
  return new Response(JSON.stringify({access_token:'renewed',token_type:'bearer',scope:'repo',refresh_token:'rotated'}));
 });assert.equal(token.accessToken,'renewed');assert.equal(token.refreshToken,'rotated');
});
test('callback rejects duplicate state and duplicate code parameters',()=>{
 assert.throws(()=>parseOAuthCallback(`${redirectUri}?state=s&state=s&code=c`,redirectUri,'s'));
 assert.throws(()=>parseOAuthCallback(`${redirectUri}?state=s&code=c&code=d`,redirectUri,'s'));
});
