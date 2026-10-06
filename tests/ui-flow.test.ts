import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {runtimeRequest} from '../src/ui/client.ts';
import {onboardingStage,settingsFromTargets} from '../src/ui/model.ts';
import {defaults} from '../src/shared/types.ts';
test('onboarding progresses from login to repository selection to ready',()=>{
 assert.equal(onboardingStage(undefined,defaults),'login');
 assert.equal(onboardingStage('octocat',defaults),'repository');
 assert.equal(onboardingStage('octocat',{...defaults,owner:'octocat',repo:'solutions'}),'ready');
});
test('empty selection fails with an actionable error instead of a silent native form block',()=>{
 assert.throws(()=>settingsFromTargets([],defaults),/저장소를 선택/);
 assert.throws(()=>settingsFromTargets([{owner:'',repo:'',branch:''}],defaults),/빈 대상을 삭제/);
});
test('selected repo and branch become persisted multi-target settings',async()=>{
 const targets=[{owner:'octocat',repo:'personal',branch:''},{owner:'study',repo:'solutions',branch:'heesae'}];
 const settings=settingsFromTargets(targets,{includeFailed:true});
 const result=await runtimeRequest(async(message:any)=>{assert.equal(message.type,'SAVE');assert.deepEqual(message.settings.targets,targets);return{ok:true,data:{}};},'SAVE',{settings});
 assert.deepEqual(result,{});assert.equal(settings.includeFailed,true);
});
test('worker errors and missing worker responses are visible to the save handler',async()=>{
 await assert.rejects(()=>runtimeRequest(async()=>({ok:false,error:'설정 저장 실패'}),'SAVE'),/설정 저장 실패/);
 await assert.rejects(()=>runtimeRequest(()=>new Promise(()=>{}),'SAVE',{},10),/응답을 기다리는 중/);
});
