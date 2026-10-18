export const WORKSPACE_URL = 'http://127.0.0.1:5177';
export function isWorkspace(url: string | undefined): boolean {
  try {
    return [WORKSPACE_URL, 'http://localhost:5177'].includes(new URL(url ?? '').origin);
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
