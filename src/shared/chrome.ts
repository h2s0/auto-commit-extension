interface ChromeAPI {
 identity: {getRedirectURL(path?: string): string; launchWebAuthFlow(details:{url:string;interactive:boolean}):Promise<string | undefined>};
 storage: { onChanged: { addListener(callback: (changes: Record<string, {newValue?: unknown; oldValue?: unknown}>, area: string) => void): void }; local: { get(keys: string | string[]): Promise<Record<string, unknown>>; set(values: Record<string, unknown>): Promise<void>; remove(keys: string | string[]): Promise<void>; setAccessLevel(options: {accessLevel: 'TRUSTED_CONTEXTS'}): Promise<void> } };
 runtime: { getURL(path: string): string; sendMessage(message: unknown): Promise<any>; openOptionsPage(): Promise<void>; onMessage: {addListener(callback: (message: any, sender: {url?: string; tab?: {id?: number}}, respond: (response: unknown) => void) => boolean | void): void} };
 action: {setBadgeText(options: {text: string}): Promise<void>; setBadgeBackgroundColor(options: {color: string}): Promise<void>};
}
export const extension = (globalThis as unknown as {chrome: ChromeAPI}).chrome;
