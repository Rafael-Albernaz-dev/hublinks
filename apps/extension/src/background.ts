/* eslint-disable no-useless-assignment -- Intentional best-effort release of plaintext references. */
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:5177', 'http://localhost:5177']);
const API_ORIGIN = 'http://127.0.0.1:3177';

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

function approvedLocation(actual: string | undefined, target: string): boolean {
  if (!actual) return false;
  try {
    const current = new URL(actual);
    const approved = new URL(target);
    return (
      current.protocol === 'https:' &&
      current.origin === approved.origin &&
      current.href.startsWith(approved.href)
    );
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
  if (message.type === 'PING') {
    sendResponse({ status: 'ok', version: '0.1.0' });
    return;
  }
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
      const fill = (await chrome.tabs.sendMessage(tab.id, {
        type: 'HUBLINK_AUTOFILL',
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
