/* eslint-disable no-useless-assignment -- Intentional best-effort release of plaintext references. */
import { getExtensionSettings, respondToSettings } from './settings';
import { openWorkspace, isNewTab, WORKSPACE_URL } from './workspace';
import { ALLOWED_ORIGINS, API_ORIGIN } from './config';
import { matchesAuthorizedLocation as approvedLocation } from './destination';

type OpenService = { type: 'OPEN_SERVICE'; ticket: string; serviceId: string; targetUrl: string };
type AutofillResult = { status: 'filled_only' | 'filled_pending_challenge' | 'form_not_found' };

function validTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function waitForDestination(tabId: number, targetUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (matched: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve(matched);
    };
    const onUpdated = (
      updatedTabId: number,
      change: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (updatedTabId !== tabId || change.status !== 'complete') return;
      finish(approvedLocation(tab.url, targetUrl));
    };
    const onRemoved = (removedTabId: number) => {
      if (removedTabId === tabId) finish(false);
    };
    const timeout = setTimeout(() => finish(false), 15_000);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs.get(tabId).then(
      (tab) => {
        if (tab.status === 'complete') finish(approvedLocation(tab.url, targetUrl));
      },
      () => finish(false),
    );
  });
}

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
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    sendResponse({ status: 'error' });
    return;
  }
  if (respondToSettings(message, sendResponse)) return true;
  const input = message as Partial<OpenService>;
  if (
    input.type !== 'OPEN_SERVICE' ||
    typeof input.ticket !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.ticket) ||
    typeof input.serviceId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,50}$/.test(input.serviceId) ||
    typeof input.targetUrl !== 'string' ||
    !validTarget(input.targetUrl)
  ) {
    sendResponse({ status: 'error' });
    return;
  }
  void (async () => {
    let username = '';
    let password = '';
    let opened = false;
    try {
      const response = await fetch(`${API_ORIGIN}/api/vault/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ ticket: input.ticket, serviceId: input.serviceId }),
      });
      if (!response.ok) throw new Error('Exchange failed');
      let result: unknown = await response.json();
      if (
        typeof result !== 'object' ||
        result === null ||
        !('username' in result) ||
        typeof result.username !== 'string' ||
        !('password' in result) ||
        typeof result.password !== 'string' ||
        !('targetUrl' in result) ||
        typeof result.targetUrl !== 'string' ||
        result.targetUrl !== input.targetUrl ||
        !validTarget(result.targetUrl)
      )
        throw new Error('Invalid exchange response');
      const targetUrl = result.targetUrl;
      username = result.username;
      password = result.password;
      result = null;
      const tab = await chrome.tabs.create({ url: targetUrl });
      opened = true;
      if (tab.id === undefined || !(await waitForDestination(tab.id, targetUrl))) {
        sendResponse({ status: 'opened', autofill: false });
        return;
      }
      // Recheck immediately before injection; the content script checks location again before filling.
      const current = await chrome.tabs.get(tab.id);
      if (!approvedLocation(current.url, targetUrl)) {
        sendResponse({ status: 'opened', autofill: false });
        return;
      }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['autofill.js'] });
      const settings = await getExtensionSettings();
      const fill = (await chrome.tabs.sendMessage(tab.id, {
        type: 'HUBLINK_AUTOFILL',
        showToastNotifications: settings.showToastNotifications,
        targetUrl,
        username,
        password,
      })) as AutofillResult;
      sendResponse({
        status: 'opened',
        autofill: fill.status !== 'form_not_found',
        autofillResult: fill.status,
      });
    } catch {
      sendResponse(opened ? { status: 'opened', autofill: false } : { status: 'error' });
    } finally {
      // Releasing references does not wipe immutable JS strings or values already in the DOM.
      username = '';
      password = '';
    }
  })();
  return true;
});

chrome.runtime.onMessage?.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (respondToSettings(message, sendResponse)) return true;
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
