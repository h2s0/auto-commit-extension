/** Secret-bearing OAuth exchange only. No solution data, database or token logging. */
export function createOAuthHandler(config, fetcher=fetch) {
  if (!config.clientId || !config.clientSecret || !config.redirectUri) throw new Error('GitHub OAuth server configuration is missing.');
  const redirect=new URL(config.redirectUri);
  if (!/^https:\/\/([a-p]{32})\.chromiumapp\.org\/github$/.test(redirect.href)) throw new Error('Set the exact Chrome extension /github redirect URI.');
  const extensionId=redirect.hostname.split('.')[0];
  const allowedOrigin=`chrome-extension://${extensionId}`;
  const limits=new Map();
  return async function handle(request, ip='local') {
    const origin=request.headers.get('Origin');
    const headers={'Cache-Control':'no-store','Pragma':'no-cache','Content-Type':'application/json; charset=utf-8','Vary':'Origin'};
    if (origin===allowedOrigin) Object.assign(headers,{'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
    const path=new URL(request.url).pathname;
    if (!['/oauth/exchange','/oauth/refresh'].includes(path)) return reply({error:'not_found'},404);
    if (origin!==allowedOrigin) return reply({error:'forbidden'},403);
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (request.method!=='POST') return reply({error:'method_not_allowed'},405);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'invalid_content_type'},415);
    const now=Date.now();
    for (const [key,value] of limits) if(value.until<now) limits.delete(key);
    const bucket=limits.get(ip) ?? {count:0,until:now+60_000};
    if(bucket.count>=30 || (!limits.has(ip)&&limits.size>=10000)) return reply({error:'too_many_requests'},429);
    bucket.count++;limits.set(ip,bucket);
    let body;
    try {const raw=await request.text();if(Buffer.byteLength(raw)>8192)return reply({error:'payload_too_large'},413);body=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
    if(!body || body.redirectUri!==config.redirectUri) return reply({error:'invalid_redirect'},400);
    const params={client_id:config.clientId,client_secret:config.clientSecret};
    if(path==='/oauth/exchange') {
      if(typeof body.code!=='string'||!body.code||body.code.length>512||typeof body.codeVerifier!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(body.codeVerifier)) return reply({error:'invalid_code'},400);
      Object.assign(params,{code:body.code,code_verifier:body.codeVerifier,redirect_uri:config.redirectUri});
    } else {
      if(typeof body.refreshToken!=='string'||!body.refreshToken||body.refreshToken.length>1024)return reply({error:'invalid_refresh_token'},400);
      Object.assign(params,{grant_type:'refresh_token',refresh_token:body.refreshToken});
    }
    try {
      const response=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(params),redirect:'error',signal:AbortSignal.timeout(20000)});
      const data=await response.json();
      if(!response.ok||typeof data.access_token!=='string'||data.error) return reply({error:'authorization_failed'},401);
      // Return only token response fields; never include the server secret or upstream errors.
      return reply({access_token:data.access_token,token_type:data.token_type,scope:data.scope,
        ...(data.refresh_token ? {refresh_token:data.refresh_token} : {}),
        ...(data.expires_in ? {expires_in:data.expires_in} : {}),
        ...(data.refresh_token_expires_in ? {refresh_token_expires_in:data.refresh_token_expires_in} : {})});
    } catch {return reply({error:'github_unavailable'},502);}
  };
}
