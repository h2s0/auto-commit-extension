import type { ProblemInfo, Submission, LeetCodeAdapter } from '../shared/types.ts';
import type { NetworkRecord } from '../shared/network.ts';
import { BRIDGE_SOURCE } from '../shared/network.ts';
import { validateSubmission } from '../shared/format.ts';

export interface Snapshot {
  submissionId: string;
  slug: string;
  questionId: string;
  language: string;
  code: string;
}
interface Tracked { snapshot: Snapshot; problem: Promise<ProblemInfo>; createdAt: number; }
export type DetectorState = 'detected' | 'accepted' | 'rejected' | 'failed';
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function numericId(value: unknown): string | undefined {
  return (typeof value === 'number' && Number.isSafeInteger(value) || typeof value === 'string') && /^\d+$/.test(String(value)) ? String(value) : undefined;
}
export function parseQuestion(value: unknown, slug: string): ProblemInfo | undefined {
  const question = object(value);
  const frontendId = numericId(question?.questionFrontendId);
  if (!question || !frontendId || question.titleSlug !== slug || typeof question.title !== 'string' || !question.title.trim()) return;
  const difficulty = question.difficulty;
  return {frontendId, title: question.title, titleSlug: slug,
    url: `https://leetcode.com/problems/${slug}/`,
    ...(['Easy', 'Medium', 'Hard'].includes(String(difficulty)) ? { difficulty: difficulty as ProblemInfo['difficulty'] } : {})};
}
export function parseSnapshot(record: NetworkRecord): Snapshot | undefined {
  const match = record.path.match(/^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)\/submit\/?$/);
  if (!match || record.method !== 'POST') return;
  if (record.status < 200 || record.status >= 300) throw new Error('LeetCode 제출 요청이 실패했습니다.');
  const request = object(record.request);
  const response = object(record.response);
  const submissionId = numericId(response?.submission_id);
  const questionId = numericId(request?.question_id);
  if (!request || !submissionId || !questionId || typeof request.typed_code !== 'string' || !request.typed_code.trim()
    || request.typed_code.length > 1_000_000 || typeof request.lang !== 'string' || !/^[a-z0-9]+$/.test(request.lang)) {
    throw new Error('LeetCode 제출 데이터 형식이 변경되었거나 코드를 읽을 수 없습니다.');
  }
  return {submissionId, questionId, slug:match[1], language:request.lang, code:request.typed_code};
}
export function parseResult(record: NetworkRecord): { id: string; accepted: boolean; final: boolean; runtime?: string; memory?: string; questionId?: string; statusCode?: number; statusMessage?: string } | undefined {
  const match = record.path.match(/^\/submissions\/detail\/(\d+)\/check\/?$/);
  if (!match || record.method !== 'GET') return;
  if (record.status < 200 || record.status >= 300) throw new Error('LeetCode 제출 결과 조회가 실패했습니다.');
  const response = object(record.response);
  if (!response || typeof response.state !== 'string') throw new Error('LeetCode 제출 결과 형식을 확인할 수 없습니다.');
  const id = numericId(response.submission_id);
  if (id && id !== match[1]) throw new Error('제출 ID와 결과 ID가 일치하지 않습니다.');
  if (response.state === 'PENDING' || response.state === 'STARTED') return {id:match[1],accepted:false,final:false};
  if (response.state !== 'SUCCESS' || typeof response.status_code !== 'number' || typeof response.status_msg !== 'string') throw new Error('알 수 없는 LeetCode 제출 결과입니다.');
  const accepted = response.status_code === 10 && response.status_msg === 'Accepted';
  // Reject inconsistent success fields, never infer success from text alone.
  if ((response.status_code === 10) !== (response.status_msg === 'Accepted')) throw new Error('LeetCode Accepted 필드가 일치하지 않습니다.');
  if (![10,11,12,13,14,15,20].includes(response.status_code)) throw new Error('지원하지 않는 LeetCode 제출 결과입니다.');
  return {id:match[1],accepted,final:true,statusCode:response.status_code,statusMessage:response.status_msg,
    ...(typeof response.status_runtime === 'string' ? {runtime:response.status_runtime} : {}),
    ...(typeof response.status_memory === 'string' ? {memory:response.status_memory} : {}),
    ...(numericId(response.question_id) ? {questionId:numericId(response.question_id)} : {})};
}

