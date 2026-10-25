import { WORKSPACE_URL } from './workspace';

function httpsUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' &&
      url.hostname &&
      !url.username &&
      !url.password &&
      url.href.length <= 2048
      ? url
      : null;
  } catch {
    return null;
  }
}

export async function initBookmarks(doc: Document, fetchFn: typeof fetch): Promise<void> {
  const start = doc.getElementById('save-page') as HTMLButtonElement | null;
  const form = doc.getElementById('bookmark-form') as HTMLFormElement | null;
  const name = doc.getElementById('bookmark-name') as HTMLInputElement | null;
  const address = doc.getElementById('bookmark-url') as HTMLInputElement | null;
  const category = doc.getElementById('bookmark-category') as HTMLSelectElement | null;
  const submit = doc.getElementById('bookmark-submit') as HTMLButtonElement | null;
  const cancel = doc.getElementById('bookmark-cancel') as HTMLButtonElement | null;
  const view = doc.getElementById('view-bookmark') as HTMLButtonElement | null;
  const feedback = doc.getElementById('bookmark-feedback');
  if (!start || !form || !name || !address || !category || !submit || !cancel || !view || !feedback)
    return;
  const notice = (text: string) => {
    feedback.textContent = text;
  };
  let busy = false;
  start.addEventListener('click', () => {
    form.hidden = false;
    start.hidden = true;
    view.hidden = true;
    notice('');
    name.focus();
  });
  cancel.addEventListener('click', () => {
    if (busy) return;
    form.hidden = true;
    start.hidden = false;
    notice('');
    start.focus();
  });
  view.addEventListener('click', () => {
    // A fresh Workspace loads the new card without discarding drafts in an existing tab.
    void chrome.tabs
      .create({ url: WORKSPACE_URL })
      .catch(() => notice('Não foi possível abrir o Workspace.'));
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    const url = httpsUrl(address.value);
    const title = name.value.trim();
    if (!url || title.length < 2 || title.length > 80) {
      notice('Informe um nome de 2 a 80 caracteres e um endereço HTTPS sem credenciais.');
      return;
    }
    busy = true;
    for (const control of [name, address, category, submit, cancel]) control.disabled = true;
    notice('Salvando link…');
    void (async () => {
      try {
        const response = await fetchFn('http://127.0.0.1:3177/api/extension/bookmarks', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: title, targetUrl: url.href, category: category.value }),
          signal: AbortSignal.timeout(20000),
        });
        if (response.status === 401) {
          notice('Entre no Workspace e tente salvar novamente.');
          return;
        }
        if (response.status === 409) {
          notice('Este endereço já está nos seus cards pessoais.');
          view.hidden = false;
          return;
        }
        if (response.status !== 201) {
          notice('Não foi possível salvar o link. Abra o Workspace e tente novamente.');
          return;
        }
        form.hidden = true;
        start.hidden = false;
        notice('Link salvo nos seus cards pessoais.');
        view.hidden = false;
        view.focus();
      } catch {
        notice(
          'API indisponível ou sem resposta. Abra o Workspace para conferir antes de tentar novamente.',
        );
      } finally {
        busy = false;
        for (const control of [name, address, category, submit, cancel]) control.disabled = false;
      }
    })();
  });
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = httpsUrl(tab?.url ?? '');
    if (!url) {
      notice('Abra uma página HTTPS para salvar no Hublink.');
      return;
    }
    address.value = url.href;
    name.value = (tab?.title?.trim() || url.hostname).slice(0, 80);
    start.disabled = false;
  } catch {
    notice('Não foi possível consultar a aba ativa.');
  }
}
