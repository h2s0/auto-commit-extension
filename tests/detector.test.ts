import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseSnapshot, parseResult, parseQuestion, SubmissionTracker } from '../src/content/leetcode.ts';
import type { NetworkRecord } from '../src/shared/network.ts';
import type { Submission } from '../src/shared/types.ts';
const question = {questionFrontendId:'1',questionId:'1',title:'Two Sum',titleSlug:'two-sum',difficulty:'Easy'};
const problem = parseQuestion(question,'two-sum')!;
let sequence=0;
const submit = (id='123', code='original submitted code', lang='python3'):NetworkRecord => ({id:String(++sequence),path:'/problems/two-sum/submit/',method:'POST',status:200,request:{typed_code:code,lang,question_id:'1'},response:{submission_id:Number(id)}});
const check = (id='123', statusCode=10, state='SUCCESS'):NetworkRecord => ({id:String(++sequence),path:`/submissions/detail/${id}/check/`,method:'GET',status:200,response:{state,status_code:statusCode,status_msg:statusCode===10?'Accepted':'Wrong Answer',submission_id:id,question_id:'1',status_runtime:'42 ms',status_memory:'18.3 MB'}});
function harness(getProblem=async()=>problem) {
 const accepted:Submission[]=[];const states:{state:string;message:string}[]=[];
 const tracker=new SubmissionTracker({getProblem,onAccepted:async s=>{accepted.push(s);},onState:(state,message)=>states.push({state,message})});
 return {tracker,accepted,states};
}
test('Accepted uploads exactly the submit snapshot, language, metadata and metrics',async()=>{
 const {tracker,accepted}=harness();const request=submit();await tracker.ingest(request);
 (request.request as Record<string,unknown>).typed_code='editor changed after submit';
 await tracker.ingest(check());assert.equal(accepted.length,1);assert.equal(accepted[0].code,'original submitted code');assert.equal(accepted[0].language,'python3');assert.equal(accepted[0].runtime,'42 ms');assert.equal(accepted[0].memory,'18.3 MB');
});
test('pending and failed results never upload',async()=>{
 const {tracker,accepted}=harness();await tracker.ingest(submit());await tracker.ingest(check('123',10,'PENDING'));await tracker.ingest(check('123',11));assert.equal(accepted.length,0);
});
test('Run Code and unmatched historical Accepted results never upload',async()=>{
 const {tracker,accepted}=harness();const record=submit();record.path='/problems/two-sum/interpret_solution/';await tracker.ingest(record);await tracker.ingest(check());assert.equal(accepted.length,0);
});
test('repeated polling and replay produce one callback even during metadata loading',async()=>{
 let release:(value:typeof problem)=>void=()=>{};const {tracker,accepted}=harness(()=>new Promise(resolve=>{release=resolve;}));
 const record=submit();await tracker.ingest(record);await tracker.ingest(record);
 const first=tracker.ingest(check());await tracker.ingest(check());release(problem);await first;assert.equal(accepted.length,1);
});
test('result arriving before submit response is correlated safely',async()=>{
 const {tracker,accepted}=harness();await tracker.ingest(check());assert.equal(accepted.length,0);await tracker.ingest(submit());assert.equal(accepted.length,1);
});
test('two simultaneous submissions retain their own code and language',async()=>{
 const {tracker,accepted}=harness();await tracker.ingest(submit('123','python code'));await tracker.ingest(submit('124','javascript code','javascript'));await tracker.ingest(check('124'));await tracker.ingest(check('123'));assert.deepEqual(accepted.map(s=>[s.submissionId,s.code,s.language]),[['124','javascript code','javascript'],['123','python code','python3']]);
});
test('inconsistent Accepted fields, IDs or problem IDs fail closed',async()=>{
 assert.throws(()=>parseResult({...check(),response:{state:'SUCCESS',status_code:11,status_msg:'Accepted'}}));
 assert.throws(()=>parseResult({...check(),response:{state:'SUCCESS',status_code:10,status_msg:'Accepted',submission_id:'999'}}));
 const {tracker,accepted,states}=harness();await tracker.ingest(submit());const result=check();(result.response as Record<string,unknown>).question_id='999';await tracker.ingest(result);assert.equal(accepted.length,0);assert.equal(states.at(-1)?.state,'failed');
});
test('bad submit payload and network failure are visible and never upload',async()=>{
 assert.throws(()=>parseSnapshot({...submit(),request:{typed_code:'',lang:'python3',question_id:1}}));
 const {tracker,accepted,states}=harness();await tracker.ingest({...submit(),status:403});assert.equal(accepted.length,0);assert.equal(states.at(-1)?.state,'failed');
});
test('metadata failure is visible and never invents a problem ID',async()=>{
 const {tracker,accepted,states}=harness(async()=>{throw new Error('metadata failed');});await tracker.ingest(submit());await tracker.ingest(check());assert.equal(accepted.length,0);assert.equal(states.at(-1)?.message,'metadata failed');assert.equal(parseQuestion({...question,questionFrontendId:undefined},'two-sum'),undefined);
});
test('missing final polling result expires with a visible failure',async()=>{const {tracker,accepted,states}=harness();await tracker.ingest(submit());tracker.expire(Date.now()+121_000);assert.equal(accepted.length,0);assert.equal(states.at(-1)?.state,'failed');});
test('completed callback receives Wrong Answer for background policy filtering',async()=>{
 const submissions:Submission[]=[];
 const tracker=new SubmissionTracker({getProblem:async()=>problem,onAccepted:()=>{throw new Error('legacy accepted callback should not run');},onCompleted:s=>{submissions.push(s);}});
 await tracker.ingest(submit());await tracker.ingest(check('123',11));
 assert.equal(submissions.length,1);assert.equal(submissions[0].accepted,false);assert.equal(submissions[0].statusCode,11);assert.equal(submissions[0].statusMessage,'Wrong Answer');
});