/** Correlates the submitted snapshot with its own ID; never reads the editor. */
export class SubmissionTracker {
  private tracked = new Map<string, Tracked>();
  private earlyResults = new Map<string, NetworkRecord>();
  private completed = new Set<string>();
  private seen = new Set<string>();
  constructor(
    privateOptions: {
      getProblem: (slug: string) => Promise<ProblemInfo>;
      onAccepted: (submission: Submission) => void | Promise<void>;
      onCompleted?: (submission: Submission) => void | Promise<void>;
      onState?: (state: DetectorState, message: string) => void;
    },
  ) { this.options = privateOptions; }
  private options: {
    getProblem: (slug: string) => Promise<ProblemInfo>;
    onAccepted: (submission: Submission) => void | Promise<void>;
      onCompleted?: (submission: Submission) => void | Promise<void>;
    onState?: (state: DetectorState, message: string) => void;
  };
  async ingest(record: NetworkRecord): Promise<void> {
    if (this.seen.has(record.id)) return;
    this.seen.add(record.id);
    if (this.seen.size > 300) this.seen.delete(this.seen.values().next().value!);
    try {
      if (record.error) throw new Error(record.error);
      const snapshot = parseSnapshot(record);
      if (snapshot) {
        if (this.completed.has(snapshot.submissionId) || this.tracked.has(snapshot.submissionId)) return;
        const problem = this.options.getProblem(snapshot.slug);
        // Attach a handler immediately so metadata failures cannot become unhandled rejections.
        void problem.catch(() => {});
        this.tracked.set(snapshot.submissionId, {snapshot, problem, createdAt:Date.now()});
        if (this.tracked.size > 30) this.tracked.delete(this.tracked.keys().next().value!);
        this.options.onState?.('detected', `제출 ${snapshot.submissionId} 결과를 기다리고 있습니다.`);
        const early = this.earlyResults.get(snapshot.submissionId);
        if (early) { this.earlyResults.delete(snapshot.submissionId); await this.finish(early); }
      } else if (parseResult(record)) await this.finish(record);
    } catch (error) {
      this.options.onState?.('failed', error instanceof Error ? error.message : '제출 감지 실패');
    }
  }
  expire(now = Date.now()): void {
    for (const [id,tracked] of this.tracked) {
      if (now - tracked.createdAt > 120_000) {
        this.tracked.delete(id);
        this.options.onState?.('failed', `제출 ${id} 결과를 2분 동안 확인하지 못했습니다. LeetCode 결과와 네트워크를 확인하세요.`);
      }
    }
  }
  private async finish(record: NetworkRecord) {
    const result = parseResult(record)!;
    if (!result.final || this.completed.has(result.id)) return;
    const tracked = this.tracked.get(result.id);
    if (!tracked) {
      this.earlyResults.set(result.id, record);
      if (this.earlyResults.size > 30) this.earlyResults.delete(this.earlyResults.keys().next().value!);
      return;
    }
    // Mark before awaiting: repeated polling responses must not schedule concurrent uploads.
    this.completed.add(result.id);
    if (this.completed.size > 2000) this.completed.delete(this.completed.values().next().value!);
    this.tracked.delete(result.id);
    if (!result.accepted && !this.options.onCompleted) { this.options.onState?.('rejected', 'Accepted가 아닌 제출은 저장하지 않습니다.'); return; }
    if (result.questionId && result.questionId !== tracked.snapshot.questionId) throw new Error('제출 문제와 결과 문제가 일치하지 않습니다.');
    this.options.onState?.(result.accepted ? 'accepted' : 'rejected',result.accepted ? 'Accepted · 제출한 코드를 GitHub에 전달합니다.' : `${result.statusMessage} · 오답 저장 설정을 확인합니다.`);
    const problem = await tracked.problem;
    if (problem.titleSlug !== tracked.snapshot.slug) throw new Error('제출 문제와 문제 메타데이터가 일치하지 않습니다.');
    const submission = validateSubmission({
      accepted:result.accepted,statusCode:result.statusCode,statusMessage:result.statusMessage,submissionId:result.id,problem,
      language:tracked.snapshot.language,code:tracked.snapshot.code,
      ...(result.runtime ? {runtime:result.runtime} : {}), ...(result.memory ? {memory:result.memory} : {}),
    });
    if (this.options.onCompleted) await this.options.onCompleted(submission);
    else await this.options.onAccepted(submission);
  }
}

