import {extension as chrome} from '../shared/chrome.ts';
import {oauthConfig} from './oauth-config.ts';
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
}
export interface OAuthConfig { clientId: string; brokerUrl: string; }
export interface Identity {
  getRedirectURL(path?: string): string;
  launchWebAuthFlow(details:{url:string;interactive:boolean}): Promise<string | undefined>;
}
function base64url(bytes:Uint8Array):string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function pkceChallenge(verifier:string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
}
export function validateOAuthConfig(config:OAuthConfig):OAuthConfig {
  if (!config.clientId || !/^[A-Za-z0-9_.-]+$/.test(config.clientId) || !config.brokerUrl) throw new Error('GitHub 로그인 서비스가 아직 설정되지 않았습니다. 개발자용 OAuth 앱 설정이 필요합니다.');
  const url=new URL(config.brokerUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(url.protocol==='http:' && ['127.0.0.1','localhost'].includes(url.hostname)))) throw new Error('GitHub 로그인 서버 주소가 올바르지 않습니다.');
  return config;
}
export function parseOAuthCallback(callback:string,redirectUri:string,state:string):string {
  const url=new URL(callback);const expected=new URL(redirectUri);
  if (url.origin!==expected.origin || url.pathname!==expected.pathname || url.searchParams.get('state')!==state || url.searchParams.getAll('state').length!==1) throw new Error('GitHub 로그인 응답을 확인할 수 없습니다. 다시 연결하세요.');
  if (url.searchParams.has('error')) throw new Error(url.searchParams.get('error')==='access_denied' ? 'GitHub 권한 승인이 취소되었습니다.' : 'GitHub 로그인을 완료하지 못했습니다.');
  const code=url.searchParams.get('code');
  if (!code || url.searchParams.getAll('code').length!==1 || code.length>512) throw new Error('GitHub 인증 코드가 없습니다. 다시 연결하세요.');
  return code;
}
function tokensFrom(value:unknown):OAuthTokens {
  const data=value as Record<string,unknown>;
  if (!data || typeof data.access_token!=='string' || !data.access_token || data.token_type!=='bearer' || typeof data.scope!=='string' || !data.scope.split(/[ ,]+/).includes('repo')) throw new Error('GitHub 저장소 접근 승인이 완료되지 않았습니다.');
  return {accessToken:data.access_token,
    ...(typeof data.refresh_token==='string' ? {refreshToken:data.refresh_token} : {}),
    ...(typeof data.expires_in==='number' && data.expires_in>0 ? {expiresAt:Date.now()+data.expires_in*1000} : {}),
    ...(typeof data.refresh_token_expires_in==='number' && data.refresh_token_expires_in>0 ? {refreshExpiresAt:Date.now()+data.refresh_token_expires_in*1000} : {})};
}
async function brokerRequest(config:OAuthConfig,path:string,body:unknown,fetcher:typeof fetch):Promise<OAuthTokens> {
  const response=await fetcher(`${new URL(config.brokerUrl).origin}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(response.status===401 ? 'GitHub 연결이 만료되었습니다. 다시 연결하세요.' : 'GitHub 로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
  return tokensFrom(await response.json());
}
export async function authorizeGitHub(config:OAuthConfig,identity:Identity,fetcher:typeof fetch=fetch):Promise<OAuthTokens> {
  validateOAuthConfig(config);
  const state=base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
  const redirectUri=identity.getRedirectURL('github');
  const url=new URL('https://github.com/login/oauth/authorize');
  url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:redirectUri,scope:'repo offline_access',state,code_challenge:await pkceChallenge(verifier),code_challenge_method:'S256',allow_signup:'false'}).toString();
  let callback:string|undefined;
  try {callback=await identity.launchWebAuthFlow({url:url.href,interactive:true});}
  catch {throw new Error('GitHub 로그인 창이 닫혔거나 승인이 취소되었습니다. 다시 연결하세요.');}
  if (!callback) throw new Error('GitHub 로그인이 취소되었습니다.');
  const code=parseOAuthCallback(callback,redirectUri,state);
  return brokerRequest(config,'/oauth/exchange',{code,codeVerifier:verifier,redirectUri},fetcher);
}
export async function refreshGitHub(config:OAuthConfig,refreshToken:string,redirectUri:string,fetcher:typeof fetch=fetch):Promise<OAuthTokens> {
  validateOAuthConfig(config);
  return brokerRequest(config,'/oauth/refresh',{refreshToken,redirectUri},fetcher);
}
export async function ensureGitHubToken():Promise<string | undefined> {
  const data=await chrome.storage.local.get(['token','oauth']);
  const oauth=data.oauth as Omit<OAuthTokens,'accessToken'> | undefined;
  if (!oauth?.expiresAt || oauth.expiresAt>Date.now()+60_000) return typeof data.token==='string' ? data.token : undefined;
  if (!oauth.refreshToken || oauth.refreshExpiresAt && oauth.refreshExpiresAt<=Date.now()) throw new Error('GitHub 연결이 만료되었습니다. 다시 연결하세요.');
  const tokens=await refreshGitHub(oauthConfig,oauth.refreshToken,chrome.identity.getRedirectURL('github'));
  const {accessToken,...metadata}=tokens;
  await chrome.storage.local.set({token:accessToken,oauth:metadata});
  return accessToken;
}
