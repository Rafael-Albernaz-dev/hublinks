/* eslint-disable no-useless-assignment -- Intentional best-effort release of plaintext references. */
export interface AutofillCredentials {
  username: string;
  password: string;
}

export type AutofillStatus = 'filled_only' | 'filled_pending_challenge' | 'form_not_found';

export interface AutofillResult {
  status: AutofillStatus;
  challengeDetected?: 'recaptcha' | 'turnstile' | 'hcaptcha' | '2fa';
}

type Challenge = NonNullable<AutofillResult['challengeDetected']>;

function usable(input: HTMLInputElement): boolean {
  if (!input.isConnected || input.disabled || input.readOnly) return false;
  for (let element: Element | null = input; element; element = element.parentElement) {
    if (element.hasAttribute('hidden') || element.hasAttribute('inert')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}

export function fillNativeInput(input: HTMLInputElement, value: string): void {
  input.focus();
  const descriptor = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView?.HTMLInputElement.prototype ?? HTMLInputElement.prototype,
    'value',
  );
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  const InputEvent = input.ownerDocument.defaultView?.Event ?? Event;
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  input.dispatchEvent(new InputEvent('change', { bubbles: true }));
}

export function detectHumanChallenge(doc: Document): Challenge | null {
  if (doc.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]'))
    return 'turnstile';
  if (doc.querySelector('.h-captcha, iframe[src*="hcaptcha.com"]')) return 'hcaptcha';
  if (
    doc.querySelector('.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"]')
  )
    return 'recaptcha';
  if (
    Array.from(
      doc.querySelectorAll<HTMLInputElement>(
        'input[autocomplete="one-time-code"], input[name*="2fa" i], input[name*="otp" i], input[id*="otp" i]',
      ),
    ).some(usable)
  )
    return '2fa';
  return null;
}

export function findLoginFields(doc: Document): {
  usernameInput: HTMLInputElement | null;
  passwordInput: HTMLInputElement | null;
} {
  const passwordInputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>('input[type="password"]'),
  ).filter(usable);
  // Multiple password fields usually indicate registration or password change.
  if (passwordInputs.length !== 1) return { usernameInput: null, passwordInput: null };
  const passwordInput = passwordInputs[0] ?? null;
  if (!passwordInput) return { usernameInput: null, passwordInput: null };
  const passwordHint = `${passwordInput.name} ${passwordInput.id} ${passwordInput.autocomplete}`;
  if (/new-password|confirm|repeat|retype|nova.?senha/i.test(passwordHint))
    return { usernameInput: null, passwordInput: null };

  const scope =
    passwordInput.form ??
    passwordInput.closest('[role="form"]') ??
    passwordInput.parentElement?.parentElement;
  if (!scope) return { usernameInput: null, passwordInput: null };
  const inputs = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="email"], input:not([type])',
    ),
  ).filter(usable);
  const beforePassword = inputs.filter(
    (input) => !!(input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  const usernameInput =
    beforePassword.find((input) => input.autocomplete.toLowerCase() === 'username') ??
    beforePassword.find((input) => input.type === 'email') ??
    beforePassword.find((input) =>
      /user|email|login|cpf|usuario|usuário|identificador|matricula|matrícula|conta/i.test(
        `${input.name} ${input.id} ${input.placeholder}`,
      ),
    ) ??
    beforePassword.at(-1) ??
    null;
  return { usernameInput, passwordInput };
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
    result.status === 'filled_only'
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
  timeoutMs = 4000,
  isAuthorized: () => boolean = () => true,
): Promise<AutofillResult> {
  return new Promise((resolve) => {
    let observer: MutationObserver | undefined = undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
    let done = false;
    const finish = (result: AutofillResult) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      clearTimeout(timeout);
      renderAutofillToast(doc, result);
      resolve(result);
    };
    const attempt = () => {
      if (done) return;
      try {
        if (!isAuthorized()) {
          finish({ status: 'form_not_found' });
          return;
        }
        const result = executeAutofill(doc, creds);
        if (result.status !== 'form_not_found') finish(result);
      } catch {
        finish({ status: 'form_not_found' });
      }
    };
    attempt();
    if (done) return;
    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
    observer = new Observer(attempt);
    observer.observe(doc.body ?? doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'type',
        'hidden',
        'disabled',
        'readonly',
        'style',
        'class',
        'aria-hidden',
        'inert',
      ],
    });
    timeout = setTimeout(() => finish({ status: 'form_not_found' }), timeoutMs);
  });
}

type FillMessage = AutofillCredentials & { type: 'HUBLINK_AUTOFILL'; targetUrl: string };

export function matchesAuthorizedLocation(actual: string, target: string): boolean {
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
          await waitForAndExecuteAutofill(document, creds, 4000, () =>
            matchesAuthorizedLocation(location.href, targetUrl),
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
