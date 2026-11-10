/* eslint-disable no-useless-assignment -- Intentional best-effort release of plaintext references. */
import { matchesAuthorizedLocation } from './destination';
import { findIdentifierStep, findLoginFields, inputRoots, usable } from './loginFields';
export { matchesAuthorizedLocation } from './destination';
export { findLoginFields } from './loginFields';
export interface AutofillCredentials {
  username: string;
  password: string;
}

export type AutofillStatus =
  'filled_only' | 'filled_username_only' | 'filled_pending_challenge' | 'form_not_found';

export interface AutofillResult {
  status: AutofillStatus;
  challengeDetected?: 'recaptcha' | 'turnstile' | 'hcaptcha' | '2fa';
}

type Challenge = NonNullable<AutofillResult['challengeDetected']>;

export function fillNativeInput(input: HTMLInputElement, value: string): void {
  input.focus();
  const descriptor = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView?.HTMLInputElement.prototype ?? HTMLInputElement.prototype,
    'value',
  );
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  if ((descriptor?.get?.call(input) ?? input.value) !== value)
    throw new Error('Input rejected the value');
  const InputEvent = input.ownerDocument.defaultView?.Event ?? Event;
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  input.dispatchEvent(new InputEvent('change', { bubbles: true }));
}

export function detectHumanChallenge(doc: Document): Challenge | null {
  for (const root of inputRoots(doc)) {
    if (root.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]'))
      return 'turnstile';
    if (root.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]')) return 'hcaptcha';
    if (
      root.querySelector(
        '.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]',
      )
    )
      return 'recaptcha';
    if (
      Array.from(
        root.querySelectorAll<HTMLInputElement>(
          'input[autocomplete="one-time-code"], input[name*="2fa" i], input[name*="otp" i], input[id*="otp" i]',
        ),
      ).some(usable)
    )
      return '2fa';
  }
  return null;
}

export function executeAutofill(doc: Document, creds: AutofillCredentials): AutofillResult {
  const { usernameInput, passwordInput } = findLoginFields(doc);
  if (!usernameInput || !passwordInput) return { status: 'form_not_found' };
  fillNativeInput(usernameInput, creds.username);
  fillNativeInput(passwordInput, creds.password);
  passwordInput.focus();
  const challenge = detectHumanChallenge(doc);
  if (challenge) return { status: 'filled_pending_challenge', challengeDetected: challenge };
  return { status: 'filled_only' };
}

export function renderAutofillToast(doc: Document, result: AutofillResult): HTMLElement | null {
  if (result.status === 'form_not_found') return null;
  doc.getElementById('hublink-autofill-toast')?.remove();
  const toast = doc.createElement('div');
  toast.id = 'hublink-autofill-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.dataset.hublinkToast = result.status;
  toast.style.cssText =
    'position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: 340px; padding: 12px 14px; border-radius: 10px; background: #18181b; color: #fafafa; font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.25); display: flex; gap: 10px; align-items: start;';
  const text = doc.createElement('span');
  text.textContent =
    result.status === 'filled_username_only'
      ? 'Hublink: usuário preenchido. Continue a autenticação no destino.'
      : result.status === 'filled_only'
        ? 'Hublink: credenciais preenchidas. Confira os dados e clique em Entrar.'
        : `Hublink: credenciais preenchidas. Conclua a verificação humana (${result.challengeDetected ?? '2FA/CAPTCHA'}) e envie o formulário.`;
  const close = doc.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar aviso do Hublink');
  close.textContent = '×';
  close.style.cssText =
    'background: transparent; color: inherit; border: 0; cursor: pointer; font: inherit; padding: 0 4px;';
  close.addEventListener('click', () => toast.remove());
  toast.append(text, close);
  (doc.body ?? doc.documentElement).append(toast);
  return toast;
}

