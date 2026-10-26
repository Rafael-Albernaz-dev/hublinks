import { ALLOWED_ORIGINS, WORKSPACE_URL } from './config';
export { WORKSPACE_URL } from './config';
export function isWorkspace(url: string | undefined): boolean {
  try {
    return ALLOWED_ORIGINS.has(new URL(url ?? '').origin);
  } catch {
    return false;
  }
}
export async function openWorkspace(): Promise<void> {
  const existing = (await chrome.tabs.query({})).find((tab) =>
    isWorkspace(tab.pendingUrl ?? tab.url),
  );
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (typeof chrome.windows?.update === 'function')
      await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url: WORKSPACE_URL });
}
export function isNewTab(tab: { pendingUrl?: string; url?: string }): boolean {
  // Prefer an explicit pending destination; never hijack about:blank popups or navigations.
  return ['chrome://newtab/', 'chrome://new-tab-page/'].includes(tab.pendingUrl ?? tab.url ?? '');
}
