import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {GitHub} from '../src/background/github.ts';
import {defaults,type Submission} from '../src/shared/types.ts';
const submission:Submission={submissionId:'123',accepted:true,problem:{frontendId:'1',title:'Two Sum',titleSlug:'two-sum',url:'https://leetcode.com/problems/two-sum/'},language:'python3',code:'print(1)'};
test('code and README share a single non-forced atomic commit',async()=>{
 const original=globalThis.fetch; const calls:{url:string;method:string;body:any}[]=[];
 globalThis.fetch=async(input,init)=>{const url=String(input); const method=init?.method??'GET';const body=init?.body ? JSON.parse(String(init.body)):undefined;calls.push({url,method,body});
 let data:unknown={};let status=200;
 if(url.endsWith('/solutions'))data={default_branch:'main'};
 else if(url.endsWith('/git/ref/heads/main'))data={object:{sha:'head'}};
 else if(url.endsWith('/git/commits/head'))data={tree:{sha:'old-tree'},message:'old'};
 else if(url.includes('/contents/'))status=404;
 else if(url.endsWith('/git/trees'))data={sha:'new-tree'};
 else if(url.endsWith('/git/commits'))data={sha:'commit',html_url:'https://github.com/octocat/solutions/commit/commit'};
 return new Response(JSON.stringify(data),{status});};
 try{await new GitHub('test-token').commit(submission,{...defaults,owner:'octocat',repo:'solutions'});assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/git/commits')).length,1);assert.equal(calls.find(c=>c.url.endsWith('/git/trees'))?.body.tree.length,2);assert.deepEqual(calls.find(c=>c.method==='PATCH')?.body,{sha:'commit',force:false});}finally{globalThis.fetch=original;}
});
test('authentication failure returns actionable message without token',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response('{}',{status:401});try{await assert.rejects(()=>new GitHub('secret-token').user(),/인증/);}finally{globalThis.fetch=original;}});
