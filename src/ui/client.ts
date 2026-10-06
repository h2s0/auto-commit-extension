export async function runtimeRequest(
  send:(message:unknown)=>Promise<{ok:boolean;data?:any;error?:string}>,
  type:string,body:Record<string,unknown>={},timeoutMs=15000,
):Promise<any> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const response=await Promise.race([
   send({type,...body}),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('응답을 기다리는 중입니다. 확장 프로그램을 새로고침한 뒤 다시 확인하세요.')),timeoutMs);}),
  ]);
  if(!response?.ok)throw new Error(response?.error ?? '확장 프로그램에 연결하지 못했습니다. 확장 프로그램과 LeetCode 페이지를 새로고침하세요.');
  return response.data;
 } finally {if(timer)clearTimeout(timer);}
}
