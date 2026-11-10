/* eslint-disable no-useless-assignment -- Best-effort release of transient plaintext. */
import { API_ORIGIN } from './config';
import { matchesAuthorizedLocation } from './destination';
import { getExtensionSettings } from './settings';
import type { AutofillResult } from './autofill';

export type OpenService = {
  type: 'OPEN_SERVICE';
  ticket: string;
  serviceId: string;
  targetUrl: string;
};
export type OpeningResult = {
  status: 'opened' | 'error' | 'busy';
  autofill?: boolean;
  autofillResult?: AutofillResult['status'];
  reason?: 'session_required' | 'credential_missing' | 'service_unavailable';
};

export function validTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validServiceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(value);
}

export function validOpening(value: unknown): value is OpenService {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<OpenService>;
  return (
    input.type === 'OPEN_SERVICE' &&
    typeof input.ticket === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(input.ticket) &&
    validServiceId(input.serviceId) &&
    typeof input.targetUrl === 'string' &&
    validTarget(input.targetUrl)
  );
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
    const complete = (tab: chrome.tabs.Tab) => {
      if (tab.status === 'complete' && !(tab.pendingUrl && tab.pendingUrl !== tab.url))
        finish(matchesAuthorizedLocation(tab.url, targetUrl));
    };
    const onUpdated = (id: number, change: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (id === tabId && change.status === 'complete') complete({ ...tab, status: 'complete' });
    };
    const onRemoved = (id: number) => {
      if (id === tabId) finish(false);
    };
    const timeout = setTimeout(() => finish(false), 15_000);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs.get(tabId).then(complete, () => finish(false));
  });
}

const opening = new Set<string>();
export async function openOnce(
  serviceId: string,
  operation: () => Promise<OpeningResult>,
): Promise<OpeningResult> {
  if (opening.has(serviceId)) return { status: 'busy' };
  opening.add(serviceId);
  try {
    return await operation();
  } catch {
    return { status: 'error' };
  } finally {
    opening.delete(serviceId);
  }
}

export async function openTicket(input: OpenService): Promise<OpeningResult> {
  let username = '',
    password = '',
    opened = false;
  try {
    const response = await fetch(`${API_ORIGIN}/api/vault/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ ticket: input.ticket, serviceId: input.serviceId }),
    });
    if (!response.ok) return { status: 'error' };
    let result: unknown = await response.json();
    if (
      !result ||
      typeof result !== 'object' ||
      !('username' in result) ||
      typeof result.username !== 'string' ||
      !('password' in result) ||
      typeof result.password !== 'string' ||
      !('targetUrl' in result) ||
      result.targetUrl !== input.targetUrl ||
      !validTarget(input.targetUrl)
    )
      return { status: 'error' };
    const targetUrl = input.targetUrl;
    username = result.username;
    password = result.password;
    result = null;
    const tab = await chrome.tabs.create({ url: targetUrl });
    opened = true;
    if (tab.id === undefined || !(await waitForDestination(tab.id, targetUrl)))
      return { status: 'opened', autofill: false };
    const current = await chrome.tabs.get(tab.id);
    if (!matchesAuthorizedLocation(current.url, targetUrl))
      return { status: 'opened', autofill: false };
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['autofill.js'] });
    const settings = await getExtensionSettings();
    const fill: AutofillResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'HUBLINK_AUTOFILL',
      targetUrl,
      username,
      password,
      showToastNotifications: settings.showToastNotifications,
    });
    if (
      ![
        'filled_only',
        'filled_username_only',
        'filled_pending_challenge',
        'form_not_found',
      ].includes(fill?.status)
    )
      return { status: 'opened', autofill: false };
    return {
      status: 'opened',
      autofill: fill.status !== 'form_not_found',
      autofillResult: fill.status,
    };
  } catch {
    return opened ? { status: 'opened', autofill: false } : { status: 'error' };
  } finally {
    username = '';
    password = '';
  }
}

/** A popup supplies only an ID; re-read the authorized catalog and issue a fresh session-bound ticket. */
export async function openCatalogService(serviceId: string): Promise<OpeningResult> {
  const catalog = await fetch(`${API_ORIGIN}/api/catalog`, {
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!catalog.ok)
    return {
      status: 'error',
      reason: catalog.status === 401 ? 'session_required' : 'service_unavailable',
    };
  const body: {
    services?: Array<{
      id: string;
      targetUrl: string;
      hasAction: boolean;
      credentialType: string;
      hasCredential: boolean;
    }>;
  } = await catalog.json();
  const service = Array.isArray(body.services)
    ? body.services.find((item) => item.id === serviceId)
    : null;
  if (
    !service ||
    !service.hasAction ||
    typeof service.targetUrl !== 'string' ||
    !validTarget(service.targetUrl)
  )
    return { status: 'error', reason: 'service_unavailable' };
  if (service.credentialType === 'none') {
    await chrome.tabs.create({ url: service.targetUrl });
    return { status: 'opened' };
  }
  if (!['individual', 'shared'].includes(service.credentialType) || !service.hasCredential)
    return { status: 'error', reason: 'credential_missing' };
  const response = await fetch(`${API_ORIGIN}/api/vault/tickets`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId }),
  });
  if (!response.ok)
    return {
      status: 'error',
      reason: response.status === 401 ? 'session_required' : 'credential_missing',
    };
  const ticket: unknown = await response.json();
  const input = ticket && typeof ticket === 'object' ? { ...ticket, type: 'OPEN_SERVICE' } : null;
  if (
    !validOpening(input) ||
    input.serviceId !== serviceId ||
    input.targetUrl !== service.targetUrl
  )
    return { status: 'error', reason: 'service_unavailable' };
  return openTicket(input);
}
