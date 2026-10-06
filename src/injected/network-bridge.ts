import type { NetworkRecord } from '../shared/network.ts';

/** MAIN world observer; original fetch promises and XHR behavior are preserved. */
export function installNetworkBridge(target: Window & typeof globalThis): () => void {
  const source = 'leetcode-github-sync-network-v1';
  const origin = target.location.origin;
  const originalFetch = target.fetch;
  const prototype = target.XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  const originalSend = prototype.send;
  const requests = new WeakMap<XMLHttpRequest, { path: string; method: string }>();
  let sequence = 0;
  const session = target.crypto.randomUUID();
  const history: { record: NetworkRecord; at: number }[] = [];
  const route = (input: string): string | undefined => {
    const url = new URL(input, target.location.href);
    if (url.origin !== origin) return;
    if (/^\/problems\/[a-z0-9-]+\/submit\/?$/.test(url.pathname)
      || /^\/submissions\/detail\/\d+\/check\/?$/.test(url.pathname)
      || /^\/graphql\/?$/.test(url.pathname)) return url.pathname;
  };
  const object = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const parse = (text: string): unknown => {
    if (!text || text.length > 2_000_000) return undefined;
    try { return JSON.parse(text); } catch { return undefined; }
  };
  function publish(path: string, method: string, status: number, request: unknown, response: unknown, error?: string) {
    const payload = object(request);
    const result = object(response);
    let safeRequest: unknown;
    let safeResponse: unknown;
    if (path.includes('/submit')) {
      safeRequest = payload ? { lang: payload.lang, typed_code: payload.typed_code, question_id: payload.question_id } : undefined;
      safeResponse = result ? { submission_id: result.submission_id } : undefined;
    } else if (path.includes('/check')) {
      safeResponse = result ? {
        submission_id: result.submission_id, state: result.state, status_code: result.status_code,
        status_msg: result.status_msg, status_runtime: result.status_runtime,
        status_memory: result.status_memory, question_id: result.question_id,
      } : undefined;
    } else {
      const question = object(object(result?.data)?.question);
      if (!question) return; // Ignore unrelated GraphQL responses and user data.
      safeResponse = { data: { question: {
        questionFrontendId: question.questionFrontendId, questionId: question.questionId,
        title: question.title, titleSlug: question.titleSlug, difficulty: question.difficulty,
      } } };
    }
    const record: NetworkRecord = {
      id: `${session}:${++sequence}`, path, method, status,
      ...(safeRequest === undefined ? {} : { request: safeRequest }),
      ...(safeResponse === undefined ? {} : { response: safeResponse }),
      ...(error ? { error } : {}),
    };
    history.push({ record, at: Date.now() });
    while (history.length > 30 || history[0]?.at < Date.now() - 15 * 60_000) history.shift();
    target.postMessage({ source, type: 'NETWORK', record }, origin);
  }
  const fetchWrapper: typeof fetch = function(input, init) {
    let path: string | undefined;
    let method = 'GET';
    let body: Promise<string> = Promise.resolve('');
    try {
      path = route(input instanceof target.Request ? input.url : String(input));
      if (path) {
        method = (init?.method ?? (input instanceof target.Request ? input.method : 'GET')).toUpperCase();
        // Clone before originalFetch consumes a Request body.
        body = typeof init?.body === 'string' ? Promise.resolve(init.body)
          : input instanceof target.Request && init?.body === undefined ? input.clone().text() : Promise.resolve('');
        body = body.catch(() => '');
      }
    } catch { path = undefined; }
    const pending = originalFetch.call(target, input, init);
    if (path) {
      const observedPath = path;
      void Promise.all([body, pending.then(async response => ({
        status: response.status, value: parse(await response.clone().text()),
      }))]).then(([text, response]) => {
        publish(observedPath, method, response.status, parse(text), response.value);
      }).catch(() => {
        if (!observedPath.includes('graphql')) publish(observedPath, method, 0, undefined, undefined, 'LeetCode 요청을 읽지 못했습니다. 네트워크 상태를 확인하세요.');
      });
    }
    return pending;
  };
  target.fetch = fetchWrapper;
  prototype.open = function(method: string, url: string | URL, async: boolean = true, username?: string | null, password?: string | null) {
    requests.delete(this);
    try { const path = route(String(url)); if (path) requests.set(this, { path, method: method.toUpperCase() }); } catch { /* Unrelated URL. */ }
    originalOpen.call(this, method, url, async, username, password);
  };
  prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
    const info = requests.get(this);
    if (info) {
      const request = typeof body === 'string' ? parse(body) : undefined;
      this.addEventListener('loadend', () => {
        let response: unknown;
        try { response = this.responseType === 'json' ? this.response : parse(this.responseText); }
        catch { /* Binary/non-JSON response is rejected by the adapter. */ }
        publish(info.path, info.method, this.status, request, response,
          this.status === 0 ? 'LeetCode 요청 실패. 네트워크 상태를 확인하세요.' : undefined);
      }, { once: true });
    }
    originalSend.call(this, body);
  };
  function replay(event: MessageEvent) {
    if (event.source !== target || event.origin !== origin || event.data?.source !== source || event.data?.type !== 'REPLAY') return;
    for (const item of history) {
      if (item.at >= Date.now() - 15 * 60_000) target.postMessage({ source, type: 'NETWORK', record: item.record }, origin);
    }
  }
  target.addEventListener('message', replay);
  return () => {
    if (target.fetch === fetchWrapper) target.fetch = originalFetch;
    prototype.open = originalOpen;
    prototype.send = originalSend;
    target.removeEventListener('message', replay);
    history.length = 0;
  };
}

if (typeof window !== 'undefined') installNetworkBridge(window);
