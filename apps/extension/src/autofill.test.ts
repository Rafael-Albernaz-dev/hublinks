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

describe('extension settings and browser integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  async function worker() {
    vi.resetModules();
    const stored: Record<string, unknown> = {};
    const set = vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(stored, patch);
    });
    const get = vi.fn(async () => ({ ...stored }));
    let external: (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      response: (value: unknown) => void,
    ) => unknown = () => undefined;
    let internal = external;
    let startup: () => void = () => undefined;
    let created: (value: chrome.tabs.Tab) => void = () => undefined;
    const tab = (value: Partial<chrome.tabs.Tab>): chrome.tabs.Tab => ({
      index: 0,
      pinned: false,
      highlighted: false,
      windowId: 1,
      active: true,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      frozen: false,
      lastAccessed: 0,
      groupId: -1,
      ...value,
    });
    const query = vi.fn().mockResolvedValue([]),
      update = vi.fn().mockResolvedValue({}),
      create = vi.fn().mockResolvedValue({}),
      focus = vi.fn().mockResolvedValue({}),
      tabsGet = vi.fn().mockResolvedValue(tab({ id: 8, url: 'chrome://newtab/' }));
    const sendTabMessage = vi.fn().mockResolvedValue({ status: 'filled_only' });
    const executeScript = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      storage: { local: { get, set } },
      runtime: {
        id: 'test-id',
        getURL: (path: string) => `chrome-extension://test-id/${path}`,
        onMessageExternal: {
          addListener: (fn: typeof external) => {
            external = fn;
          },
        },
        onMessage: {
          addListener: (fn: typeof internal) => {
            internal = fn;
          },
        },
        onStartup: {
          addListener: (fn: typeof startup) => {
            startup = fn;
          },
        },
      },
      tabs: {
        query,
        update,
        create,
        get: tabsGet,
        sendMessage: sendTabMessage,
        onCreated: {
          addListener: (fn: typeof created) => {
            created = fn;
          },
        },
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      windows: { update: focus },
    });
    await import('./background');
    return {
      stored,
      set,
      get,
      external: (msg: unknown, sender = { url: 'http://127.0.0.1:5177/', tab: tab({ id: 1 }) }) =>
        new Promise<Record<string, unknown>>((resolve) =>
          external(msg, sender, (reply) => resolve(reply as Record<string, unknown>)),
        ),
      internal: (msg: unknown, sender: chrome.runtime.MessageSender) => {
        const response = vi.fn();
        internal(msg, sender, response);
        return response;
      },
      startup: () => startup(),
      created: (value: Partial<chrome.tabs.Tab>) => created(tab(value)),
      query,
      update,
      create,
      focus,
      tabsGet,
      sendTabMessage,
      executeScript,
    };
  }
  it('returns defaults and stores only validated boolean patches from authorized Hub messages', async () => {
    const w = await worker();
    expect((await w.external({ type: 'PING' })).settings).toEqual({
      openOnStartup: false,
      openOnNewTab: false,
      showToastNotifications: true,
    });
    expect(
      (await w.external({ type: 'UPDATE_EXTENSION_SETTINGS', settings: { openOnStartup: true } }))
        .status,
    ).toBe('ok');
    expect(w.stored).toEqual({ openOnStartup: true });
    for (const settings of [
      { password: 'synthetic' },
      { ticket: 'opaque' },
      { workspaceUrl: 'https://evil.test' },
      { shortcuts: [] },
      { openOnNewTab: 'true' },
      null,
    ])
      expect((await w.external({ type: 'UPDATE_SETTINGS', settings })).status).toBe('error');
    expect(w.set).toHaveBeenCalledTimes(1);
    expect(
      (
        await w.external(
          { type: 'GET_SETTINGS' },
          { url: 'https://evil.test', tab: {} as chrome.tabs.Tab },
        )
      ).status,
    ).toBe('error');
    expect(
      w.internal(
        { type: 'UPDATE_SETTINGS', settings: { openOnNewTab: true } },
        { id: 'test-id', url: 'https://example.test' },
      ),
    ).not.toHaveBeenCalled();
    const accepted = w.internal(
      { type: 'GET_SETTINGS' },
      { id: 'test-id', url: 'chrome-extension://test-id/popup.html' },
    );
    await vi.waitFor(() =>
      expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' })),
    );
  });
  it('opens or focuses the Workspace on startup only after explicit opt-in', async () => {
    const w = await worker();
    w.startup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(w.query).not.toHaveBeenCalled();
    w.stored.openOnStartup = true;
    w.startup();
    await vi.waitFor(() => expect(w.create).toHaveBeenCalledWith({ url: 'http://127.0.0.1:5177' }));
    w.query.mockResolvedValue([{ id: 4, windowId: 2, url: 'http://localhost:5177/' }]);
    w.startup();
    await vi.waitFor(() => expect(w.focus).toHaveBeenCalledWith(2, { focused: true }));
    expect(w.update).toHaveBeenCalledWith(4, { active: true });
    expect(w.create).toHaveBeenCalledTimes(1);
  });
  it('redirects opted-in new tabs but preserves explicit destinations and racing navigations', async () => {
    const w = await worker();
    w.created({ id: 8, url: 'chrome://newtab/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(w.update).not.toHaveBeenCalled();
    w.stored.openOnNewTab = true;
    w.created({ id: 8, pendingUrl: 'chrome://newtab/' });
    await vi.waitFor(() =>
      expect(w.update).toHaveBeenCalledWith(8, { url: 'http://127.0.0.1:5177' }),
    );
    w.update.mockClear();
    w.created({ id: 8, url: 'chrome://newtab/', pendingUrl: 'https://example.test' });
    w.created({ id: 8, url: 'about:blank' });
    w.created({ url: 'chrome://newtab/' });
    w.tabsGet.mockResolvedValue({ id: 8, url: 'https://example.test' });
    w.created({ id: 8, url: 'chrome://newtab/' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(w.update).not.toHaveBeenCalled();
  });
  it('preserves ticket exchange and destination checks while passing notification preferences transiently', async () => {
    const w = await worker();
    w.stored.showToastNotifications = false;
    w.create.mockResolvedValue({ id: 8 });
    w.tabsGet.mockResolvedValue({ id: 8, status: 'complete', url: 'https://example.test/login' });
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          username: creds.username,
          password: creds.password,
          targetUrl: 'https://example.test/login',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchFn);
    const message = {
      type: 'OPEN_SERVICE',
      ticket: 'a'.repeat(43),
      serviceId: 'synthetic',
      targetUrl: 'https://example.test/login',
    };
    expect((await w.external(message)).status).toBe('opened');
    expect(w.sendTabMessage).toHaveBeenCalledWith(
      8,
      expect.objectContaining({
        type: 'HUBLINK_AUTOFILL',
        showToastNotifications: false,
        targetUrl: message.targetUrl,
      }),
    );
    expect(w.set).not.toHaveBeenCalled();
    expect(w.stored).toEqual({ showToastNotifications: false });
    w.create.mockClear();
    fetchFn.mockResolvedValue(
      new Response(JSON.stringify({ ...creds, targetUrl: 'https://other.example.test/' })),
    );
    expect((await w.external(message)).status).toBe('error');
    expect(w.create).not.toHaveBeenCalled();
    expect(
      (await w.external(message, { url: 'https://evil.test', tab: {} as chrome.tabs.Tab })).status,
    ).toBe('error');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('suppresses visual toasts while preserving human challenge results and manual submit', async () => {
    const { waitForAndExecuteAutofill } = await import('./autofill');
    document.body.innerHTML =
      '<form><input name="username"><input type="password"><input autocomplete="one-time-code"><button>Entrar</button></form>';
    const click = vi.spyOn(document.querySelector('button')!, 'click');
    expect((await waitForAndExecuteAutofill(document, creds, 100, () => true, false)).status).toBe(
      'filled_pending_challenge',
    );
    expect(document.getElementById('hublink-autofill-toast')).toBeNull();
    expect(click).not.toHaveBeenCalled();
  });
});

describe('rich popup controls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const markup =
    '<div id="api-status"></div><p id="tab-status"></p><button id="open-hublink"></button><button id="copy-workspace"></button><input type="checkbox" id="opt-startup"><input type="checkbox" id="opt-newtab"><input type="checkbox" id="opt-notifications"><div id="popup-notice"></div><div id="quick-shortcuts"></div>';
  it('persists each toggle through the worker, copies the URL and lists only authenticated safe links', async () => {
    const { initPopup } = await import('./popup');
    document.body.innerHTML = markup;
    const settings = { openOnStartup: false, openOnNewTab: false, showToastNotifications: true };
    const sendMessage = vi.fn(async (msg: { type: string; settings?: object }) => {
      Object.assign(settings, msg.settings);
      return { status: 'ok', settings: { ...settings } };
    });
    const create = vi.fn().mockResolvedValue({}),
      query = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('chrome', { runtime: { sendMessage }, tabs: { create, query } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith('/health')
              ? { status: 'ok' }
              : {
                  services: [
                    {
                      name: 'Public sheet',
                      targetUrl: 'https://example.test/sheet',
                      credentialType: 'none',
                      hasAction: true,
                    },
                    {
                      name: 'Protected service',
                      targetUrl: 'https://example.test/login',
                      credentialType: 'shared',
                      hasAction: true,
                    },
                    {
                      name: 'Unsafe',
                      targetUrl: 'javascript:alert(1)',
                      credentialType: 'none',
                      hasAction: true,
                    },
                  ],
                },
          ),
        ),
    );
    await initPopup(document, fetchFn);
    for (const [id, key, value] of [
      ['opt-startup', 'openOnStartup', true],
      ['opt-newtab', 'openOnNewTab', true],
      ['opt-notifications', 'showToastNotifications', false],
    ] as const) {
      document.getElementById(id)!.click();
      await vi.waitFor(() =>
        expect(sendMessage).toHaveBeenCalledWith({
          type: 'UPDATE_SETTINGS',
          settings: { [key]: value },
        }),
      );
      expect(settings[key]).toBe(value);
    }
    document.getElementById('copy-workspace')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:5177'));
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:3177/api/catalog',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
    const shortcuts = document.querySelectorAll<HTMLButtonElement>('#quick-shortcuts button');
    expect(shortcuts).toHaveLength(2);
    shortcuts[0]!.click();
    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith({ url: 'https://example.test/sheet' }),
    );
    shortcuts[1]!.click();
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith({ url: 'http://127.0.0.1:5177' }));
  });
  it('reverts failed saves and does not show a stale catalog after an unauthorized response', async () => {
    const { initPopup } = await import('./popup');
    document.body.innerHTML = markup;
    const sendMessage = vi.fn(async (msg: { type: string }) =>
      msg.type === 'GET_SETTINGS'
        ? {
            status: 'ok',
            settings: { openOnStartup: false, openOnNewTab: false, showToastNotifications: true },
          }
        : { status: 'error' },
    );
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      tabs: { query: vi.fn().mockResolvedValue([]) },
    });
    await initPopup(
      document,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 })),
    );
    document.getElementById('opt-startup')!.click();
    await vi.waitFor(() =>
      expect(document.getElementById('popup-notice')!.textContent).toContain(
        'Não foi possível salvar',
      ),
    );
    expect((document.getElementById('opt-startup') as HTMLInputElement).checked).toBe(false);
    expect(document.querySelectorAll('#quick-shortcuts button')).toHaveLength(0);
  });
});
