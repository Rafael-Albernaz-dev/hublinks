import { DEFAULT_EXTENSION_SETTINGS } from './settings';
import type { ExtensionSettings } from './settings';
import { isWorkspace, openWorkspace, WORKSPACE_URL } from './workspace';

async function settingsMessage(
  type: string,
  settings?: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage)
    throw new Error('Extensão indisponível');
  const reply = (await chrome.runtime.sendMessage({ type, ...(settings ? { settings } : {}) })) as {
    status?: string;
    settings?: ExtensionSettings;
  };
  if (
    reply?.status !== 'ok' ||
    !reply.settings ||
    Object.keys(DEFAULT_EXTENSION_SETTINGS).some(
      (key) => typeof reply.settings?.[key as keyof ExtensionSettings] !== 'boolean',
    )
  )
    throw new Error('Opções indisponíveis');
  return reply.settings;
}
export async function initPopup(
  doc: Document = document,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const apiStatus = doc.getElementById('api-status'),
    tabStatus = doc.getElementById('tab-status');
  const tabs = typeof chrome !== 'undefined' ? chrome.tabs : undefined;
  const notice = (text: string) => {
    const node = doc.getElementById('popup-notice');
    if (node) node.textContent = text;
  };
  doc.getElementById('open-hublink')?.addEventListener('click', () => {
    if (!tabs?.query) return;
    void openWorkspace().catch(() => {
      if (tabStatus) tabStatus.textContent = 'Não foi possível abrir o Workspace. Tente novamente.';
    });
  });
  doc.getElementById('copy-workspace')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(WORKSPACE_URL).then(
      () => notice('URL do Workspace copiada.'),
      () => notice('Não foi possível copiar. URL: ' + WORKSPACE_URL),
    );
  });
  const options = [
    ['opt-startup', 'openOnStartup'],
    ['opt-newtab', 'openOnNewTab'],
    ['opt-notifications', 'showToastNotifications'],
  ] as const;
  const displaySettings = (value: ExtensionSettings) => {
    for (const [id, key] of options) {
      const input = doc.getElementById(id) as HTMLInputElement | null;
      if (input) input.checked = value[key];
    }
  };
  for (const [id, key] of options) {
    const input = doc.getElementById(id) as HTMLInputElement | null;
    input?.addEventListener('change', () => {
      const value = input.checked;
      input.disabled = true;
      void settingsMessage('UPDATE_SETTINGS', { [key]: value })
        .then(
          (settings) => {
            displaySettings(settings);
            notice('Opção salva.');
          },
          () => {
            input.checked = !value;
            notice('Não foi possível salvar a opção. Tente novamente.');
          },
        )
        .finally(() => {
          input.disabled = false;
        });
    });
  }
  await Promise.all([
    (async () => {
      let online = false;
      try {
        const response = await fetchFn('http://127.0.0.1:3177/health', {
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });
        online = response.ok && ((await response.json()) as { status?: unknown }).status === 'ok';
      } catch {
        /* Offline is a normal state. */
      }
      if (apiStatus) {
        apiStatus.textContent = online ? 'API local conectada' : 'API local indisponível';
        apiStatus.dataset.state = online ? 'online' : 'offline';
      }
    })(),
    (async () => {
      if (!tabStatus) return;
      tabStatus.textContent = 'Abra o Workspace para iniciar um acesso assistido.';
      if (!tabs?.query) return;
      try {
        const [tab] = await tabs.query({ active: true, currentWindow: true });
        tabStatus.dataset.state = isWorkspace(tab?.url) ? 'online' : 'neutral';
        tabStatus.textContent = isWorkspace(tab?.url)
          ? 'Você está no Hublink Workspace.'
          : tab?.url?.startsWith('https:')
            ? 'Página HTTPS ativa. Inicie o acesso pelo Workspace.'
            : 'Esta aba não é um destino HTTPS. Abra o Workspace.';
      } catch {
        tabStatus.textContent = 'Não foi possível consultar a aba ativa.';
      }
    })(),
    (async () => {
      displaySettings(DEFAULT_EXTENSION_SETTINGS);
      try {
        displaySettings(await settingsMessage('GET_SETTINGS'));
      } catch {
        for (const [id] of options) {
          const input = doc.getElementById(id) as HTMLInputElement | null;
          if (input) input.disabled = true;
        }
      }
    })(),
    (async () => {
      const list = doc.getElementById('quick-shortcuts');
      if (!list) return;
      list.textContent = 'Entre no Workspace para carregar seus atalhos.';
      try {
        const response = await fetchFn('http://127.0.0.1:3177/api/catalog', {
          credentials: 'include',
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) return;
        const body = (await response.json()) as { services?: unknown };
        if (!Array.isArray(body.services)) return;
        const links: HTMLButtonElement[] = [];
        for (const raw of body.services.slice(0, 100)) {
          if (!raw || typeof raw !== 'object') continue;
          const service = raw as Record<string, unknown>;
          if (
            typeof service.name !== 'string' ||
            service.name.length > 80 ||
            typeof service.targetUrl !== 'string' ||
            service.targetUrl.length > 2048 ||
            service.hasAction !== true
          )
            continue;
          let url: URL;
          try {
            url = new URL(service.targetUrl);
          } catch {
            continue;
          }
          if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) continue;
          const button = doc.createElement('button');
          button.type = 'button';
          const name = doc.createElement('strong');
          name.textContent = service.name;
          const address = doc.createElement('small');
          address.textContent = url.href;
          button.append(name, address);
          button.title = service.credentialType === 'none' ? url.href : 'Abrir pelo Workspace';
          button.addEventListener('click', () => {
            if (!tabs?.create) return;
            void (
              service.credentialType === 'none' ? tabs.create({ url: url.href }) : openWorkspace()
            ).catch(() => notice('Não foi possível abrir o atalho.'));
          });
          links.push(button);
        }
        if (links.length) list.replaceChildren(...links);
        else list.textContent = 'Configure destinos no Workspace para ver seus atalhos.';
      } catch {
        /* Never persist private destinations outside the authenticated popup lifetime. */
      }
    })(),
  ]);
}
if (typeof document !== 'undefined' && document.getElementById('api-status')) void initPopup();
