// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { DEFAULT_CONFIG } from './config';
import extensionManifest from '../../extension/static/manifest.json';
import type { HubConfig } from './config';

const apiConfig = {
  ...DEFAULT_CONFIG,
  companyName: 'Empresa da API',
  links: [{ id: 'site', title: 'Site público', description: '', url: 'https://example.com/' }],
};
let saved: HubConfig = apiConfig;
let requests: Array<{ url: string; method: string; body?: unknown }> = [];
let authenticated = true;
const admin = {
  id: 'admin',
  displayName: 'Administrador',
  email: 'admin@example.test',
  role: 'admin',
};
let signedInUser: typeof admin = admin;
let vaultItems: Array<Record<string, unknown>> = [];
let catalogItems: Array<Record<string, unknown>> = [];

beforeEach(() => {
  document.documentElement.removeAttribute('data-hublink-extension');
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  saved = structuredClone(apiConfig);
  requests = [];
  authenticated = true;
  signedInUser = admin;
  vaultItems = [
    {
      serviceId: 'partiu',
      serviceName: 'PARTIU!',
      category: 'sva',
      credentialType: 'shared',
      credentialId: 'cred-1',
      ownerUserId: null,
      ownerName: null,
      keyVersion: 1,
      updatedAt: '2026-10-16T12:00:00Z',
    },
  ];
  catalogItems = [
    {
      id: 'partiu',
      name: 'PARTIU!',
      description: 'Acesso da equipe',
      category: 'sva',
      credentialType: 'shared',
      targetUrl: 'https://example.test/',
      hasAction: true,
      logoDataUrl: null,
      hasCredential: true,
    },
    {
      id: 'pending',
      name: 'Sem destino',
      description: null,
      category: 'crm',
      credentialType: 'none',
      targetUrl: null,
      hasAction: false,
      logoDataUrl: null,
      hasCredential: false,
    },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET';
      requests.push({
        url,
        method,
        body: options?.body ? JSON.parse(options.body as string) : undefined,
      });
      if (url === '/api/auth/me')
        return {
          ok: authenticated,
          status: authenticated ? 200 : 401,
          json: async () => ({ user: signedInUser }),
        };
      if (url === '/api/auth/login') {
        authenticated = true;
        return { ok: true, json: async () => ({ user: signedInUser }) };
      }
      if (url === '/api/auth/logout') {
        authenticated = false;
        return { ok: true };
      }
      if (url === '/api/admin/users') return { ok: true, json: async () => ({ users: [] }) };
      if (url === '/api/vault/credentials')
        return {
          ok: true,
          json: async () => ({ credentials: vaultItems }),
        };
      if (url === '/api/vault/tickets')
        return {
          ok: true,
          json: async () => ({
            ticket: 'a'.repeat(43),
            serviceId: 'partiu',
            targetUrl: 'https://example.test/',
          }),
        };
      if (url === '/api/catalog' && method === 'GET')
        return { ok: true, json: async () => ({ services: catalogItems }) };
      if (url === '/api/catalog/services' && method === 'POST') {
        const body = JSON.parse(options?.body as string) as Record<string, unknown>;
        const service = {
          ...body,
          id: 'new-card',
          hasAction: Boolean(body.targetUrl),
          hasCredential: Boolean(body.username && body.password),
        };
        catalogItems.push(service);
        return { ok: true, status: 201, json: async () => ({ service }) };
      }
      if (url.startsWith('/api/catalog/services/') && method === 'PUT') {
        const id = url.split('/').at(-1);
        const body = JSON.parse(options?.body as string) as Record<string, unknown>;
        catalogItems = catalogItems.map((item) =>
          item.id === id ? { ...item, ...body, hasAction: Boolean(body.targetUrl) } : item,
        );
        return {
          ok: true,
          json: async () => ({ service: catalogItems.find((item) => item.id === id) }),
        };
      }
      if (url.startsWith('/api/catalog/services/') && method === 'DELETE') {
        catalogItems = catalogItems.filter((item) => item.id !== url.split('/').at(-1));
        return { ok: true, status: 204 };
      }
      if (url === '/api/vault/services' && method === 'POST') {
        const body = JSON.parse(options?.body as string) as {
          name: string;
          credentialType: 'shared' | 'individual';
          category: string;
        };
        const service = {
          id: 'new-service-id',
          name: body.name,
          credentialType: body.credentialType,
          category: body.category,
          targetUrl: null,
        };
        vaultItems.push({
          serviceId: service.id,
          serviceName: service.name,
          credentialType: service.credentialType,
          category: service.category,
          credentialId: null,
          ownerUserId: null,
          ownerName: null,
          keyVersion: null,
          updatedAt: null,
        });
        return { ok: true, status: 201, json: async () => ({ service }) };
      }
      if (url === '/api/vault/credentials/partiu/reveal')
        return {
          ok: true,
          json: async () => ({ username: 'partiu_mock_user', password: 'partiu_mock_password' }),
        };
      if (url.startsWith('/api/catalog/favicon?url=')) {
        const rawTarget = decodeURIComponent(url.split('url=')[1] ?? '');
        let host = 'example.com';
        try {
          host = new URL(rawTarget).hostname;
        } catch {
          // ignore
        }
        return {
          ok: true,
          json: async () => ({
            logoDataUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            host,
          }),
        };
      }
      if (method === 'PUT' && url === '/api/config') saved = JSON.parse(options?.body as string);
      return {
        ok: true,
        json: async () => (method === 'PUT' ? { status: 'ok', config: saved } : saved),
      };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('extension bridge', () => {
  it('declares both local Hub origins for injection and external messaging', () => {
    const origins = ['http://localhost:5177/*', 'http://127.0.0.1:5177/*'];
    expect(extensionManifest.content_scripts[0]?.matches).toEqual(origins);
    expect(extensionManifest.externally_connectable.matches).toEqual(origins);
  });

  it('shows installation and manual fallback when the extension is missing', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Instalar extensão' })).not.toBeNull();
    fireEvent.click(await screen.findByRole('link', { name: /PARTIU!/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Extensão do Hublink necessária' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('link', { name: 'Como instalar / Baixar extensão' }).getAttribute('href'),
    ).toBe('chrome://extensions');
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir destino mesmo assim (login manual)' }),
    );
    expect(open).toHaveBeenCalledWith('https://example.test/', '_blank', 'noopener,noreferrer');
    expect(requests.some((item) => item.url === '/api/vault/tickets')).toBe(false);
  });

  it('detects extension and dispatches only an opaque ticket', async () => {
    vi.stubEnv('VITE_HUB_EXTENSION_ID', 'a'.repeat(32));
    const messages: unknown[] = [];
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (_id: string, message: unknown, callback: (value: unknown) => void) => {
          messages.push(message);
          callback({ status: (message as { type: string }).type === 'PING' ? 'ok' : 'opened' });
        },
      },
    });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Extensão ativa' })).not.toBeNull();
    fireEvent.click(await screen.findByRole('link', { name: /PARTIU!/ }));
    await waitFor(() => expect(messages).toHaveLength(3));
    expect(messages[2]).toEqual({
      type: 'OPEN_SERVICE',
      ticket: 'a'.repeat(43),
      serviceId: 'partiu',
      targetUrl: 'https://example.test/',
    });
    expect(requests.some((item) => item.url === '/api/vault/tickets')).toBe(true);
  });

  it('shows the content-script marker immediately but confirms the bridge before a ticket', async () => {
    document.documentElement.setAttribute('data-hublink-extension', 'active');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Extensão ativa' })).not.toBeNull();
    fireEvent.click(await screen.findByRole('link', { name: /PARTIU!/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Extensão do Hublink necessária' }),
    ).not.toBeNull();
    expect(requests.some((item) => item.url === '/api/vault/tickets')).toBe(false);
  });
});

describe('API backed customization', () => {
  it('loads data from the API and saves only explicit changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('Empresa da API')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Personalização' }));
    const save = screen.getByRole('button', { name: 'Salvar alterações' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.clear(screen.getByRole('textbox', { name: 'Nome da empresa' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome da empresa' }), 'Nova Empresa');
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(0);
    await user.click(save);
    await waitFor(() =>
      expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(1),
    );
    expect(saved.companyName).toBe('Nova Empresa');
    expect(await screen.findByText('Alterações salvas na API local.')).not.toBeNull();
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an offline banner and blocks editing when GET fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/auth/me') return { ok: true, json: async () => ({ user: admin }) };
        throw new Error('offline');
      }),
    );
    render(<App />);
    expect(await screen.findByText(/Não foi possível conectar à API do Hublink/)).not.toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Personalização' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('shows the offline banner for an HTTP error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/auth/me'
          ? { ok: true, json: async () => ({ user: admin }) }
          : { ok: false, status: 503 },
      ),
    );
    render(<App />);
    expect(await screen.findByText(/Não foi possível conectar à API do Hublink/)).not.toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Personalização' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('keeps navigation keyboard accessible with a current page', async () => {
    const user = userEvent.setup();
    render(<App />);
    const home = await screen.findByRole('button', { name: 'Início' });
    home.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Catálogo' }));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Catálogo' }).getAttribute('aria-current')).toBe(
      'page',
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(home);
  });

  it('uploads a private card logo, previews it in Light/Dark modes, and renders it in the card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar serviço' }));
    expect(screen.getByRole('dialog', { name: 'Novo serviço' })).not.toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Nome do serviço/card' }), 'Novo card');
    await user.type(screen.getByRole('textbox', { name: 'Endereço HTTPS' }), 'https://example.net');
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Enviar logo') as HTMLInputElement, image);
    expect(await screen.findByAltText('Prévia da logo do card')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Salvar card' }));
    await user.click(screen.getByRole('button', { name: 'Início' }));
    const card = screen.getByRole('link', { name: /Novo card/ });
    expect(card.querySelector('.hb-logo img')?.getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(catalogItems.find((item) => item.id === 'new-card')?.logoDataUrl).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it('keeps changes pending when PUT fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url === '/api/auth/me') return { ok: true, json: async () => ({ user: admin }) };
        if (url === '/api/admin/users') return { ok: true, json: async () => ({ users: [] }) };
        if (options?.method === 'PUT') return { ok: false };
        return { ok: true, json: async () => apiConfig };
      }),
    );
    render(<App />);
    await screen.findByText('Empresa da API');
    fireEvent.click(screen.getByRole('button', { name: 'Personalização' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da empresa' }), {
      target: { value: 'Alterada' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText('Não foi possível salvar as alterações na API local.'),
    ).not.toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Salvar alterações' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('shows login without exposing link cards when the session is missing', async () => {
    authenticated = false;
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Entrar no Hublink' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: /PARTIU!/ })).toBeNull();
  });

  it('unlocks links after login and returns to login after logout', async () => {
    authenticated = false;
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'E-mail' }), 'admin@example.test');
    await user.type(screen.getByLabelText('Senha'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: 'Entrar no Hublink' }));
    expect(await screen.findByRole('link', { name: /PARTIU!/ })).not.toBeNull();
    expect(screen.getByText('Administrador')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sair da conta' }));
    expect(await screen.findByRole('button', { name: 'Entrar no Hublink' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: /PARTIU!/ })).toBeNull();
  });

  it('lists credential metadata without revealing or requesting stored passwords', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Acessos' }));
    expect((await screen.findAllByText('Cifrada no cofre')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Revelar' })).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(requests.some((item) => item.url.endsWith('/reveal'))).toBe(false);
  });

  it('lets an admin create an individual catalog card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    const trigger = await screen.findByRole('button', { name: '+ Adicionar serviço' });
    await user.click(trigger);
    await user.type(
      screen.getByRole('textbox', { name: 'Nome do serviço/card' }),
      'SVA Atendimento',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo de Acesso / Cofre' }),
      'individual',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'sistemas');
    await user.click(screen.getByRole('button', { name: 'Salvar card' }));
    await waitFor(() => expect(screen.getAllByText('SVA Atendimento').length).toBeGreaterThan(0));
    expect(await screen.findByText('Card salvo no catálogo privado.')).not.toBeNull();
    expect(
      requests.some(
        (request) =>
          request.method === 'POST' &&
          (request.body as { name?: string; credentialType?: string })?.name ===
            'SVA Atendimento' &&
          (request.body as { credentialType?: string })?.credentialType === 'individual' &&
          (request.body as { category?: string })?.category === 'sistemas',
      ),
    ).toBe(true);
  });

  it('does not offer vault service creation to an attendant', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Acessos' }));
    expect(await screen.findByRole('heading', { name: 'Acessos da equipe' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+ Adicionar serviço' })).toBeNull();
  });

  it('shows pending individual status and keeps catalog actions admin-only', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    catalogItems = [
      {
        id: 'individual-service',
        name: 'Individual Service',
        description: null,
        category: 'sva',
        credentialType: 'individual',
        targetUrl: null,
        hasAction: false,
        logoDataUrl: null,
        hasCredential: false,
      },
    ];
    render(<App />);
    expect(
      await screen.findByRole('button', { name: 'Sem destino Individual Service' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Sem destino Individual Service' }).getAttribute('href'),
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Sem destino Individual Service' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.queryByRole('button', { name: '+ Adicionar serviço' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });

  it('shows shared credential fields only for shared access', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar serviço' }));
    const type = screen.getByRole('combobox', { name: 'Tipo de Acesso / Cofre' });
    expect(screen.queryByLabelText('Usuário do serviço')).toBeNull();
    await user.selectOptions(type, 'shared');
    expect(screen.getByLabelText('Usuário do serviço')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Mostrar senha' })).not.toBeNull();
    await user.selectOptions(type, 'individual');
    expect(screen.queryByLabelText('Usuário do serviço')).toBeNull();
    expect(screen.getByText(/Cada atendente cadastra sua própria credencial/)).not.toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoria' }), 'sheet');
    expect((type as HTMLSelectElement).value).toBe('none');
    expect(screen.queryByRole('option', { name: 'Cofre Compartilhado (equipe)' })).toBeNull();
  });

  it('lets an attendant start their own credential for a new individual service in a modal', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    vaultItems = [
      {
        serviceId: 'individual-service',
        serviceName: 'Individual Service',
        category: 'sva',
        credentialType: 'individual',
        credentialId: null,
        ownerUserId: null,
        ownerName: null,
        keyVersion: null,
        updatedAt: null,
      },
    ];
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Acessos' }));
    expect(await screen.findByText('Individual Service')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(screen.getByRole('dialog', { name: 'Cadastrar Individual Service' })).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Usuário do serviço' })).not.toBeNull();
    expect(screen.getByLabelText('Senha do serviço')).not.toBeNull();
  });

  it('opens individual setup modal on-demand when clicking an individual card without credentials', async () => {
    catalogItems = [
      {
        id: 'indiv-1',
        name: 'Sistema Individual',
        description: 'Acesso individual',
        category: 'sistemas',
        credentialType: 'individual',
        targetUrl: 'https://sistema.example.test/',
        hasAction: true,
        logoDataUrl: null,
        hasCredential: false,
      },
    ];
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Sistema Individual');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Sistema Individual' }));
    expect(
      await screen.findByRole('heading', { name: 'Configurar Acesso Pessoal' }),
    ).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Usuário / Identificador' })).not.toBeNull();
    expect(screen.getByLabelText('Senha')).not.toBeNull();
    expect(screen.getByText('Cofre individual · AES-256-GCM')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ver senha' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Salvar e Acessar Sistema ↗' })).not.toBeNull();
  });
});

