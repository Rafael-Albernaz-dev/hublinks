const WORKSPACE_URL = 'http://127.0.0.1:5177';

function isWorkspace(url: string | undefined): boolean {
  try {
    return ['http://127.0.0.1:5177', 'http://localhost:5177'].includes(new URL(url ?? '').origin);
  } catch {
    return false;
  }
}

export async function initPopup(
  doc: Document = document,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const apiStatus = doc.getElementById('api-status');
  const tabStatus = doc.getElementById('tab-status');
  const tabs = typeof chrome !== 'undefined' ? chrome.tabs : undefined;
  const open = doc.getElementById('open-hublink');
  open?.addEventListener('click', () => {
    void (async () => {
      if (!tabs?.query) return;
      try {
        const existing = (await tabs.query({})).find((tab) => isWorkspace(tab.url));
        if (existing?.id !== undefined) {
          await tabs.update(existing.id, { active: true });
          if (typeof chrome.windows?.update === 'function')
            await chrome.windows.update(existing.windowId, { focused: true });
        } else {
          await tabs.create({ url: WORKSPACE_URL });
        }
      } catch {
        if (tabStatus)
          tabStatus.textContent = 'Não foi possível abrir o Workspace. Tente novamente.';
      }
    })();
  });
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
        /* An unavailable bridge is a normal popup state. */
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
        tabStatus.textContent = isWorkspace(tab?.url)
          ? 'Você está no Hublink Workspace.'
          : tab?.url?.startsWith('https:')
            ? 'Página HTTPS ativa. Inicie o acesso pelo Workspace.'
            : 'Esta aba não é um destino HTTPS. Abra o Workspace.';
      } catch {
        tabStatus.textContent = 'Não foi possível consultar a aba ativa.';
      }
    })(),
  ]);
}

if (typeof document !== 'undefined' && document.getElementById('api-status')) void initPopup();