export function waitForAndExecuteAutofill(
  doc: Document,
  creds: AutofillCredentials,
  timeoutMs = 10_000,
  isAuthorized: () => boolean = () => true,
  showNotifications = true,
): Promise<AutofillResult> {
  return new Promise((resolve) => {
    let observer: MutationObserver | undefined = undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
    let poll: ReturnType<typeof setInterval> | undefined = undefined;
    let identifier: HTMLInputElement | null = null;
    const observed = new Set<Node>();
    let done = false;
    const finish = (result: AutofillResult) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      clearTimeout(timeout);
      clearInterval(poll);
      identifier?.removeEventListener('input', onIdentifierInput);
      if (showNotifications) renderAutofillToast(doc, result);
      resolve(result);
    };
    const onIdentifierInput = () => {
      if (identifier?.value !== creds.username) finish({ status: 'form_not_found' });
    };
    const attempt = () => {
      if (done) return;
      try {
        if (!isAuthorized()) {
          finish({ status: 'form_not_found' });
          return;
        }
        const fields = findLoginFields(doc, identifier !== null);
        if (fields.passwordInput && (fields.usernameInput || identifier)) {
          if (fields.usernameInput && fields.usernameInput !== identifier)
            fillNativeInput(fields.usernameInput, creds.username);
          fillNativeInput(fields.passwordInput, creds.password);
          const challenge = detectHumanChallenge(doc);
          finish(
            challenge
              ? { status: 'filled_pending_challenge', challengeDetected: challenge }
              : { status: 'filled_only' },
          );
        } else if (!identifier) {
          const field = findIdentifierStep(doc);
          if (field) {
            fillNativeInput(field, creds.username);
            identifier = field;
            identifier.addEventListener('input', onIdentifierInput);
          }
        }
        if (!done && observer)
          for (const root of inputRoots(doc)) {
            const node = root === doc ? (doc.body ?? doc.documentElement) : root;
            if (!observed.has(node)) {
              observer.observe(node, { childList: true, subtree: true, attributes: true });
              observed.add(node);
            }
          }
      } catch {
        finish({ status: 'form_not_found' });
      }
    };
    attempt();
    if (done) return;
    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
    observer = new Observer(attempt);
    attempt();
    if (done) return;
    poll = setInterval(attempt, 200);
    timeout = setTimeout(
      () => finish({ status: identifier ? 'filled_username_only' : 'form_not_found' }),
      timeoutMs,
    );
  });
}

type FillMessage = AutofillCredentials & {
  type: 'HUBLINK_AUTOFILL';
  targetUrl: string;
  showToastNotifications?: boolean;
};

// The bundled file is injected only after a single user-initiated ticket exchange.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (result: AutofillResult) => void,
  ) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return;
    if (message.type !== 'HUBLINK_AUTOFILL') return;
    chrome.runtime.onMessage.removeListener(listener);
    void (async () => {
      let username = '';
      let password = '';
      const creds: AutofillCredentials = { username: '', password: '' };
      try {
        const input = message as Partial<FillMessage>;
        if (
          typeof input.username !== 'string' ||
          typeof input.password !== 'string' ||
          typeof input.targetUrl !== 'string' ||
          !matchesAuthorizedLocation(location.href, input.targetUrl)
        ) {
          sendResponse({ status: 'form_not_found' });
          return;
        }
        const targetUrl = input.targetUrl;
        username = input.username;
        password = input.password;
        input.username = '';
        input.password = '';
        creds.username = username;
        creds.password = password;
        sendResponse(
          await waitForAndExecuteAutofill(
            document,
            creds,
            10_000,
            () => matchesAuthorizedLocation(location.href, targetUrl),
            input.showToastNotifications !== false,
          ),
        );
      } catch {
        sendResponse({ status: 'form_not_found' });
      } finally {
        // JS strings and destination DOM values cannot be securely zeroed.
        username = '';
        password = '';
        creds.username = '';
        creds.password = '';
      }
    })();
    return true;
  };
  chrome.runtime.onMessage.addListener(listener);
}