describe('Workspace design system', () => {
  it('renders the shell, centered company+year footer, and all five dedicated destinations', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    expect(screen.getByRole('heading', { name: 'Um bom dia começa aqui.' })).not.toBeNull();
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toBe(`Empresa da API · ${new Date().getFullYear()}`);
    const destinations = [
      ['Início', 'Um bom dia começa aqui.'],
      ['Catálogo', 'Catálogo de Serviços'],
      ['Acessos', 'Acessos da equipe'],
      ['Equipe', 'Equipe e permissões'],
      ['Personalização', 'Personalização do seu hub'],
    ];
    for (const [name, heading] of destinations) {
      const button = screen.getByRole('button', { name });
      await user.click(button);
      expect(button.getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('heading', { name: heading })).not.toBeNull();
      expect(document.querySelectorAll('.hb-nav [aria-current="page"]')).toHaveLength(1);
    }
  });

  it('filters names and categories without accents or case and announces results', async () => {
    catalogItems.push({
      ...catalogItems[0],
      id: 'gestao',
      name: 'Gestão ERP',
      category: 'sistemas',
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('link', { name: 'Abrir Gestão ERP' });
    const input = screen.getByRole('textbox', { name: 'Buscar serviços no Workspace' });
    await user.type(input, 'GESTAO');
    expect(screen.getByRole('link', { name: 'Abrir Gestão ERP' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Abrir PARTIU!' })).toBeNull();
    expect(screen.getByText('1 serviços encontrados').getAttribute('aria-live')).toBe('polite');
    await user.clear(input);
    await user.type(input, 'SISTEMAS');
    expect(screen.getByRole('link', { name: 'Abrir Gestão ERP' })).not.toBeNull();
    await user.clear(input);
    await user.type(input, 'inexistente');
    expect(screen.getByText('Nenhum serviço encontrado.')).not.toBeNull();
  });

  it('persists the local theme selection', async () => {
    localStorage.setItem('hublink-theme', 'light');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Mudar para tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('hublink-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Mudar para tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('keeps administrative destinations disabled for attendants', async () => {
    signedInUser = { ...admin, role: 'attendant' };
    render(<App />);
    await screen.findByText('Empresa da API');
    expect((screen.getByRole('button', { name: 'Equipe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Personalização' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(requests.some((item) => item.url === '/api/admin/users')).toBe(false);
  });

  it('opens direct links safely without requesting a ticket', async () => {
    catalogItems = [{ ...catalogItems[0], credentialType: 'none' }];
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Abrir PARTIU!' });
    expect(link.getAttribute('href')).toBe('https://example.test/');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(requests.some((item) => item.url === '/api/vault/tickets')).toBe(false);
  });
});

describe('Workspace interaction boundaries', () => {
  it('keeps the individual dialog focused and restores focus after Escape', async () => {
    catalogItems = [
      { ...catalogItems[0], id: 'individual', credentialType: 'individual', hasCredential: false },
    ];
    const user = userEvent.setup();
    render(<App />);
    const trigger = await screen.findByRole('button', { name: 'Cadastrar PARTIU!' });
    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'Fechar' });
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('animates once with the approved stagger and never animates filtering or navigation', async () => {
    catalogItems = Array.from({ length: 8 }, (_, index) => ({
      ...catalogItems[0],
      id: String(index),
      name: 'Serviço ' + index,
    }));
    const animate = vi.fn();
    const previous = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    try {
      const user = userEvent.setup();
      render(<App />);
      await screen.findByRole('link', { name: 'Abrir Serviço 0' });
      await waitFor(() => expect(animate).toHaveBeenCalledTimes(8));
      expect(animate.mock.calls.map((call) => (call[1] as { delay: number }).delay)).toEqual([
        0, 35, 70, 105, 140, 175, 175, 175,
      ]);
      expect(animate.mock.calls[0]?.[1]).toEqual({
        duration: 220,
        delay: 0,
        easing: 'cubic-bezier(.2,.7,.2,1)',
        fill: 'backwards',
      });
      await user.type(screen.getByRole('textbox', { name: 'Buscar serviços no Workspace' }), '0');
      await user.click(screen.getByRole('button', { name: 'Catálogo' }));
      await user.click(screen.getByRole('button', { name: 'Início' }));
      expect(animate).toHaveBeenCalledTimes(8);
    } finally {
      HTMLElement.prototype.animate = previous;
    }
  });

  it('does not animate when reduced motion is preferred', async () => {
    const animate = vi.fn();
    const previous = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('reduced-motion') })),
    );
    try {
      render(<App />);
      await screen.findByRole('link', { name: 'Abrir PARTIU!' });
      expect(animate).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.animate = previous;
    }
  });

  it('does not display another attendant’s individual metadata or shared management', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    vaultItems.push({
      ...vaultItems[0],
      serviceId: 'other-private',
      serviceName: 'Other private service',
      credentialType: 'individual',
      ownerUserId: 'another-user',
      ownerName: 'Other user',
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Acessos' }));
    await screen.findAllByText('Cifrada no cofre');
    expect(screen.queryByText('Other private service')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gerenciar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revelar' })).toBeNull();
  });

  it('creates users, edits permissions/status, and resets passwords through modals', async () => {
    const originalFetch = globalThis.fetch;
    const people = [
      { ...admin, active: true, createdAt: '2026-10-16T00:00:00Z' },
      {
        ...admin,
        id: 'team-member',
        displayName: 'Pessoa sintética',
        email: 'synthetic@example.test',
        role: 'attendant',
        active: true,
        createdAt: '2026-10-16T00:00:00Z',
      },
    ];
    const operations: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.startsWith('/api/admin/users')) {
          operations.push({
            url,
            method: options?.method ?? 'GET',
            body: options?.body ? JSON.parse(options.body as string) : null,
          });
          return { ok: true, json: async () => ({ users: people }) };
        }
        return originalFetch(url, options);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Equipe' }));
    await screen.findByText('Pessoa sintética');
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Usuário').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '+ Adicionar usuário' }));
    expect(screen.getByRole('dialog', { name: 'Novo usuário' })).not.toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Nova pessoa');
    await user.type(screen.getByRole('textbox', { name: 'E-mail' }), 'new@example.test');
    await user.type(screen.getByLabelText('Senha inicial'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }));
    expect(await screen.findByText('Usuário cadastrado com sucesso.')).not.toBeNull();

    const resetBtns = screen.getAllByRole('button', { name: 'Redefinir senha' });
    await user.click(resetBtns[1]!);
    expect(
      screen.getByRole('dialog', { name: 'Redefinir senha de Pessoa sintética' }),
    ).not.toBeNull();
    await user.type(screen.getByLabelText('Nova senha'), 'synthetic-new-password');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
    await waitFor(() =>
      expect(
        operations.some((item) => item.method === 'POST' && item.url === '/api/admin/users'),
      ).toBe(true),
    );
    expect(
      operations.some((item) => item.url === '/api/admin/users/team-member/reset-password'),
    ).toBe(true);
  });
});

describe('Workspace UX refinements', () => {
  it('keeps theme and logout icon buttons in the header', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    const header = document.querySelector('.hb-header')!;
    const theme = screen.getByRole('button', { name: 'Mudar para tema escuro' });
    const logout = screen.getByRole('button', { name: 'Sair da conta' });
    expect(header.contains(theme)).toBe(true);
    expect(header.contains(logout)).toBe(true);
    expect(theme.querySelector('svg.lucide')).not.toBeNull();
    expect(logout.querySelector('svg.lucide')).not.toBeNull();
    expect(document.querySelector('.hb-footer')?.contains(logout)).toBe(false);
    await user.click(theme);
    expect(
      screen.getByRole('button', { name: 'Mudar para tema claro' }).getAttribute('title'),
    ).toBe('Tema claro');
    await user.click(logout);
    expect(await screen.findByRole('button', { name: 'Entrar no Hublink' })).not.toBeNull();
  });

  it('shows the customization subtitle, home texts, and bicolor navbar immediately and persists after Save', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText(apiConfig.subtitle)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Personalização' }));
    const field = screen.getByRole('textbox', { name: 'Texto de apresentação' });
    await user.clear(field);
    await user.type(field, 'Uma mensagem da equipe');
    await user.type(screen.getByRole('textbox', { name: 'Texto parte 1 (navbar)' }), 'Rural');
    await user.type(screen.getByRole('textbox', { name: 'Texto parte 2 (navbar)' }), 'Conecta');
    await user.click(screen.getByRole('button', { name: 'Início' }));
    expect(screen.getByText('Uma mensagem da equipe')).not.toBeNull();
    expect(document.querySelector('.hb-brand-bicolor')?.textContent).toBe('Rural Conecta');
    expect(
      requests.filter((item) => item.method === 'PUT' && item.url === '/api/config'),
    ).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Personalização' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(saved.subtitle).toBe('Uma mensagem da equipe'));
    expect(saved.brandPrimaryText).toBe('Rural');
    expect(saved.brandSecondaryText).toBe('Conecta');
  });

  it('falls back to the approved Home subtitle when the configured text is empty', async () => {
    saved = { ...apiConfig, subtitle: '' };
    render(<App />);
    expect(await screen.findByText('Serviços, consultas e acessos da equipe.')).not.toBeNull();
  });

  it('keeps Home cards out of Catalog and filters table management records by search and category', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('link', { name: 'Abrir PARTIU!' });
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.queryByRole('link', { name: 'Abrir PARTIU!' })).toBeNull();
    expect(document.querySelector('.hb-grid')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Catálogo de Serviços' })).not.toBeNull();
    expect(screen.getByRole('table', { name: 'Tabela de serviços do catálogo' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '+ Adicionar serviço' })).not.toBeNull();
    expect(screen.getByText('example.test')).not.toBeNull();
    expect(screen.getByText('Sem destino configurado')).not.toBeNull();
    const filter = screen.getByRole('textbox', { name: 'Buscar no catálogo' });
    await user.type(filter, 'partiu');
    expect(document.querySelectorAll('.catalog-management-record')).toHaveLength(1);
    expect(screen.getByText('1 serviços encontrados no catálogo').getAttribute('aria-live')).toBe(
      'polite',
    );
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1);
  });

  it('shows attendants a read-only catalog with an Access shortcut', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.queryByRole('button', { name: '+ Adicionar serviço' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ir para Acessos' }));
    expect(screen.getByRole('heading', { name: 'Acessos da equipe' })).not.toBeNull();
  });

  it('updates accent and both color fields from valid hexadecimal and RGB entries', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    const shell = document.querySelector('.site-shell') as HTMLElement;
    expect(shell.style.getPropertyValue('--hb-accent')).toBe('');
    await user.click(screen.getByRole('button', { name: 'Personalização' }));
    const hex = screen.getByRole('textbox', { name: 'Hexadecimal' });
    const rgb = screen.getByRole('textbox', { name: 'RGB' });
    fireEvent.change(hex, { target: { value: '#11AA33' } });
    await waitFor(() => expect(shell.style.getPropertyValue('--hb-accent')).toBe('rgb(17 170 51)'));
    expect((rgb as HTMLInputElement).value).toBe('17, 170, 51');
    expect(shell.style.getPropertyValue('--hb-soft')).toContain('rgb(17 170 51)');
    fireEvent.change(rgb, { target: { value: 'rgb(200, 30, 70)' } });
    await waitFor(() => expect(shell.style.getPropertyValue('--hb-accent')).toBe('rgb(200 30 70)'));
    expect((hex as HTMLInputElement).value).toBe('#C81E46');
    expect((screen.getByLabelText('Seletor visual de cor') as HTMLInputElement).value).toBe(
      '#c81e46',
    );
    fireEvent.change(rgb, { target: { value: '300, 30, 70' } });
    expect(rgb.getAttribute('aria-invalid')).toBe('true');
    expect(shell.style.getPropertyValue('--hb-accent')).toBe('rgb(200 30 70)');
    await user.click(screen.getByRole('button', { name: 'Restaurar roxo padrão' }));
    expect(shell.style.getPropertyValue('--hb-accent')).toBe('');
    expect((hex as HTMLInputElement).value).toBe('#7137D1');
  });

  it('previews and removes the company logo through its dedicated Light/Dark card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Personalização' }));
    const upload = screen.getByLabelText('Enviar nova logo') as HTMLInputElement;
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'brand.png', { type: 'image/png' });
    await user.upload(upload, image);
    expect(await screen.findByAltText('Logo enviada')).not.toBeNull();
    expect(screen.getByText(/Light mode/)).not.toBeNull();
    expect(screen.getByText(/Dark mode/)).not.toBeNull();
    expect(screen.getByText(/256×256 px/)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remover logo' }));
    expect(screen.queryByAltText('Logo enviada')).toBeNull();
  });

  it('captures a favicon from the HTTPS link and displays the captured icon banner in the service modal', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar serviço' }));
    expect(screen.getByRole('dialog', { name: 'Novo serviço' })).not.toBeNull();
    await user.type(screen.getByLabelText('Nome do serviço/card'), 'Portal GitHub');
    await user.type(screen.getByLabelText('Endereço HTTPS'), 'github.com');
    await user.click(screen.getByRole('button', { name: 'Capturar favicon do link' }));
    expect(await screen.findByText('Favicon capturado de github.com')).not.toBeNull();
    expect(screen.getByText('Favicon automático')).not.toBeNull();
    expect(screen.getByAltText('Favicon capturado de github.com')).not.toBeNull();
  });
});
