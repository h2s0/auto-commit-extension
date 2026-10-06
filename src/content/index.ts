import { extension as chrome } from '../shared/chrome.ts';
import { BrowserLeetCodeAdapter, type DetectorState } from './leetcode.ts';
import { BRIDGE_SOURCE } from '../shared/network.ts';
let previousSlug: string | undefined;
let diagnostics: {path:string;method:string;status:number}[] = [];
let toast: HTMLElement | undefined;
function show(message:string, failed=false) {
  if (!document.body) { document.addEventListener('DOMContentLoaded',()=>show(message,failed),{once:true}); return; }
  if (!toast) {
    const host = document.createElement('div');
    const shadow = host.attachShadow({mode:'closed'});
    toast = document.createElement('div');
    toast.setAttribute('role','status');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;max-width:340px;padding:14px 18px;border-radius:10px;color:white;font:14px/1.5 system-ui;z-index:2147483647;box-shadow:0 4px 20px #0004;';
    shadow.append(toast); document.body.append(host);
  }
  toast.style.background = failed ? '#991b1b' : '#14532d';
  toast.textContent = `LeetCode GitHub Sync · ${message}`;
  toast.hidden = false;
  const current = toast;
  setTimeout(()=>{ if (current.textContent === `LeetCode GitHub Sync · ${message}`) current.hidden=true; },7000);
}
async function send(type:string, body:Record<string,unknown> = {}) {
  const response = await chrome.runtime.sendMessage({type,...body});
  if (!response?.ok) throw new Error(response?.error ?? '확장 프로그램 연결이 끊겼습니다. 페이지를 새로고침하세요.');
  return response.data;
}
function state(state:DetectorState,message:string) {
  void send('DETECTOR_STATUS',{state,message}).catch(error=>show(String(error),true));
  if (state === 'failed') show(message,true);
}
const adapter = new BrowserLeetCodeAdapter(state);
adapter.observeSubmissions(async submission=>{
  try {
    const result = await send('SUBMISSION_RESULT',{submission});
    if (result.skipped) return;
    if (result.duplicate) show('이미 저장한 제출입니다.');
    else show(result.message ?? 'GitHub 커밋 완료',result.state === 'failed' || result.state === 'partial');
  } catch(error) { show(error instanceof Error ? error.message : 'GitHub 업로드 실패',true); }
});
async function report() {
  const slug = location.pathname.match(/^\/problems\/([a-z0-9-]+)\//)?.[1] ?? '';
  if (slug === previousSlug) return;
  previousSlug = slug;
  try { await send('PAGE_STATUS',{slug,diagnostics}); }
  catch(error) {console.warn('LeetCode GitHub Sync:',error instanceof Error ? error.message : 'Extension disconnected');}
}
window.addEventListener('message',event=>{
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== BRIDGE_SOURCE || event.data?.type !== 'NETWORK') return;
  const record = event.data.record;
  if (typeof record?.path !== 'string' || typeof record?.method !== 'string' || typeof record?.status !== 'number') return;
  diagnostics = [...diagnostics,{path:record.path.slice(0,200),method:record.method.slice(0,10),status:record.status}].slice(-15);
  previousSlug=undefined;
  void report();
});
setInterval(()=>void report(),2000);
void report();
