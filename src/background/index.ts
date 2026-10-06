import {extension as chrome} from '../shared/chrome.ts';
import {defaults, repositoryTargets, type Settings, type Submission, type Status, type PendingUpload, type RepositoryTarget, type TargetResult} from '../shared/types.ts';
import {validateSettings, validateSubmission} from '../shared/format.ts';
import {GitHub} from './github.ts';
import {authorizeGitHub,ensureGitHubToken} from './oauth.ts';
import {oauthConfig} from './oauth-config.ts';
const storageReady = chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
let queue = Promise.resolve();
async function status(state: string, message: string, targets?: TargetResult[]) {
 const commitUrl = targets?.find(target=>target.commitUrl)?.commitUrl;
 const value: Status = {state,message,time:new Date().toISOString(), ...(commitUrl ? {commitUrl} : {}), ...(targets ? {targets} : {})};
 await chrome.storage.local.set({status:value});
 await chrome.action.setBadgeText({text:state === 'success' ? '✓' : state === 'failed' || state === 'partial' ? '!' : state === 'uploading' ? '…' : ''});
 await chrome.action.setBadgeBackgroundColor({color:state === 'failed' || state === 'partial' ? '#b91c1c' : '#15803d'});
 return value;
}
function targetKey(target:RepositoryTarget, settings:Settings, s:Submission) {
 return JSON.stringify([target.owner.toLowerCase(),target.repo.toLowerCase(),target.branch,settings.baseDirectory,s.submissionId]);
}
async function uploadTarget(s:Submission, settings:Settings, target:RepositoryTarget, token:unknown): Promise<TargetResult> {
 const key = targetKey(target,settings,s);
 const data = await chrome.storage.local.get(['processed','pendingUploads']);
 const processed = (data.processed ?? {}) as Record<string,string>;
 const pendingUploads = (data.pendingUploads ?? {}) as Record<string,PendingUpload>;
 if (processed[key]) {
  delete pendingUploads[key];
  await chrome.storage.local.set({pendingUploads});
  return {target,state:'duplicate',message:'이미 저장한 제출입니다.'};
 }
 const singleTarget: Settings = {...settings,...target,targets:[target]};
 pendingUploads[key] = {submission:s,settings:singleTarget};
 await chrome.storage.local.set({pendingUploads});
 try {
  if (typeof token !== 'string' || !token) throw new Error('GitHub 인증이 필요합니다.');
  const result = await new GitHub(token).commit(s,singleTarget);
  processed[key] = new Date().toISOString();
  delete pendingUploads[key];
  await chrome.storage.local.set({processed:Object.fromEntries(Object.entries(processed).slice(-2000)),pendingUploads});
  return {target,state:'success',message:result.unchanged ? '이미 같은 내용이 저장되어 있습니다.' : '커밋 완료',commitUrl:result.url};
 } catch(error) {
  return {target,state:'failed',message:error instanceof Error ? error.message : '업로드 실패'};
 }
}
async function summarize(results:TargetResult[]) {
 const failed = results.filter(result=>result.state==='failed');
 const succeeded = results.length - failed.length;
 const state = failed.length ? succeeded ? 'partial' : 'failed' : 'success';
 const message = failed.length ? `${succeeded}/${results.length}개 대상 저장 완료. ${failed.map(result=>`${result.target.owner}/${result.target.repo} (${result.target.branch}): ${result.message}`).join('; ')}` : `${results.length}개 대상 저장 완료`;
 return status(state,message,results);
}
async function sync(submission: Submission, manual: boolean, savedSettings?: Settings) {
 const s = validateSubmission(submission);
 const data = await chrome.storage.local.get(['settings','token','targetTokens','pendingUploads']);
 const settings = savedSettings ?? {...defaults,...data.settings as Partial<Settings>};
 if (!manual && !settings.autoCommit) return {skipped:true};
 if (!s.accepted && !settings.includeFailed) return {skipped:true};
 try { validateSettings(settings); }
 catch(error) {
  const pendingUploads = (data.pendingUploads ?? {}) as Record<string,PendingUpload>;
  pendingUploads[`unconfigured:${s.submissionId}`] = {submission:s};
  await chrome.storage.local.set({pendingUploads});
  throw error;
 }
 const targets = repositoryTargets(settings);
 let connectedToken = data.token;
 let tokenError: unknown;
 try { connectedToken = await ensureGitHubToken(); } catch (error) { connectedToken=undefined; tokenError=error; }
 await status('uploading',`${s.problem.title} · ${targets.length}개 대상 업로드 중`);
 const results:TargetResult[] = [];
 // Each target is independent: a failed study repo must not prevent personal-repo commits.
 for (const target of targets) {
  const targetTokens = (data.targetTokens ?? {}) as Record<string,string>;
  const token = targetTokens[`${target.owner.toLowerCase()}/${target.repo.toLowerCase()}`] ?? connectedToken;
  if (!token && tokenError) {
   // Preserve failed uploads even if the OAuth session needs reconnecting.
   results.push(await uploadTarget(s,settings,target,undefined));
   continue;
  }
  results.push(await uploadTarget(s,settings,target,token));
 }
 if (results.every(result=>result.state==='duplicate')) { await summarize(results); return {duplicate:true}; }
 return summarize(results);
}
async function handle(message: any, sender: {url?:string; tab?:{id?:number}}) {
 await storageReady;
 const trusted = sender.url?.startsWith(chrome.runtime.getURL(''));
 if (!trusted) {
  if (!sender.tab || !sender.url || new URL(sender.url).origin !== 'https://leetcode.com') throw new Error('허용되지 않은 메시지입니다.');
  if (message.type === 'SUBMISSION_RESULT' || message.type === 'ACCEPTED') return sync(message.submission,false);
  if (message.type === 'DETECTOR_STATUS') {
   if (!['detected','accepted','rejected','failed'].includes(message.state) || typeof message.message !== 'string') throw new Error('잘못된 감지 상태입니다.');
   const data = await chrome.storage.local.get('settings');
   const settings = {...defaults,...data.settings as Partial<Settings>};
   if (settings.autoCommit) return status(message.state,message.message.slice(0,300));
   return {skipped:true};
  }
  if (message.type === 'PAGE_STATUS') return chrome.storage.local.set({page:{slug:String(message.slug).slice(0,120),time:new Date().toISOString(), diagnostics:message.diagnostics}});
  throw new Error('허용되지 않은 메시지입니다.');
 }
 if (message.type === 'STATE') {const data = await chrome.storage.local.get(['settings','status','user','page','pendingUploads','targetTokens']); const credentialRepos=Object.keys((data.targetTokens ?? {}) as object); delete data.targetTokens; return {...data, credentialRepos, oauthConfigured:Boolean(oauthConfig.clientId && oauthConfig.brokerUrl), settings:{...defaults,...data.settings as object}};}
 if (message.type === 'CONNECT_OAUTH') {
  const tokens=await authorizeGitHub(oauthConfig,chrome.identity);
  const user=await new GitHub(tokens.accessToken).user();
  const {accessToken,...metadata}=tokens;
  await chrome.storage.local.set({token:accessToken,oauth:metadata,user:user.login});
  return {user:user.login};
 }
 if (message.type === 'CONNECT') {const token = String(message.token).trim(); const user = await new GitHub(token).user(); await chrome.storage.local.set({token,user:user.login}); await chrome.storage.local.remove('oauth'); return {user:user.login};}
 if (message.type === 'DISCONNECT') {await chrome.storage.local.remove(['token','user','targetTokens','oauth']); return {};}
 if (message.type === 'REPOS') {const token=await ensureGitHubToken(); if (!token) throw new Error('GitHub 인증이 필요합니다.'); return new GitHub(token).repositories();}
 if (['BRANCHES','CREATE_BRANCH','CREATE_REPOSITORY'].includes(message.type)) {
  let token=await ensureGitHubToken();
  if(message.type!=='CREATE_REPOSITORY') {
   validateSettings({...defaults,...message.target});
   const stored=await chrome.storage.local.get('targetTokens');
   token=((stored.targetTokens ?? {}) as Record<string,string>)[`${message.target.owner.toLowerCase()}/${message.target.repo.toLowerCase()}`] ?? token;
  }
  if(!token)throw new Error('먼저 GitHub에 연결하세요.');
  const github=new GitHub(token);
  if(message.type==='BRANCHES')return github.branches(message.target);
  if(message.type==='CREATE_BRANCH')return github.createBranch(message.target);
  return github.createRepository(String(message.name??''));
 }
 if (message.type === 'SAVE') {
  const settings=validateSettings(message.settings);
  const data=await chrome.storage.local.get('targetTokens');
  const targetTokens={...(data.targetTokens ?? {}) as Record<string,string>};
  const allowed=new Set(repositoryTargets(settings).map(t=>`${t.owner.toLowerCase()}/${t.repo.toLowerCase()}`));
  if (message.credentials !== undefined) {
   if (!Array.isArray(message.credentials) || message.credentials.length>10) throw new Error('대상별 인증 설정을 확인하세요.');
   for (const credential of message.credentials) {
    if (!credential || typeof credential.repoKey!=='string' || !allowed.has(credential.repoKey) || typeof credential.token!=='string' || typeof credential.clear!=='boolean') throw new Error('대상별 인증 설정을 확인하세요.');
    if (credential.clear) delete targetTokens[credential.repoKey];
    if (credential.token.trim()) targetTokens[credential.repoKey]=credential.token.trim();
   }
  }
  await chrome.storage.local.set({settings,targetTokens});
  return {};
 }
 if (message.type === 'UPLOAD') return sync(message.submission,true);
 if (message.type === 'RETRY') {
  const data = await chrome.storage.local.get('pendingUploads');
  const entries = Object.entries((data.pendingUploads ?? {}) as Record<string,PendingUpload>);
  if (!entries.length) throw new Error('재시도할 제출이 없습니다.');
  const results:TargetResult[] = [];
  for (const [oldKey,entry] of entries) {
   try {
    const result = await sync(entry.submission,true,entry.settings);
    if ('targets' in result && result.targets) results.push(...result.targets);
    if ('state' in result && (result.state === 'partial' || result.state === 'failed') || 'skipped' in result) continue;
    const latest = await chrome.storage.local.get('pendingUploads');
    const pendingUploads = (latest.pendingUploads ?? {}) as Record<string,PendingUpload>;
    delete pendingUploads[oldKey];
    await chrome.storage.local.set({pendingUploads});
   } catch(error) {
    const target = entry.settings ? repositoryTargets(entry.settings)[0] : {owner:'미설정',repo:'미설정',branch:'main'};
    results.push({target,state:'failed',message:error instanceof Error ? error.message : '재시도 실패'});
   }
  }
  return results.length ? summarize(results) : {skipped:true};
 }
 throw new Error('알 수 없는 요청입니다.');
}
chrome.runtime.onMessage.addListener((message,sender,respond) => {
 const run=async()=>{
  try {
   const data=await handle(message,sender);
   const failed=data && 'state' in data && (data.state==='failed'||data.state==='partial');
   respond({ok:!failed,data,...(failed ? {error:data.message}: {})});
  } catch(error) {
   const text=error instanceof Error ? error.message : '요청 실패';
   if(['UPLOAD','RETRY','ACCEPTED','SUBMISSION_RESULT'].includes(message.type))await status('failed',text);
   respond({ok:false,error:text});
  }
 };
 // Slow OAuth/GitHub uploads must not block local settings or UI status responses.
 if(['UPLOAD','RETRY','ACCEPTED','SUBMISSION_RESULT'].includes(message.type)) {
  queue=queue.then(run).catch(()=>respond({ok:false,error:'설정 저장에 실패했습니다.'}));
 } else void run().catch(()=>respond({ok:false,error:'요청에 실패했습니다.'}));
 return true;
});
