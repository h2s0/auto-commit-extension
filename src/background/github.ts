import type { Settings, Submission } from '../shared/types.ts';
import {defaults, type RepositoryTarget} from '../shared/types.ts';
import {validateSettings, filesFor } from '../shared/format.ts';
export class GitHub {
 constructor(privateToken: string) { this.token = privateToken; }
 private token: string;
 async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {method, headers:{Authorization:`Bearer ${this.token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', ...(body ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(response.status === 401 ? 'GitHub 인증을 다시 연결하세요.' : response.status === 403 ? 'GitHub 권한 또는 API 요청 한도를 확인하세요.' : response.status === 404 ? '저장소, 브랜치 또는 토큰 접근 권한을 확인하세요.' : `GitHub 요청 실패 (${response.status}). 다시 시도하세요.`);
  return response.json() as Promise<T>;
 }
 user() { return this.request<{login:string}>('/user'); }
 async repositories() {
  const result:{full_name:string;default_branch:string;permissions?:{push:boolean};archived?:boolean}[]=[];
  for(let page=1;page<=10;page++) {
   const batch=await this.request<typeof result>(`/user/repos?per_page=100&sort=updated&page=${page}`);
   result.push(...batch.filter(repo=>!repo.archived&&repo.permissions?.push!==false));
   if(batch.length<100)break;
  }
  return result;
 }
 async branches(target:RepositoryTarget) {
  validateSettings({...defaults,...target});
  const root=`/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const result:{name:string}[]=[];
  for(let page=1;page<=10;page++) {
   const batch=await this.request<{name:string}[]>(`${root}/branches?per_page=100&page=${page}`);
   result.push(...batch);if(batch.length<100)break;
  }
  return result;
 }
 async createRepository(name:string) {
  if(!/^[\w.-]+$/.test(name)||['.','..'].includes(name))throw new Error('저장소 이름에는 영문, 숫자, -, _, .만 사용할 수 있습니다.');
  return this.request<{full_name:string;default_branch:string}>('/user/repos','POST',{name,private:true,auto_init:true,description:'LeetCode solutions synced automatically.'});
 }
 async createBranch(target:RepositoryTarget) {
  validateSettings({...defaults,...target});
  const root=`/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const repo=await this.request<{default_branch:string}>(root);
  const parent=await this.request<{object:{sha:string}}>(`${root}/git/ref/heads/${repo.default_branch.split('/').map(encodeURIComponent).join('/')}`);
  await this.request(`${root}/git/refs`,'POST',{ref:`refs/heads/${target.branch}`,sha:parent.object.sha});
  return {name:target.branch};
 }
 async commit(s: Submission, settings: Settings) {
  const root = `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}`;
  const branch = settings.branch || 'main';
  const refPath = `/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const ref = await this.request<{object:{sha:string}}>(root + refPath.replace('/refs/', '/ref/'));
  const parent = await this.request<{tree:{sha:string}; message:string}>(`${root}/git/commits/${ref.object.sha}`);
  const files = filesFor(s, settings);
  let exists = false;
  for (const [path, content] of Object.entries(files)) {
   const result = await fetch(`https://api.github.com${root}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`, {headers:{Authorization:`Bearer ${this.token}`, Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
   if (result.ok) exists = true;
   else if (result.status !== 404) throw new Error(`파일 조회 실패 (${result.status})`);
  }
  const tree = await this.request<{sha:string}>(`${root}/git/trees`, 'POST', {base_tree:parent.tree.sha, tree:Object.entries(files).map(([path,content]) => ({path, mode:'100644',type:'blob',content}))});
  if (tree.sha === parent.tree.sha) return {url:`https://github.com/${settings.owner}/${settings.repo}/commit/${ref.object.sha}`, unchanged:true};
  const commit = await this.request<{sha:string; html_url:string}>(`${root}/git/commits`, 'POST', {message:`${s.accepted ? (exists ? 'Update' : 'Solve') : 'Attempt'} ${s.problem.frontendId.padStart(4,'0')}. ${s.problem.title}${s.accepted ? '' : ` (${s.statusMessage})`}\n\nLeetCode-Submission: ${s.submissionId}`, tree:tree.sha,parents:[ref.object.sha]});
  // Never force: concurrent repository changes must not be overwritten.
  await this.request(root + refPath, 'PATCH', {sha:commit.sha,force:false});
  return {url:commit.html_url, unchanged:false};
 }
}
