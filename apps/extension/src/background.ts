import { getExtensionSettings, respondToSettings } from './settings';
import { openWorkspace, isNewTab, WORKSPACE_URL } from './workspace';
import { ALLOWED_ORIGINS } from './config';
import { openCatalogService, openOnce, openTicket, validOpening, validServiceId } from './opening';

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
  let origin: string;
  try {
    origin = new URL(sender.url ?? '').origin;
  } catch {
    sendResponse({ status: 'error' });
    return;
  }
  if (!ALLOWED_ORIGINS.has(origin) || !sender.tab) {
    sendResponse({ status: 'error' });
    return;
  }
  if (respondToSettings(message, sendResponse)) return true;
  if (!validOpening(message)) {
    sendResponse({ status: 'error' });
    return;
  }
  void openOnce(message.serviceId, () => openTicket(message)).then(sendResponse);
  return true;
});

chrome.runtime.onMessage?.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (respondToSettings(message, sendResponse)) return true;
  if (
    !message ||
    typeof message !== 'object' ||
    !('type' in message) ||
    message.type !== 'OPEN_CATALOG_SERVICE' ||
    !('serviceId' in message) ||
    !validServiceId(message.serviceId)
  ) {
    sendResponse({ status: 'error' });
    return;
  }
  const serviceId = message.serviceId;
  void openOnce(serviceId, () => openCatalogService(serviceId)).then(sendResponse);
  return true;
});
chrome.runtime.onStartup?.addListener(() => {
  void (async () => {
    if ((await getExtensionSettings()).openOnStartup) await openWorkspace();
  })().catch(() => undefined);
});
async function redirectNewTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !isNewTab(tab) || !(await getExtensionSettings()).openOnNewTab)
    return;
  // A user may already have typed a destination while storage was being read.
  const current = await chrome.tabs.get(tab.id);
  if (isNewTab(current)) await chrome.tabs.update(tab.id, { url: WORKSPACE_URL });
}
chrome.tabs.onCreated?.addListener((tab) => {
  void redirectNewTab(tab).catch(() => undefined);
});
// onCreated may arrive before Chrome exposes the initial URL.
chrome.tabs.onUpdated?.addListener((_id, change, tab) => {
  if (change.url && isNewTab({ url: change.url })) void redirectNewTab(tab).catch(() => undefined);
});
