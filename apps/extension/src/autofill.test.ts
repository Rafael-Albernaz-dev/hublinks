import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectHumanChallenge,
  executeAutofill,
  fillNativeInput,
  matchesAuthorizedLocation,
} from './autofill';

const creds = { username: 'synthetic.user', password: 'synthetic-password' };

afterEach(() => {
  document.body.replaceChildren();
});

describe('universal assisted autofill', () => {
  it('fills a standard login reactively without clicking submit', () => {
    document.body.innerHTML =
      '<form><input name="usuario"><input type="password" name="password"><button type="submit">Enter</button></form>';
    const username = document.querySelector<HTMLInputElement>('input[name="usuario"]')!;
    const password = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    const button = document.querySelector<HTMLButtonElement>('button')!;
    const click = vi.spyOn(button, 'click');
    const events: string[] = [];
    for (const input of [username, password]) {
      input.addEventListener('input', () => events.push(`${input.name}:input`));
      input.addEventListener('change', () => events.push(`${input.name}:change`));
    }

    expect(executeAutofill(document, creds)).toEqual({ status: 'filled_only' });
    expect(username.value).toBe(creds.username);
    expect(password.value).toBe(creds.password);
    expect(events).toEqual([
      'usuario:input',
      'usuario:change',
      'password:input',
      'password:change',
    ]);
    expect(document.activeElement).toBe(password);
    expect(click).not.toHaveBeenCalled();
  });

  it('uses the native setter when a framework tracks the input instance', () => {
    document.body.innerHTML = '<input type="email">';
    const input = document.querySelector('input')!;
    const ownSetter = vi.fn();
    Object.defineProperty(input, 'value', { configurable: true, set: ownSetter });
    fillNativeInput(input, 'synthetic@example.test');
    expect(ownSetter).not.toHaveBeenCalled();
    expect(input.getAttribute('value')).toBeNull();
    expect(
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.get?.call(input),
    ).toBe('synthetic@example.test');
  });

  it('prefers autocomplete=username and supports email fields', () => {
    document.body.innerHTML =
      '<form><input type="text" name="search"><input type="email" autocomplete="username"><input type="password"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'filled_only' });
    expect(document.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe(
      creds.username,
    );
    expect(document.querySelector<HTMLInputElement>('input[name="search"]')?.value).toBe('');
  });

  it('fails closed on missing, hidden, or ambiguous login fields', () => {
    document.body.innerHTML = '<form><input name="username"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    document.body.innerHTML = '<form><input type="password"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    document.body.innerHTML =
      '<form><input name="username"><input type="password" style="display:none"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
    document.body.innerHTML =
      '<form><input name="username"><input type="password"><input type="password" name="confirm"></form>';
    expect(executeAutofill(document, creds)).toEqual({ status: 'form_not_found' });
  });

  it.each([
    ['recaptcha', '<div class="g-recaptcha"></div>'],
    ['turnstile', '<div class="cf-turnstile"></div>'],
    ['hcaptcha', '<iframe src="https://hcaptcha.com/1/api.js"></iframe>'],
    ['2fa', '<input autocomplete="one-time-code">'],
  ] as const)('fills and pauses for %s', (challenge, markup) => {
    document.body.innerHTML = `<form><input name="username"><input type="password"><button type="submit">Sign in</button>${markup}</form>`;
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    expect(detectHumanChallenge(document)).toBe(challenge);
    expect(executeAutofill(document, creds)).toEqual({
      status: 'filled_pending_challenge',
      challengeDetected: challenge,
    });
    expect(click).not.toHaveBeenCalled();
  });

  it('rejects a redirect to a different HTTPS origin with a matching text prefix', () => {
    expect(
      matchesAuthorizedLocation(
        'https://portal.example.test/login',
        'https://portal.example.test/login',
      ),
    ).toBe(true);
    expect(
      matchesAuthorizedLocation(
        'https://portal.example.test.evil.test/login',
        'https://portal.example.test/login',
      ),
    ).toBe(false);
    expect(
      matchesAuthorizedLocation(
        'https://other.example.test/login',
        'https://portal.example.test/login',
      ),
    ).toBe(false);
  });
});

describe('bounded SPA waiting and feedback', () => {
  it('fills a delayed SPA form and disconnects after the first fill', async () => {
    const { waitForAndExecuteAutofill } = await import('./autofill');
    const pending = waitForAndExecuteAutofill(document, creds, 200);
    setTimeout(() => {
      document.body.innerHTML =
        '<form><input name="username"><input type="password"><button type="submit">Enter</button></form>';
    }, 5);
    expect(await pending).toEqual({ status: 'filled_only' });
    const password = document.querySelector<HTMLInputElement>('input[type="password"]')!;
    expect(password.value).toBe(creds.password);
    password.value = 'human-edit';
    document.body.append(document.createElement('div'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(password.value).toBe('human-edit');
    expect(document.querySelectorAll('#hublink-autofill-toast')).toHaveLength(1);
  });

  it('times out without filling and ignores forms added after timeout', async () => {
    const { waitForAndExecuteAutofill } = await import('./autofill');
    expect(await waitForAndExecuteAutofill(document, creds, 5)).toEqual({
      status: 'form_not_found',
    });
    document.body.innerHTML = '<form><input name="username"><input type="password"></form>';
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('');
    expect(document.getElementById('hublink-autofill-toast')).toBeNull();
  });

  it('rechecks authorization before filling a form inserted after SPA navigation', async () => {
    const { waitForAndExecuteAutofill } = await import('./autofill');
    let authorized = true;
    const pending = waitForAndExecuteAutofill(document, creds, 200, () => authorized);
    authorized = false;
    document.body.innerHTML = '<form><input name="username"><input type="password"></form>';
    expect(await pending).toEqual({ status: 'form_not_found' });
    expect(document.querySelector<HTMLInputElement>('input')?.value).toBe('');
  });

  it('reacts when an existing form becomes usable', async () => {
    const { waitForAndExecuteAutofill } = await import('./autofill');
    document.body.innerHTML = '<form hidden><input name="username"><input type="password"></form>';
    const pending = waitForAndExecuteAutofill(document, creds, 200);
    document.querySelector('form')!.hidden = false;
    expect(await pending).toEqual({ status: 'filled_only' });
  });

  it('renders accessible guidance, replaces old notices, omits secrets, and closes on demand', async () => {
    const { renderAutofillToast } = await import('./autofill');
    expect(renderAutofillToast(document, { status: 'form_not_found' })).toBeNull();
    const plain = renderAutofillToast(document, { status: 'filled_only' })!;
    expect(plain.textContent).toContain('Confira os dados e clique em Entrar.');
    expect(plain.getAttribute('role')).toBe('status');
    expect(plain.getAttribute('aria-live')).toBe('polite');
    const challenge = renderAutofillToast(document, {
      status: 'filled_pending_challenge',
      challengeDetected: 'turnstile',
    })!;
    expect(plain.isConnected).toBe(false);
    expect(challenge.textContent).toContain('Conclua a verificação humana (turnstile)');
    expect(challenge.dataset.hublinkToast).toBe('filled_pending_challenge');
    expect(challenge.textContent).not.toContain(creds.username);
    expect(challenge.textContent).not.toContain(creds.password);
    challenge.querySelector('button')!.click();
    expect(challenge.isConnected).toBe(false);
    expect(
      renderAutofillToast(document, { status: 'filled_pending_challenge' })!.textContent,
    ).toContain('2FA/CAPTCHA');
  });
});

describe('toolbar popup', () => {
  afterEach(() => vi.unstubAllGlobals());
  const markup =
    '<div id="api-status"></div><p id="tab-status"></p><button id="open-hublink">Open</button>';

  it('shows connectivity and opens the Workspace when no existing tab is found', async () => {
    const { initPopup } = await import('./popup');
    document.body.innerHTML = markup;
    const query = vi.fn().mockResolvedValue([{ url: 'https://example.test/' }]);
    const create = vi.fn().mockResolvedValue({});
    vi.stubGlobal('chrome', { tabs: { query, create } });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })));
    await initPopup(document, fetchFn);
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:3177/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(document.getElementById('api-status')?.dataset.state).toBe('online');
    expect(document.getElementById('api-status')?.textContent).toBe('API local conectada');
    expect(document.getElementById('tab-status')?.textContent).toContain('Página HTTPS ativa');
    document.getElementById('open-hublink')!.click();
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ url: 'http://127.0.0.1:5177' }));
  });

  it('shows offline and focuses an existing local Workspace and its window', async () => {
    const { initPopup } = await import('./popup');
    document.body.innerHTML = markup;
    const query = vi
      .fn()
      .mockResolvedValue([{ id: 7, windowId: 3, url: 'http://localhost:5177/' }]);
    const update = vi.fn().mockResolvedValue({});
    const focus = vi.fn().mockResolvedValue({});
    const create = vi.fn();
    vi.stubGlobal('chrome', { tabs: { query, update, create }, windows: { update: focus } });
    await initPopup(document, vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
    expect(document.getElementById('api-status')?.dataset.state).toBe('offline');
    expect(document.getElementById('api-status')?.textContent).toBe('API local indisponível');
    expect(document.getElementById('tab-status')?.textContent).toContain('Você está no Hublink');
    document.getElementById('open-hublink')!.click();
    await vi.waitFor(() => expect(focus).toHaveBeenCalledWith(3, { focused: true }));
    expect(update).toHaveBeenCalledWith(7, { active: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('handles missing Chrome APIs and non-OK health responses', async () => {
    const { initPopup } = await import('./popup');
    document.body.innerHTML = markup;
    vi.stubGlobal('chrome', undefined);
    await initPopup(
      document,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })),
    );
    expect(document.getElementById('api-status')?.dataset.state).toBe('offline');
    expect(document.getElementById('tab-status')?.textContent).toContain('Abra o Workspace');
  });
});
