import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SubmissionTracker,parseQuestion } from '../src/content/leetcode.ts';
import { defaults,type Submission } from '../src/shared/types.ts';
import type { NetworkRecord } from '../src/shared/network.ts';

// Use the actual service-worker message handler with simulated Chrome storage and GitHub HTTP.
test('Accepted → background → single GitHub commit, persistence and retry',async t=>{
 const data:Record<string,unknown>={settings:{...defaults,owner:'octocat',repo:'solutions'},token:'test-token'};
 let listener:Function; const apiCalls:{url:string;method:string;body:any;authorization:string|null}[]=[];
 const originalFetch=globalThis.fetch;const originalChrome=(globalThis as any).chrome;
 (globalThis as any).chrome={storage:{local:{
  setAccessLevel:async(options:unknown)=>{assert.deepEqual(options,{accessLevel:'TRUSTED_CONTEXTS'});},
  get:async(keys:string|string[])=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(data[key])])),
  set:async(values:Record<string,unknown>)=>Object.assign(data,structuredClone(values)),
  remove:async(keys:string|string[])=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},
 }},runtime:{getURL:(path:string)=>`chrome-extension://test/${path}`,onMessage:{addListener:(fn:Function)=>{listener=fn;}}},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}}};
 let fail=false;let failingRepo='';
 globalThis.fetch=async(input,init)=>{
  if(fail)throw new Error('Network offline');
  if(failingRepo && String(input).includes(`/repos/${failingRepo}/`)) return new Response('{}',{status:403});
  const url=String(input),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined;
  apiCalls.push({url,method,body,authorization:new Headers(init?.headers).get('Authorization')});let value:unknown={};let status=200;
  if(url.endsWith('/solutions'))value={default_branch:'main'};
  else if(url.includes('/git/ref/heads/'))value={object:{sha:'head'}};
  else if(url.endsWith('/git/commits/head'))value={tree:{sha:'old-tree'}};
  else if(url.includes('/contents/'))status=404;
  else if(url.endsWith('/git/trees'))value={sha:'new-tree'};
  else if(url.endsWith('/git/commits'))value={sha:'new-commit',html_url:'https://github.com/octocat/solutions/commit/new-commit'};
  return new Response(JSON.stringify(value),{status});
 };
 const page={url:'https://leetcode.com/problems/two-sum/',tab:{id:1}};
 const ui={url:'chrome-extension://test/popup.html'};
 const send=(message:unknown,sender=page):Promise<any>=>new Promise(resolve=>listener(message,sender,resolve));
 const submission:Submission={accepted:true,submissionId:'123',problem:parseQuestion({questionFrontendId:'1',title:'Two Sum',titleSlug:'two-sum',difficulty:'Easy'},'two-sum')!,language:'python3',code:'submitted Python code'};
 try{
  await import('../src/background/index.ts');
  await t.test('real detector output is automatically uploaded, both files in one commit',async()=>{
   const tracker=new SubmissionTracker({getProblem:async()=>submission.problem,onAccepted:async value=>{const response=await send({type:'ACCEPTED',submission:value});assert.equal(response.ok,true);}});
   const captured:NetworkRecord={id:'submit',path:'/problems/two-sum/submit/',method:'POST',status:200,request:{question_id:'1',lang:'python3',typed_code:submission.code},response:{submission_id:123}};
   await tracker.ingest(captured);await tracker.ingest({id:'result',path:'/submissions/detail/123/check/',method:'GET',status:200,response:{state:'SUCCESS',status_code:10,status_msg:'Accepted'}});
   assert.equal(apiCalls.filter(c=>c.method==='POST'&&c.url.endsWith('/git/commits')).length,1);
   assert.equal(apiCalls.find(c=>c.url.endsWith('/git/trees'))?.body.tree[0].content,submission.code);
   assert.equal((data.status as any).state,'success');assert.deepEqual(data.pendingUploads,{});
  });
  await t.test('background rejects replay independently of detector memory',async()=>{
   const count=apiCalls.length;const response=await send({type:'ACCEPTED',submission});assert.equal(response.data.duplicate,true);assert.equal(apiCalls.length,count);
   // Simulate MV3 worker restart while preserving chrome.storage.local.
   await import('../src/background/index.ts?restart=1');
   const afterRestart=await send({type:'ACCEPTED',submission});assert.equal(afterRestart.data.duplicate,true);assert.equal(apiCalls.length,count);
  });
  await t.test('auto commit OFF and rejected submissions never call GitHub',async()=>{
   const count=apiCalls.length;(data.settings as any).autoCommit=false;
   const off=await send({type:'ACCEPTED',submission:{...submission,submissionId:'124'}});assert.equal(off.data.skipped,true);
   const failed=await send({type:'ACCEPTED',submission:{...submission,accepted:false}});assert.equal(failed.ok,false);assert.equal(apiCalls.length,count);(data.settings as any).autoCommit=true;
  });
  await t.test('failed automatic uploads survive restart and retry original repository',async()=>{
   fail=true;const result=await send({type:'ACCEPTED',submission:{...submission,submissionId:'125'}});assert.equal(result.ok,false);assert.equal((data.status as any).state,'failed');assert.equal(Object.keys(data.pendingUploads as object).length,1);
   await import('../src/background/index.ts?restart=2');
   (data.settings as any).repo='different-repository';fail=false;
   const retry=await send({type:'RETRY'},ui as any);assert.equal(retry.ok,true);assert.deepEqual(data.pendingUploads,{});assert.ok(apiCalls.at(-1)?.url.includes('/octocat/solutions/'));(data.settings as any).repo='solutions';
  });
  await t.test('personal main and study named branch both receive the same submission',async()=>{
   data.settings={...defaults,targets:[{owner:'octocat',repo:'personal',branch:''},{owner:'study',repo:'solutions',branch:'heesae'}]};
   const start=apiCalls.length;const response=await send({type:'SUBMISSION_RESULT',submission:{...submission,submissionId:'201'}});
   assert.equal(response.ok,true);assert.equal(response.data.targets.length,2);
   const calls=apiCalls.slice(start);assert.ok(calls.some(c=>c.url.endsWith('/repos/octocat/personal/git/refs/heads/main')));assert.ok(calls.some(c=>c.url.endsWith('/repos/study/solutions/git/refs/heads/heesae')));
   assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/git/commits')).length,2);
   const duplicate=await send({type:'SUBMISSION_RESULT',submission:{...submission,submissionId:'201'}});assert.equal(duplicate.data.duplicate,true);
  });
  await t.test('partial failure retains only failed destination and retry never recommits success',async()=>{
   failingRepo='study/solutions';const response=await send({type:'SUBMISSION_RESULT',submission:{...submission,submissionId:'202'}});
   assert.equal(response.ok,false);assert.equal((data.status as any).state,'partial');assert.equal(Object.keys(data.pendingUploads as object).length,1);
   failingRepo='';const start=apiCalls.length;const retry=await send({type:'RETRY'},ui as any);assert.equal(retry.ok,true);assert.deepEqual(data.pendingUploads,{});
   assert.ok(apiCalls.slice(start).every(c=>!c.url.includes('/repos/octocat/personal/')));
  });
  await t.test('Wrong Answer is opt-in and is saved as an attempt to both targets',async()=>{
   const failed={...submission,submissionId:'203',accepted:false,statusCode:11,statusMessage:'Wrong Answer'};const start=apiCalls.length;
   assert.equal((await send({type:'SUBMISSION_RESULT',submission:failed})).data.skipped,true);assert.equal(apiCalls.length,start);
   (data.settings as any).includeFailed=true;const response=await send({type:'SUBMISSION_RESULT',submission:failed});assert.equal(response.ok,true);
   const trees=apiCalls.slice(start).filter(c=>c.url.endsWith('/git/trees'));assert.equal(trees.length,2);assert.ok(trees.every(c=>c.body.tree[0].path.includes('/attempts/203/')));
   const commits=apiCalls.slice(start).filter(c=>c.url.endsWith('/git/commits'));assert.ok(commits.every(c=>c.body.message.startsWith('Attempt ')&&c.body.message.includes('Wrong Answer')));
  });
  await t.test('target-specific tokens support different owners without exposing secrets in STATE',async()=>{
   const result=await send({type:'SAVE',settings:data.settings,credentials:[{repoKey:'study/solutions',token:'study-token',clear:false}]},ui as any);assert.equal(result.ok,true);
   const start=apiCalls.length;await send({type:'SUBMISSION_RESULT',submission:{...submission,submissionId:'204'}});
   assert.ok(apiCalls.slice(start).filter(c=>c.url.includes('/repos/study/solutions/')).every(c=>c.authorization==='Bearer study-token'));
   assert.ok(apiCalls.slice(start).filter(c=>c.url.includes('/repos/octocat/personal/')).every(c=>c.authorization==='Bearer test-token'));
   const state=await send({type:'STATE'},ui as any);assert.equal(state.data.targetTokens,undefined);assert.equal(state.data.token,undefined);assert.deepEqual(state.data.credentialRepos,['study/solutions']);
  });
  await t.test('page cannot read settings or tokens or invoke trusted UI actions',async()=>{
   assert.equal((await send({type:'STATE'})).ok,false);assert.equal((await send({type:'CONNECT',token:'bad'})).ok,false);
   assert.equal((await send({type:'ACCEPTED',submission},{url:'https://attacker.example/',tab:{id:1}})).ok,false);
   const state=await send({type:'STATE'},ui as any);assert.equal(state.ok,true);assert.equal(state.data.token,undefined);
  });
 }finally{globalThis.fetch=originalFetch;(globalThis as any).chrome=originalChrome;}
});
