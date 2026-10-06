import {repositoryTargets, type Settings, type Submission} from './types.ts';
const extensions: Record<string, string> = {python3:'py',python:'py',java:'java',cpp:'cpp',c:'c',csharp:'cs',javascript:'js',typescript:'ts',golang:'go',rust:'rs',kotlin:'kt',swift:'swift',ruby:'rb',php:'php'};
export function validateSettings(value: Settings): Settings {
 if (!value || typeof value.owner !== 'string' || typeof value.repo !== 'string' || typeof value.branch !== 'string' || typeof value.baseDirectory !== 'string' || [value.autoCommit,value.createReadme,value.includeMetrics].some(v => typeof v !== 'boolean')) throw new Error('설정 형식이 올바르지 않습니다.');
 if (value.includeFailed !== undefined && typeof value.includeFailed !== 'boolean') throw new Error('오답 저장 설정을 확인하세요.');
 if (value.targets !== undefined && (!Array.isArray(value.targets) || value.targets.length > 10 || value.targets.some(t=>!t || typeof t.owner !== 'string' || typeof t.repo !== 'string' || typeof t.branch !== 'string'))) throw new Error('저장 대상은 최대 10개까지 등록할 수 있습니다.');
 const targets = repositoryTargets(value);
 if (!targets.length) throw new Error('GitHub 저장 대상을 등록하세요.');
 const unique = new Set<string>();
 for (const target of targets) {
  if (!/^[a-zA-Z0-9-]+$/.test(target.owner) || !/^[\w.-]+$/.test(target.repo) || ['.', '..'].includes(target.repo)) throw new Error('GitHub owner/repository를 확인하세요.');
  const branch = target.branch;
  if (/[\s~^:?*\[\\]/.test(branch) || branch.includes('..') || branch.includes('@{') || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.') || branch.split('/').some(p=>!p || p.startsWith('.') || p.endsWith('.lock')) || branch === '@') throw new Error('브랜치 이름을 확인하세요.');
  const key = `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}/${branch}`;
  if (unique.has(key)) throw new Error('같은 저장소와 브랜치를 중복 등록할 수 없습니다.');
  unique.add(key);
 }
 if (value.baseDirectory.split('/').some(part => !/^[\w.-]+$/.test(part) || ['.', '..'].includes(part))) throw new Error('저장 경로에는 안전한 폴더 이름만 사용하세요.');
 return value;
}
export function validateSubmission(s: Submission): Submission {
 if (typeof s.accepted !== 'boolean' || !/^\d+$/.test(s.submissionId) || !/^\d+$/.test(s.problem?.frontendId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.problem.titleSlug) || typeof s.code !== 'string' || !s.code.trim() || s.code.length > 1000000 || !s.problem.title || typeof s.language !== 'string') throw new Error('제출 데이터가 올바르지 않습니다.');
 if (!s.accepted && (![11,12,13,14,15,20].includes(s.statusCode ?? -1) || typeof s.statusMessage !== 'string' || !s.statusMessage.trim() || s.statusMessage === 'Accepted')) throw new Error('실패 제출의 결과를 확인할 수 없습니다.');
 if (s.accepted && (s.statusCode !== undefined && s.statusCode !== 10 || s.statusMessage !== undefined && s.statusMessage !== 'Accepted')) throw new Error('Accepted 결과가 일치하지 않습니다.');
 if (s.problem.url !== `https://leetcode.com/problems/${s.problem.titleSlug}/`) throw new Error('문제 URL이 올바르지 않습니다.');
 return s;
}
export function filesFor(s: Submission, settings: Settings): Record<string, string> {
 validateSubmission(s); validateSettings(settings);
 const directory = `${settings.baseDirectory}/${s.problem.frontendId.padStart(4, '0')}-${s.problem.titleSlug}`;
 const extension = extensions[s.language] ?? 'txt';
 // Failed attempts must not overwrite a working accepted solution.
 const codePath = s.accepted ? `${directory}/solution.${extension}` : `${directory}/attempts/${s.submissionId}/solution.${extension}`;
 const readmePath = s.accepted ? `${directory}/README.md` : `${directory}/attempts/${s.submissionId}/README.md`;
 const files: Record<string,string> = {[codePath]: s.code};
 if (settings.createReadme) files[readmePath] = `# ${s.problem.frontendId}. ${s.problem.title.replace(/[\r\n]/g, ' ')}\n\n- Difficulty: ${s.problem.difficulty ?? 'Unknown'}\n- Language: ${s.language}\n- Status: ${s.statusMessage ?? 'Accepted'}\n- LeetCode: ${s.problem.url}\n${settings.includeMetrics ? `\n## Result\n\n- Runtime: ${s.runtime ?? 'Unavailable'}\n- Memory: ${s.memory ?? 'Unavailable'}\n` : ''}`;
 return files;
}

export function parseRepositoryUrl(value: string): {owner: string; repo: string} {
 const error = () => new Error('https://github.com/사용자/저장소 형식의 URL을 입력하세요.');
 let url: URL;
 try { url = new URL(value.trim()); } catch { throw error(); }
 if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw error();
 const match = url.pathname.match(/^\/([a-zA-Z0-9-]+)\/([\w.-]+)\/?$/);
 if (!match) throw error();
 const repo = match[2].replace(/\.git$/, '');
 if (!repo || ['.', '..'].includes(repo)) throw error();
 return {owner:match[1],repo};
}
