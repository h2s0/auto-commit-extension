/** Sanitized page-network events. No cookies, request headers, or auth values. */
export interface NetworkRecord {
  id: string;
  path: string;
  method: string;
  status: number;
  request?: unknown;
  response?: unknown;
  error?: string;
}
export const BRIDGE_SOURCE = 'leetcode-github-sync-network-v1';
