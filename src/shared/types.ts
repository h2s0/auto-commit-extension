export interface RepositoryTarget { owner: string; repo: string; branch: string; }
export interface Settings {
  // Legacy single-target fields remain readable for existing installations.
  owner: string; repo: string; branch: string;
  targets?: RepositoryTarget[];
  includeFailed?: boolean;
  baseDirectory: string; autoCommit: boolean; createReadme: boolean; includeMetrics: boolean;
}
export interface ProblemInfo { frontendId: string; title: string; titleSlug: string; difficulty?: 'Easy' | 'Medium' | 'Hard'; url: string; }
export interface Submission { submissionId: string; accepted: boolean; statusCode?: number; statusMessage?: string; problem: ProblemInfo; language: string; code: string; runtime?: string; memory?: string; }
export interface TargetResult { target: RepositoryTarget; state: 'success' | 'failed' | 'duplicate'; message: string; commitUrl?: string; }
export interface Status { state: string; message: string; time: string; commitUrl?: string; targets?: TargetResult[]; }
export const defaults: Settings = { owner: '', repo: '', branch: '', baseDirectory: 'LeetCode', autoCommit: true, includeFailed:false, createReadme: true, includeMetrics: true };
export interface LeetCodeAdapter { getProblem(): Promise<ProblemInfo>; observeSubmissions(callback: (submission: Submission) => void): () => void; }
export interface PendingUpload { submission: Submission; settings?: Settings; }
export function repositoryTargets(settings: Settings): RepositoryTarget[] {
  const targets = settings.targets ?? (settings.owner && settings.repo ? [{owner:settings.owner,repo:settings.repo,branch:settings.branch}] : []);
  return targets.map(target=>({...target,branch:target.branch || 'main'}));
}
