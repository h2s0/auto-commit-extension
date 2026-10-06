import {defaults,repositoryTargets,type Settings,type RepositoryTarget} from '../shared/types.ts';
import {validateSettings} from '../shared/format.ts';
export function onboardingStage(user:unknown,settings:Settings):'login'|'repository'|'ready' {
 if(!user)return 'login';
 return repositoryTargets(settings).length ? 'ready' : 'repository';
}
export function settingsFromTargets(targets:RepositoryTarget[],options:Partial<Settings>):Settings {
 if(!targets.length)throw new Error('저장소를 선택해주세요.');
 for(let index=0;index<targets.length;index++)if(!targets[index].owner||!targets[index].repo)throw new Error(`${index+1}번째 저장소를 선택하거나 빈 대상을 삭제해주세요.`);
 return validateSettings({...defaults,...options,...targets[0],targets});
}
