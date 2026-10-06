import {extension as chrome} from '../shared/chrome.ts';
import {parseRepositoryUrl} from '../shared/format.ts';
import {defaults,repositoryTargets,type Settings,type Status,type RepositoryTarget} from '../shared/types.ts';
import {runtimeRequest} from './client.ts';
import {onboardingStage,settingsFromTargets} from './model.ts';
const optionsPage=location.pathname.endsWith('/options.html');
document.body.classList.add(optionsPage ? 'options-page' : 'popup-page');
const app=document.querySelector('#app')!;
app.innerHTML=`<header><span class="eyebrow">LEETCODE → GITHUB</span><h1>LeetCode <span>Hub</span></h1><p>문제에 집중하세요. 풀이 기록은 자동으로.</p></header><div id="feedback" class="notice" role="status" aria-live="polite" hidden></div><section id="loginPanel" class="panel" hidden><span class="step">01 · 계정 연결</span><h2>GitHub와 연결하세요</h2><p>로그인하고 권한을 승인하면 끝입니다.<br>토큰을 만들거나 복사할 필요가 없습니다.</p><button id="connectOAuth" class="primary wide">GitHub 연결</button><p id="authHint" class="hint"></p></section><section id="setupPanel" class="panel" hidden><span class="step">02 · 저장소 연결</span><h2>풀이를 어디에 저장할까요?</h2><p id="setupAccount"></p><div id="popupSetup"><p>저장소를 선택하면 이후에는 Submit만 하면 됩니다.</p><button id="openSetup" class="primary wide">저장소 연결하기</button></div><form id="settings" novalidate hidden><div class="mode-tabs"><button id="existingMode" type="button" class="selected">기존 저장소 연결</button><button id="newMode" type="button">새 비공개 저장소 만들기</button></div><div id="existingSection"><p class="hint">목록에서 저장소와 브랜치를 선택하세요. 개인·스터디 저장소를 함께 연결할 수 있습니다.</p><p id="catalogNote" class="hint" aria-live="polite"></p><div id="targets"></div><button id="addTarget" type="button" class="secondary">저장 대상 추가</button><button id="reloadRepos" type="button" class="text-button">목록 새로고침</button></div><div id="newSection" hidden><label>새 저장소 이름<input id="newRepoName" placeholder="leetcode-solutions" autocomplete="off"></label><p class="hint">GitHub 계정에 비공개 저장소를 만들고 자동으로 목록에 추가합니다.</p><button id="createRepo" type="button" class="secondary">비공개 저장소 만들기</button></div><details class="preferences"><summary>저장 옵션</summary><label class="check"><input id="autoCommit" type="checkbox"> 자동 커밋</label><label class="check"><input id="includeFailed" type="checkbox"> 틀린 답과 실행 오류도 저장</label><p class="hint">오답은 attempts 폴더에 저장합니다. Run 버튼은 항상 제외합니다.</p><label class="check"><input id="createReadme" type="checkbox"> README 생성</label><label class="check"><input id="includeMetrics" type="checkbox"> 실행 시간·메모리 포함</label><label>저장 폴더<input id="baseDirectory"></label></details><div class="save-area"><p id="saveNotice" role="status" aria-live="polite"></p><button id="saveButton" type="submit" class="primary wide">연결하고 시작하기</button></div></form></section><section id="readyPanel" class="panel" hidden><span class="step">03 · 연결 완료</span><h2>이제 Submit만 하면 됩니다</h2><p id="user"></p><ul id="linkedTargets" class="linked-targets"></ul><label class="switch-row"><span>자동 커밋</span><input id="quickAuto" type="checkbox"></label><label class="switch-row"><span>오답도 저장</span><input id="quickFailed" type="checkbox"></label><p class="hint">기본은 Accepted만 저장합니다.</p><button id="manage" class="secondary wide">저장소 및 옵션 변경</button></section><section id="syncPanel" class="panel" hidden><h2>최근 저장 상태</h2><p id="status"></p><div id="results"></div><button id="retry" class="secondary" hidden>실패한 대상만 재시도</button></section><footer><button id="disconnect" class="text-button" hidden>GitHub 연결 해제</button><button id="options" class="text-button">설정 페이지</button></footer><details id="developer" class="developer" hidden><summary>개발자 도구</summary><form id="connect" novalidate><label>테스트용 GitHub 토큰<input id="token" type="password" autocomplete="off"></label><button class="secondary">테스트 토큰으로 연결</button></form><pre id="page"></pre><form id="upload" novalidate><label>Submission JSON<textarea id="submission" spellcheck="false"></textarea></label><button class="secondary">수동 업로드</button></form></details>`;
function el<T extends HTMLElement>(id:string):T{return document.getElementById(id) as T;}
const input=(id:string)=>el<HTMLInputElement>(id);
const send=(type:string,body:Record<string,unknown>={})=>runtimeRequest(message=>chrome.runtime.sendMessage(message),type,body,type==='CONNECT_OAUTH'?600000:15000);
let saved:Settings={...defaults};let currentUser='';let credentials:string[]=[];let editing=false;
let catalog:{full_name:string;default_branch:string}[]=[];let catalogLoaded=false;
const branches=new Map<string,string[]>();
function notify(message:string,kind='success'){
 const notice=el('feedback');notice.hidden=false;notice.dataset.kind=kind;notice.textContent=message;
 if(kind==='error')notice.setAttribute('role','alert');else notice.setAttribute('role','status');
}
function showStage(){
 const stage=onboardingStage(currentUser,saved);
 const setup=stage==='repository'||Boolean(currentUser&&editing);
 el('loginPanel').hidden=stage!=='login';el('setupPanel').hidden=!setup;el('readyPanel').hidden=stage!=='ready'||editing;
 el('popupSetup').hidden=optionsPage;el('settings').hidden=!optionsPage;el('syncPanel').hidden=stage!=='ready';
 el('developer').hidden=!optionsPage;el('disconnect').hidden=!currentUser;
 el('setupAccount').textContent=currentUser ? `${currentUser} 계정에 연결되었습니다.`:'';
 el('user').textContent=currentUser ? `GitHub · ${currentUser}`:'';
 input('quickAuto').checked=saved.autoCommit;input('quickFailed').checked=Boolean(saved.includeFailed);
 const list=el('linkedTargets');list.replaceChildren();
 for(const target of repositoryTargets(saved)){
  const li=document.createElement('li');const repo=document.createElement('strong');repo.textContent=`${target.owner}/${target.repo}`;
  const branch=document.createElement('span');branch.textContent=target.branch;li.append(repo,branch);list.append(li);
 }
 el('saveButton').textContent=repositoryTargets(saved).length ? '설정 저장':'연결하고 시작하기';
}
async function refresh(updateEditor=true){
 const state=await send('STATE');
 const switched=currentUser&&currentUser!==state.user;
 saved=state.settings;currentUser=state.user??'';credentials=state.credentialRepos??[];
 if(switched){catalog=[];catalogLoaded=false;branches.clear();}
 if(updateEditor&&optionsPage){
  el('targets').replaceChildren();const targets=repositoryTargets(saved);
  if(targets.length)targets.forEach(target=>addTarget(target));else addTarget();
  input('baseDirectory').value=saved.baseDirectory;
  for(const key of ['autoCommit','includeFailed','createReadme','includeMetrics'] as const)input(key).checked=Boolean(saved[key]);
 }
 el('authHint').textContent=state.oauthConfigured ? 'GitHub 로그인 화면에서 저장소 접근을 승인해주세요.':'현재 개발 빌드는 GitHub 로그인 서비스 설정이 아직 완료되지 않았습니다.';
 showStage();renderStatus(state.status);updatePending(state.pendingUploads);
 el('page').textContent=state.page?JSON.stringify(state.page,null,2):'LeetCode 문제 페이지를 새로고침하세요.';
 if(optionsPage&&currentUser&&!catalogLoaded)void loadRepositories();
}
function updatePending(value:unknown){const pending=Boolean(value&&Object.keys(value).length);el('retry').hidden=!pending;}
function renderStatus(value:unknown){
 const status=value as Status|undefined;
 el('status').textContent=status?`${status.message}\n${new Date(status.time).toLocaleString()}`:'제출을 기다리고 있습니다.';
 const list=el('results');list.replaceChildren();
 for(const result of status?.targets??[]){
  const item=document.createElement('p');item.textContent=`${result.target.owner}/${result.target.repo} · ${result.target.branch}: ${result.message} `;
  if(result.commitUrl&&/^https:\/\/github\.com\//.test(result.commitUrl)){const link=document.createElement('a');link.href=result.commitUrl;link.textContent='커밋 보기';link.target='_blank';link.rel='noreferrer';item.append(link);}list.append(item);
 }
}
function repoOptions(select:HTMLSelectElement,selected:string){
 select.replaceChildren(new Option('저장소를 선택하세요',''));
 for(const repo of catalog)select.add(new Option(repo.full_name,repo.full_name));
 if(selected&&!catalog.some(repo=>repo.full_name===selected))select.add(new Option(selected,selected));
 select.value=selected;
}
function rowTarget(row:HTMLElement):RepositoryTarget{
 const value=row.querySelector<HTMLSelectElement>('.repo-select')!.value;
 if(!value)throw new Error('저장소를 선택해주세요.');
 const [owner,repo]=value.split('/');return{owner,repo,branch:row.querySelector<HTMLSelectElement>('.branch-select')!.value||'main'};
}
async function loadBranches(row:HTMLElement,selected='main'){
 const note=row.querySelector<HTMLElement>('.row-note')!;const select=row.querySelector<HTMLSelectElement>('.branch-select')!;
 let target:RepositoryTarget;
 try{target=rowTarget(row);}catch{note.textContent='';return;}
 const repoKey=`${target.owner}/${target.repo}`;row.dataset.loading='true';note.textContent='브랜치를 불러오는 중…';
 try{
  const response=await send('BRANCHES',{target});
  if(!row.isConnected||row.querySelector<HTMLSelectElement>('.repo-select')!.value!==repoKey)return;
  const names=response.map((branch:{name:string})=>branch.name) as string[];branches.set(repoKey,names);
  const all=[...new Set(['main',...names,...(selected?[selected]:[])])];select.replaceChildren();
  for(const name of all)select.add(new Option(names.includes(name)?name:`${name} (생성 필요)`,name));select.value=selected||'main';
  note.textContent=names.includes(select.value)?'':'선택한 브랜치가 없습니다. 아래 버튼으로 만들 수 있습니다.';
 }catch(error){note.textContent=error instanceof Error?error.message:'브랜치를 불러오지 못했습니다.';}
 finally{delete row.dataset.loading;}
}
function addTarget(target?:RepositoryTarget){
 const container=el('targets');if(container.children.length>=10){notify('저장 대상은 최대 10개입니다.','error');return;}
 const row=document.createElement('div');row.className='target-card';
 row.innerHTML='<label>저장소<select class="repo-select"></select></label><label>브랜치<select class="branch-select"><option value="main">main</option></select></label><p class="row-note hint" aria-live="polite"></p><div class="row-actions"><button type="button" class="my-branch secondary">내 이름 브랜치 사용</button><button type="button" class="main-branch text-button">main 브랜치 만들기</button><button type="button" class="remove-target text-button">삭제</button></div><details><summary>URL 또는 다른 브랜치 사용</summary><label>저장소 URL<input class="repository-url" type="url" placeholder="https://github.com/사용자/저장소"></label><button type="button" class="use-url secondary">URL로 대상 선택</button><label>새 브랜치 이름<input class="custom-branch" placeholder="heesae"></label><button type="button" class="create-custom secondary">브랜치 만들기</button></details><details class="credentials"><summary>고급 인증 설정</summary><label>대상별 테스트 토큰<input type="password" class="target-token" autocomplete="off"></label><label class="check"><input type="checkbox" class="clear-token"> 저장한 대상별 토큰 해제</label></details>';
 const selected=target?`${target.owner}/${target.repo}`:'';
 repoOptions(row.querySelector<HTMLSelectElement>('.repo-select')!,selected);
 const branch=row.querySelector<HTMLSelectElement>('.branch-select')!;
 if(target?.branch&&target.branch!=='main')branch.add(new Option(target.branch,target.branch));branch.value=target?.branch||'main';
 const token=row.querySelector<HTMLInputElement>('.target-token')!;
 token.placeholder=target&&credentials.includes(`${target.owner.toLowerCase()}/${target.repo.toLowerCase()}`)?'저장된 토큰 유지 · 변경할 때만 입력':'비우면 GitHub 연결 토큰 사용';
 row.querySelector('.remove-target')!.addEventListener('click',()=>row.remove());
 row.querySelector('.repo-select')!.addEventListener('change',()=>{branch.value='main';void loadBranches(row);});
 const createBranch=async(name:string)=>{
  const destination={...rowTarget(row),branch:name};const key=`${destination.owner}/${destination.repo}`;
  if(!branches.get(key)?.includes(name))await send('CREATE_BRANCH',{target:destination});
  await loadBranches(row,name);notify(`${name} 브랜치를 선택했습니다.`);
 };
 bind(row.querySelector<HTMLButtonElement>('.my-branch')!,async()=>createBranch(currentUser));
 bind(row.querySelector<HTMLButtonElement>('.main-branch')!,async()=>createBranch('main'));
 bind(row.querySelector<HTMLButtonElement>('.create-custom')!,async()=>{const name=row.querySelector<HTMLInputElement>('.custom-branch')!.value.trim();if(!name)throw new Error('브랜치 이름을 입력해주세요.');await createBranch(name);});
 bind(row.querySelector<HTMLButtonElement>('.use-url')!,async()=>{const parsed=parseRepositoryUrl(row.querySelector<HTMLInputElement>('.repository-url')!.value);repoOptions(row.querySelector<HTMLSelectElement>('.repo-select')!,`${parsed.owner}/${parsed.repo}`);await loadBranches(row);});
 container.append(row);if(selected&&currentUser)void loadBranches(row,target?.branch);
}
async function loadRepositories(){
 el('catalogNote').textContent='접근 가능한 저장소를 불러오는 중…';
 try{
  catalog=await send('REPOS');catalogLoaded=true;
  for(const select of el('targets').querySelectorAll<HTMLSelectElement>('.repo-select'))repoOptions(select,select.value);
  el('catalogNote').textContent=catalog.length?'':'저장소가 없습니다. 새 저장소를 만들거나 URL로 공용 저장소를 선택하세요.';
 }catch(error){el('catalogNote').textContent=error instanceof Error?error.message:'저장소를 불러오지 못했습니다.';}
}
function bind(element:HTMLElement,handler:()=>Promise<unknown>,form=false){
 element.addEventListener(form?'submit':'click',async event=>{
  event.preventDefault();const button=form?element.querySelector<HTMLButtonElement>('button[type=submit],button:not([type])'):element as HTMLButtonElement;
  const oldText=button?.textContent;if(button){button.disabled=true;button.textContent='처리 중…';}
  notify('처리 중입니다.','progress');
  try{await handler();}
  catch(error){const message=error instanceof Error?error.message:'요청에 실패했습니다.';notify(message,'error');if(element.id==='settings')el('saveNotice').textContent=message;}
  finally{if(button){button.disabled=false;button.textContent=oldText??'';}}
 });
}
bind(el('connectOAuth'),async()=>{notify('GitHub 로그인 화면에서 권한을 승인해주세요.','progress');await send('CONNECT_OAUTH');await refresh();notify('GitHub 연결 완료. 저장소를 선택해주세요.');if(!optionsPage)await chrome.runtime.openOptionsPage();});
bind(el('connect'),async()=>{const token=input('token').value.trim();if(!token)throw new Error('테스트 토큰을 입력해주세요.');await send('CONNECT',{token});input('token').value='';await refresh();notify('GitHub에 연결되었습니다.');},true);
bind(el('openSetup'),()=>chrome.runtime.openOptionsPage());
bind(el('options'),()=>chrome.runtime.openOptionsPage());
bind(el('manage'),async()=>{if(!optionsPage){await chrome.runtime.openOptionsPage();return;}editing=true;showStage();});
el('addTarget').addEventListener('click',()=>addTarget());
bind(el('reloadRepos'),()=>loadRepositories());
bind(el('disconnect'),async()=>{await send('DISCONNECT');currentUser='';catalog=[];catalogLoaded=false;await refresh();notify('GitHub 연결을 해제했습니다.');});
el('existingMode').addEventListener('click',()=>{el('existingSection').hidden=false;el('newSection').hidden=true;el('existingMode').classList.add('selected');el('newMode').classList.remove('selected');});
el('newMode').addEventListener('click',()=>{el('existingSection').hidden=true;el('newSection').hidden=false;el('newMode').classList.add('selected');el('existingMode').classList.remove('selected');});
bind(el('createRepo'),async()=>{
 const name=input('newRepoName').value.trim();if(!name)throw new Error('새 저장소 이름을 입력해주세요.');
 const repo=await send('CREATE_REPOSITORY',{name});await loadRepositories();const [owner,repository]=repo.full_name.split('/');
 const blank=el('targets').querySelector<HTMLElement>('.target-card');
 if(blank&&!blank.querySelector<HTMLSelectElement>('.repo-select')!.value)blank.remove();
 addTarget({owner,repo:repository,branch:'main'});el('existingMode').click();notify('비공개 저장소를 만들었습니다. 연결하고 시작하기를 눌러주세요.');
});
bind(el('settings'),async()=>{
 el('saveNotice').textContent='설정을 저장하는 중…';
 const rows=[...el('targets').querySelectorAll<HTMLElement>('.target-card')];
 const targets=rows.map((row,index)=>{try{return rowTarget(row);}catch{row.querySelector<HTMLSelectElement>('.repo-select')!.focus();throw new Error(`${index+1}번째 저장소를 선택하거나 빈 대상을 삭제해주세요.`);}});
 const settings=settingsFromTargets(targets,{baseDirectory:input('baseDirectory').value.trim(),autoCommit:input('autoCommit').checked,includeFailed:input('includeFailed').checked,createReadme:input('createReadme').checked,includeMetrics:input('includeMetrics').checked});
 const credentials=rows.map((row,index)=>({repoKey:`${targets[index].owner.toLowerCase()}/${targets[index].repo.toLowerCase()}`,token:row.querySelector<HTMLInputElement>('.target-token')!.value,clear:row.querySelector<HTMLInputElement>('.clear-token')!.checked}));
 await send('SAVE',{settings,credentials});
 const confirmed=await send('STATE');
 if(JSON.stringify(confirmed.settings.targets)!==JSON.stringify(settings.targets))throw new Error('설정 저장을 확인하지 못했습니다. 다시 시도해주세요.');
 editing=false;await refresh();notify(`설정 저장 완료 · ${targets.length}개 저장 대상이 연결되었습니다.`);el('saveNotice').textContent='저장 완료';
},true);
for(const [id,key] of [['quickAuto','autoCommit'],['quickFailed','includeFailed']] as const){
 input(id).addEventListener('change',async()=>{const before=Boolean(saved[key]);input(id).disabled=true;try{const settings={...saved,[key]:input(id).checked};await send('SAVE',{settings});saved=settings;notify('설정을 저장했습니다.');}catch(error){input(id).checked=before;notify(error instanceof Error?error.message:'설정 저장 실패','error');}finally{input(id).disabled=false;}});
}
bind(el('retry'),async()=>{await send('RETRY');await refresh(false);notify('재시도를 완료했습니다.');});
bind(el('upload'),async()=>{await send('UPLOAD',{submission:JSON.parse(input('submission').value)});notify('수동 업로드를 완료했습니다.');},true);
void refresh().catch(error=>notify(error instanceof Error?error.message:'확장 프로그램을 새로고침해주세요.','error'));
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.status)renderStatus(changes.status.newValue);
 if(changes.pendingUploads)updatePending(changes.pendingUploads.newValue);
 if(changes.user)void refresh().catch(error=>notify(String(error),'error'));
 if(changes.page)el('page').textContent=JSON.stringify(changes.page.newValue,null,2);
});
