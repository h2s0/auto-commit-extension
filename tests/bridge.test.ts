import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { installNetworkBridge } from '../src/injected/network-bridge.ts';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
class FakeXHR extends EventTarget {
 responseType='';responseText='';response:unknown;status=200;method='';url='';body:unknown;
 open(method:string,url:string){this.method=method;this.url=url;}
 send(body:unknown){this.body=body;}
}
function target(fetcher:typeof fetch) {
 const messages:unknown[]=[];const listeners=new Map<string,Function>();
 const value={fetch:fetcher,XMLHttpRequest:FakeXHR,Request,crypto:globalThis.crypto,location:{origin:'https://leetcode.com',href:'https://leetcode.com/problems/two-sum/'},postMessage:(data:unknown)=>messages.push(data),addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)};
 return {value:value as unknown as Window & typeof globalThis,messages,listeners};
}
test('fetch Request body captured before consumption, caller receives original response',async()=>{
 const response=new Response(JSON.stringify({submission_id:123,private:'hidden'}));
 const {value,messages}=target(async input=>{await (input as Request).text();return response;});
 const restore=installNetworkBridge(value);
 try{const request=new Request('https://leetcode.com/problems/two-sum/submit/',{method:'POST',body:JSON.stringify({typed_code:'code',lang:'python3',question_id:'1',token:'never expose'})});const result=await value.fetch(request);assert.equal(result,response);assert.deepEqual(await result.json(),{submission_id:123,private:'hidden'});await tick();const event=(messages[0] as any);assert.equal(event.record.request.typed_code,'code');assert.equal(event.record.request.token,undefined);assert.equal(event.record.response.private,undefined);}finally{restore();}
});
test('fetch wrapper returns the original promise and rejects unrelated hosts/Run Code',async()=>{
 const pending=Promise.resolve(new Response('{}'));const {value,messages}=target(()=>pending);const restore=installNetworkBridge(value);
 try{assert.equal(value.fetch('https://leetcode.com/problems/two-sum/interpret_solution/'),pending);await value.fetch('https://other.example/problems/two-sum/submit/',{method:'POST',body:'{}'});await tick();assert.equal(messages.length,0);}finally{restore();}
});
test('XHR preserves request and captures submit and result responses',async()=>{
 const {value,messages}=target(async()=>new Response('{}'));const restore=installNetworkBridge(value);
 try{const xhr=new value.XMLHttpRequest();xhr.open('POST','/problems/two-sum/submit/');xhr.send(JSON.stringify({typed_code:'javascript code',lang:'javascript',question_id:'1'}));(xhr as unknown as FakeXHR).responseText=JSON.stringify({submission_id:321});xhr.dispatchEvent(new Event('loadend'));const result=new value.XMLHttpRequest();result.open('GET','/submissions/detail/321/check/');result.send();(result as unknown as FakeXHR).responseText=JSON.stringify({state:'SUCCESS',status_code:10,status_msg:'Accepted',status_runtime:'1 ms',status_memory:'20 MB'});result.dispatchEvent(new Event('loadend'));assert.equal(messages.length,2);assert.equal((messages[0] as any).record.request.typed_code,'javascript code');assert.equal((messages[1] as any).record.response.status_code,10);}finally{restore();}
});
test('replay recovers records emitted before the content module loaded',async()=>{
 const {value,messages,listeners}=target(async()=>new Response('{"submission_id":1}'));const restore=installNetworkBridge(value);
 try{await value.fetch('/problems/two-sum/submit/',{method:'POST',body:'{"typed_code":"code","lang":"python3","question_id":"1"}'});await tick();listeners.get('message')!({source:value,origin:value.location.origin,data:{source:'leetcode-github-sync-network-v1',type:'REPLAY'}});assert.equal(messages.length,2);assert.equal((messages[0] as any).record.id,(messages[1] as any).record.id);}finally{restore();}
});