export class BrowserLeetCodeAdapter implements LeetCodeAdapter {
  private problems = new Map<string, ProblemInfo>();
  private pendingProblems = new Map<string, Promise<ProblemInfo>>();
  private state: (state: DetectorState, message: string) => void;
  constructor(onState: (state: DetectorState, message: string) => void) { this.state = onState; }
  async getProblem(slug = location.pathname.match(/^\/problems\/([a-z0-9-]+)\//)?.[1]): Promise<ProblemInfo> {
    if (!slug) throw new Error('LeetCode 문제 페이지가 아닙니다.');
    const cached = this.problems.get(slug);
    if (cached) return cached;
    // The live page exposes a numbered title link; no private React/Monaco selectors.
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (new URL(anchor.href, location.href).pathname !== `/problems/${slug}/`) continue;
      const title = anchor.textContent?.trim().match(/^(\d+)\.\s+(.+)$/);
      if (title) {
        const problem: ProblemInfo = {frontendId:title[1],title:title[2],titleSlug:slug,url:`https://leetcode.com/problems/${slug}/`};
        this.problems.set(slug,problem);
        return problem;
      }
    }
    const pending = this.pendingProblems.get(slug);
    if (pending) return pending;
    const request = this.fetchProblem(slug);
    this.pendingProblems.set(slug,request);
    try { return await request; } finally { this.pendingProblems.delete(slug); }
  }
  private async fetchProblem(slug:string): Promise<ProblemInfo> {
    const response = await fetch('https://leetcode.com/graphql/', {
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:'query SyncProblem($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title titleSlug difficulty } }',variables:{titleSlug:slug}}),
      signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`문제 정보를 불러오지 못했습니다 (${response.status}). LeetCode를 새로고침하세요.`);
    const value:unknown = await response.json();
    const problem = parseQuestion(object(object(value)?.data)?.question,slug);
    if (!problem) throw new Error('LeetCode 문제 정보를 확인할 수 없습니다. 자동 저장을 중단했습니다.');
    this.problems.set(slug,problem);
    return problem;
  }
  observeSubmissions(callback: (submission: Submission) => void): () => void {
    const tracker = new SubmissionTracker({getProblem:slug => this.getProblem(slug),onAccepted:callback,onCompleted:callback,onState:this.state});
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== BRIDGE_SOURCE || event.data?.type !== 'NETWORK') return;
      const record = object(event.data.record);
      if (!record || typeof record.id !== 'string' || typeof record.path !== 'string' || typeof record.method !== 'string' || typeof record.status !== 'number') return;
      const value = record as unknown as NetworkRecord;
      const question = object(object(object(value.response)?.data)?.question);
      if (question && typeof question.titleSlug === 'string') {
        const info = parseQuestion(question,question.titleSlug);
        if (info) this.problems.set(info.titleSlug,info);
      }
      void tracker.ingest(value);
    };
    const timer = setInterval(()=>tracker.expire(),5000);
    window.addEventListener('message',listener);
    window.postMessage({source:BRIDGE_SOURCE,type:'REPLAY'},location.origin);
    return () => { clearInterval(timer); window.removeEventListener('message',listener); };
  }
}
