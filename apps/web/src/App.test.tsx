// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  renderHook,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useExtensionBridge } from './hooks/useExtensionBridge';
import { useWorkspaceState } from './hooks/useWorkspaceState';
import { App } from './App';
import { AuditView } from './views/AuditView';
import { DEFAULT_CONFIG } from './config';
import extensionManifest from '../../extension/static/manifest.json';
import { defaultPreferences } from './hooks/usePreferences';
import type { UserPreferences } from './types';
import type { HubConfig } from './config';

const apiConfig = {
  ...DEFAULT_CONFIG,
  companyName: 'Empresa da API',
  links: [{ id: 'site', title: 'Site público', description: '', url: 'https://example.com/' }],
};
let preferences: UserPreferences = structuredClone(defaultPreferences);
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
  preferences = structuredClone(defaultPreferences);
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
      if (url === '/api/me/preferences') {
        if (method === 'DELETE') preferences = structuredClone(defaultPreferences);
        if (method === 'PUT')
          preferences = { ...preferences, ...JSON.parse(options?.body as string) };
        return { ok: true, json: async () => ({ preferences }) };
      }
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
      if (url === '/api/auth/profile') {
        const input = JSON.parse(options?.body as string) as Record<string, unknown>;
        signedInUser = {
          ...signedInUser,
          ...Object.fromEntries(
            Object.entries(input).filter(([key]) =>
              ['displayName', 'email', 'avatar'].includes(key),
            ),
          ),
        };
        return { ok: true, json: async () => ({ user: signedInUser }) };
      }
      if (url === '/api/auth/logout') {
        authenticated = false;
        return { ok: true };
      }
      if (url.startsWith('/api/admin/audit?'))
        return { ok: true, json: async () => ({ events: [], total: 0 }) };
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
          ...Object.fromEntries(
            Object.entries(body).filter(([key]) => !['username', 'password'].includes(key)),
          ),
          id: 'new-card',
          ownerUserId: body.scope === 'personal' ? signedInUser.id : null,
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
          item.id === id
            ? {
                ...item,
                ...Object.fromEntries(
                  Object.entries(body).filter(([key]) => !['username', 'password'].includes(key)),
                ),
                hasAction: Boolean(body.targetUrl),
              }
            : item,
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
    expect(await screen.findByRole('dialog', { name: 'Central da Extensão' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Baixar extensão (.zip)' })).not.toBeNull();
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

  it('requires a confirmed bridge even when a content-script marker is present', async () => {
    document.documentElement.setAttribute('data-hublink-extension', 'active');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Instalar extensão' })).not.toBeNull();
    fireEvent.click(await screen.findByRole('link', { name: /PARTIU!/ }));
    expect(await screen.findByRole('dialog', { name: 'Central da Extensão' })).not.toBeNull();
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
        if (url === '/api/me/preferences') return { ok: true, json: async () => ({ preferences }) };
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
        if (url === '/api/me/preferences') return { ok: true, json: async () => ({ preferences }) };
        if (url === '/api/auth/me') return { ok: true, json: async () => ({ user: admin }) };
        if (url.startsWith('/api/admin/audit?'))
          return { ok: true, json: async () => ({ events: [], total: 0 }) };
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
    await user.click(screen.getByRole('button', { name: /Menu do usuário/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Sair da conta' }));
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
    expect(screen.getByRole('button', { name: '+ Adicionar serviço' })).not.toBeNull();
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
      ['Auditoria', 'Logs de auditoria'],
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
    await user.click(await screen.findByRole('button', { name: /Menu do usuário/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('hublink-theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: /Menu do usuário/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('keeps administrative destinations disabled for attendants', async () => {
    signedInUser = { ...admin, role: 'attendant' };
    render(<App />);
    await screen.findByText('Empresa da API');
    expect((screen.getByRole('button', { name: 'Equipe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Auditoria' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      (screen.getByRole('button', { name: 'Personalização' }) as HTMLButtonElement).disabled,
    ).toBe(false);
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
  it('concentrates account actions in the dropdown and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = await screen.findByRole('button', { name: /Menu do usuário/ });
    expect(trigger.querySelector('.hb-user-avatar')).not.toBeNull();
    expect(document.querySelector('.account-actions')).toBeNull();
    await user.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menuitem', { name: 'Sair da conta' })).not.toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    await user.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Sair da conta' }));
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

  it('keeps team cards read-only for attendants and offers personal creation', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.getByRole('button', { name: '+ Adicionar serviço' })).not.toBeNull();
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
    await waitFor(() =>
      expect(screen.getAllByAltText('Prévia da logo no serviço')).toHaveLength(4),
    );
    expect(screen.getAllByText(/Light mode/)).toHaveLength(2);
    expect(screen.getAllByText(/Dark mode/)).toHaveLength(2);
    expect(screen.getByText(/256×256 px/)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remover logo' }));
    expect(screen.queryAllByAltText('Prévia da logo no serviço')).toHaveLength(0);
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

describe('Personal user layer and Home organization', () => {
  it('switches layouts, navigates carousel dots and combines search with filters', async () => {
    const user = userEvent.setup();
    catalogItems.push(
      ...Array.from({ length: 5 }, (_, index) => ({
        ...catalogItems[0],
        id: `extra-${index}`,
        name: `Sheet ${index}`,
        category: 'sheet',
        credentialType: 'none',
        ownerUserId: index === 0 ? admin.id : null,
      })),
    );
    const { container } = render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Lista' }));
    await waitFor(() => expect(container.querySelectorAll('.hb-service-row')).toHaveLength(7));
    await user.click(screen.getByRole('button', { name: 'Carrossel' }));
    await waitFor(() => expect(container.querySelector('.hb-carousel')).not.toBeNull());
    expect(
      screen.getByRole('button', { name: 'Ir para página 1' }).getAttribute('aria-current'),
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Ir para página 3' }));
    expect(container.querySelectorAll('.hb-carousel-page:not([inert]) .hb-service')).toHaveLength(
      1,
    );
    expect(screen.getByRole('button', { name: 'Próximo slide' }).hasAttribute('disabled')).toBe(
      false,
    );
    await user.click(screen.getByRole('button', { name: 'Slide anterior' }));
    expect(
      screen.getByRole('button', { name: 'Ir para página 2' }).getAttribute('aria-current'),
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Grade' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Categoria dos serviços' }),
      'sheet',
    );
    expect(screen.getByText('5 serviços encontrados')).not.toBeNull();
    await user.type(
      screen.getByRole('textbox', { name: 'Buscar serviços no Workspace' }),
      'Sheet 0',
    );
    expect(screen.getByText('1 serviços encontrados')).not.toBeNull();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Categoria dos serviços' }),
      'sva',
    );
    expect(screen.getByText('0 serviços encontrados')).not.toBeNull();
    await user.clear(screen.getByRole('textbox', { name: 'Buscar serviços no Workspace' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Categoria dos serviços' }),
      'all',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo de acesso' }), 'personal');
    expect(screen.getByText('1 serviços encontrados')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir Sheet 0' }).getAttribute('rel')).toBe(
      'noopener noreferrer',
    );
  });

  it('persists drag order, keyboard reordering and shortcut visibility across remounts', async () => {
    const user = userEvent.setup();
    let view = render(<App />);
    await screen.findByText('Empresa da API');
    fireEvent.dragStart(screen.getByRole('button', { name: 'Configurar Sem destino' }));
    fireEvent.dragOver(screen.getByRole('link', { name: 'Abrir PARTIU!' }));
    fireEvent.drop(screen.getByRole('link', { name: 'Abrir PARTIU!' }));
    await waitFor(() => expect(preferences.cardOrder).toEqual(['pending', 'partiu']));
    expect(view.container.querySelector('.hb-service')?.getAttribute('aria-label')).toBe(
      'Configurar Sem destino',
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Configurar Sem destino' }), {
      key: 'ArrowRight',
      altKey: true,
    });
    await waitFor(() => expect(preferences.cardOrder).toEqual(['partiu', 'pending']));
    await user.click(screen.getByRole('button', { name: 'Ocultar atalhos' }));
    await waitFor(() => expect(view.container.querySelector('.hb-shortcuts')).toBeNull());
    expect(JSON.parse(localStorage.getItem('hublink:preferences:admin')!).showShortcutCards).toBe(
      false,
    );
    view.unmount();
    view = render(<App />);
    await screen.findByText('Empresa da API');
    expect(
      screen.getByRole('button', { name: 'Mostrar atalhos' }).getAttribute('aria-pressed'),
    ).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Mostrar atalhos' }));
    await waitFor(() => expect(view.container.querySelector('.hb-shortcuts')).not.toBeNull());
  });

  it('lets attendants create, edit and delete only their own cards and saves a personal theme', async () => {
    signedInUser = { ...admin, id: 'attendant', role: 'attendant' };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.getAllByText('Padrão da equipe')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '+ Adicionar serviço' }));
    expect(screen.queryByRole('option', { name: 'Cofre Compartilhado (equipe)' })).toBeNull();
    await user.type(screen.getByLabelText('Nome do serviço/card'), 'My personal card');
    await user.click(screen.getByRole('button', { name: 'Salvar card' }));
    await screen.findByText('My personal card');
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1);
    expect(
      requests.find((item) => item.method === 'POST' && item.url === '/api/catalog/services')?.body,
    ).toMatchObject({ scope: 'personal', credentialType: 'none' });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Nome do serviço/card'));
    await user.type(screen.getByLabelText('Nome do serviço/card'), 'Edited personal card');
    await user.click(screen.getByRole('button', { name: 'Salvar card' }));
    await screen.findByText('Edited personal card');
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Excluir Edited personal card' })).getByRole(
        'button',
        { name: 'Confirmar exclusão' },
      ),
    );
    await waitFor(() => expect(screen.queryByText('Edited personal card')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Personalização' }));
    expect(screen.getByRole('note').textContent).toContain('Personalização pessoal');
    const company = screen.getByRole('textbox', { name: 'Nome da empresa' });
    await user.clear(company);
    await user.type(company, 'My own hub');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Personalização pessoal salva.');
    expect(preferences.themeOverrides).toMatchObject({ companyName: 'My own hub' });
    expect(saved.companyName).toBe('Empresa da API');
    expect(requests.some((item) => item.method === 'PUT' && item.url === '/api/config')).toBe(
      false,
    );
    await user.click(screen.getByRole('button', { name: 'Restaurar padrão da empresa' }));
    await screen.findByText('Padrão da empresa restaurado.');
    expect(
      (screen.getByRole('textbox', { name: 'Nome da empresa' }) as HTMLInputElement).value,
    ).toBe('Empresa da API');
    expect(preferences.themeOverrides).toBeNull();
    expect((screen.getByRole('button', { name: 'Equipe' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Auditoria' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  }, 15000);

  it('removes shared credential fields when an admin chooses personal scope', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Catálogo' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar serviço' }));
    await user.selectOptions(screen.getByLabelText('Tipo de Acesso / Cofre'), 'shared');
    await user.selectOptions(screen.getByLabelText('Escopo'), 'personal');
    expect(screen.queryByLabelText('Senha do serviço')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Cofre Compartilhado (equipe)' })).toBeNull();
  });

  it('uses only the current user cache offline and rejects denied preference writes', async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    localStorage.setItem(
      'hublink:preferences:admin',
      JSON.stringify({ ...defaultPreferences, homeLayout: 'list' }),
    );
    localStorage.setItem(
      'hublink:preferences:someone-else',
      JSON.stringify({ ...defaultPreferences, showShortcutCards: false }),
    );
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (args[0] === '/api/me/preferences') {
        if (args[1]?.method) return { ok: false, status: 403 } as Response;
        throw new TypeError('Offline');
      }
      return original(...args);
    });
    const user = userEvent.setup();
    const { container } = render(<App />);
    await screen.findByText('Empresa da API');
    expect(container.querySelector('.hb-service-list')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Ocultar atalhos' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Grade' }));
    await waitFor(() => expect(requests.some((item) => item.url === '/api/config')).toBe(true));
    expect(container.querySelector('.hb-service-list')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('hublink:preferences:admin')!).homeLayout).toBe('list');
  });
});

it('replays account-only preference changes after a network outage', async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let offline = false;
  vi.mocked(fetch).mockImplementation(async (...args) => {
    if (args[0] === '/api/me/preferences' && offline) throw new TypeError('Offline');
    return original(...args);
  });
  const user = userEvent.setup();
  const { container } = render(<App />);
  await screen.findByText('Empresa da API');
  offline = true;
  await user.click(screen.getByRole('button', { name: 'Lista' }));
  await waitFor(() => expect(container.querySelector('.hb-service-list')).not.toBeNull());
  await user.click(screen.getByRole('button', { name: 'Ocultar atalhos' }));
  await waitFor(() => expect(container.querySelector('.hb-shortcuts')).toBeNull());
  expect(preferences.homeLayout).toBe('grid');
  expect(localStorage.getItem('hublink:preferences:admin:pending')).not.toBeNull();
  offline = false;
  fireEvent(window, new Event('online'));
  await waitFor(() =>
    expect(preferences).toMatchObject({ homeLayout: 'list', showShortcutCards: false }),
  );
  expect(localStorage.getItem('hublink:preferences:admin:pending')).toBeNull();
});

it('edits company Home defaults through the admin preset', async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText('Empresa da API');
  await user.click(screen.getByRole('button', { name: 'Personalização' }));
  await user.selectOptions(screen.getByLabelText('Organização da Home'), 'carousel');
  await user.click(screen.getByRole('checkbox', { name: 'Mostrar atalhos' }));
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await screen.findByText('Alterações salvas na API local.');
  expect(saved).toMatchObject({ homeLayout: 'carousel', showShortcutCards: false });
  expect(requests.some((item) => item.method === 'PUT' && item.url === '/api/me/preferences')).toBe(
    false,
  );
});

describe('extension center and startup settings', () => {
  it('downloads the ZIP without navigation and copies installation instructions', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) =>
      args[0] === '/api/extension/package'
        ? ({ ok: true, blob: async () => new Blob(['PK']) } as Response)
        : original(...args),
    );
    const create = vi.fn().mockReturnValue('blob:extension-zip'),
      revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    try {
      render(<App />);
      const install = await screen.findByRole('button', { name: 'Instalar extensão' });
      expect(install.classList.contains('is-missing')).toBe(true);
      await user.click(install);
      const dialog = screen.getByRole('dialog', {
        name: 'Central da Extensão',
      });
      expect(
        within(dialog)
          .getByRole('checkbox', { name: 'Abrir Hublink ao iniciar o Chrome' })
          .hasAttribute('disabled') ||
          within(dialog)
            .getByRole('checkbox', { name: 'Abrir Hublink ao iniciar o Chrome' })
            .closest('fieldset')!.disabled,
      ).toBe(true);
      await user.click(screen.getByRole('button', { name: 'Copiar chrome://extensions' }));
      expect(writeText).toHaveBeenCalledWith('chrome://extensions');
      await user.click(screen.getByRole('button', { name: 'Baixar extensão (.zip)' }));
      await screen.findByText(/Pacote baixado/);
      expect(create).toHaveBeenCalled();
      expect(click).toHaveBeenCalled();
      const anchor = click.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('hublink-chrome-extension.zip');
      expect(anchor.href).toBe('blob:extension-zip');
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(install);
    } finally {
      click.mockRestore();
    }
  });
  it('reads and updates all three flags through a confirmed extension bridge', async () => {
    const settings = { openOnStartup: false, openOnNewTab: false, showToastNotifications: true };
    const messages: unknown[] = [];
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (
          _id: string,
          msg: { type: string; settings?: object },
          callback: (value: unknown) => void,
        ) => {
          messages.push(msg);
          Object.assign(settings, msg.settings);
          callback({ status: 'ok', settings: { ...settings } });
        },
      },
    });
    const user = userEvent.setup();
    render(<App />);
    const active = await screen.findByRole('button', { name: 'Extensão ativa' });
    expect(active.classList.contains('is-detected')).toBe(true);
    await user.click(screen.getByRole('button', { name: /Menu do usuário/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Central da Extensão' }));
    for (const [label, key, value] of [
      ['Abrir Hublink ao iniciar o Chrome', 'openOnStartup', true],
      ['Abrir Hublink em uma Nova Guia', 'openOnNewTab', true],
      ['Avisos de preenchimento assistido', 'showToastNotifications', false],
    ] as const) {
      await user.click(screen.getByRole('checkbox', { name: label }));
      await waitFor(() =>
        expect(messages).toContainEqual({
          type: 'UPDATE_EXTENSION_SETTINGS',
          settings: { [key]: value },
        }),
      );
      expect((screen.getByRole('checkbox', { name: label }) as HTMLInputElement).checked).toBe(
        value,
      );
    }
    await user.click(screen.getByRole('button', { name: 'Verificar conexão agora' }));
    await screen.findByText('Conexão confirmada.');
    expect(requests.some((request) => request.url === '/api/vault/tickets')).toBe(false);
  });
  it('reports a failed package download and can reconnect after installation', async () => {
    const user = userEvent.setup();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) =>
      args[0] === '/api/extension/package'
        ? ({ ok: false, json: async () => ({ error: 'Execute npm run build.' }) } as Response)
        : original(...args),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Instalar extensão' }));
    await user.click(screen.getByRole('button', { name: 'Baixar extensão (.zip)' }));
    await screen.findByText('Execute npm run build.');
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (_id: string, _msg: unknown, callback: (reply: unknown) => void) =>
          callback({
            status: 'ok',
            settings: { openOnStartup: false, openOnNewTab: false, showToastNotifications: true },
          }),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Verificar conexão agora' }));
    await screen.findByText('Conexão confirmada.');
    expect(
      screen.getByRole('button', { name: 'Extensão ativa' }).classList.contains('is-detected'),
    ).toBe(true);
  });
});

describe('TICKET-018 workspace polish', () => {
  it('uses icon layouts, clean grid cards and category sections with persisted choices', async () => {
    const user = userEvent.setup();
    catalogItems.push({ ...catalogItems[0], id: 'crm', name: 'Customer portal', category: 'crm' });
    const { container } = render(<App />);
    await screen.findByText('Empresa da API');
    expect(container.querySelector('.hb-grid .hb-badge')).toBeNull();
    const switcher = screen.getByRole('group', { name: 'Modo de exibição dos serviços' });
    expect(within(switcher).getAllByRole('button')).toHaveLength(5);
    for (const button of within(switcher).getAllByRole('button')) {
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.textContent).toBe('');
      expect(button.title).toBe(button.getAttribute('aria-label'));
    }
    await user.click(screen.getByRole('button', { name: 'Compacto' }));
    await waitFor(() => expect(preferences.homeLayout).toBe('compact'));
    expect(container.querySelectorAll('.hb-compact-grid .hb-service')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Seções' }));
    await waitFor(() => expect(preferences.homeLayout).toBe('sections'));
    expect(
      within(screen.getByRole('region', { name: 'SVAs' })).getByRole('heading', {
        name: 'SVAs 1',
      }),
    ).not.toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'CRM' })).getByRole('heading', {
        name: 'CRM 2',
      }),
    ).not.toBeNull();
    await user.selectOptions(screen.getByLabelText('Categoria dos serviços'), 'crm');
    await user.selectOptions(screen.getByLabelText('Tipo de acesso'), 'individual');
    expect(screen.getByText('0 serviços encontrados')).not.toBeNull();
  });

  it('reorders list services and shortcuts by drag/drop and keyboard, with account persistence', async () => {
    const user = userEvent.setup();
    let view = render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Lista' }));
    await waitFor(() => expect(view.container.querySelectorAll('.hb-service-row')).toHaveLength(2));
    const source = screen.getByRole('button', { name: 'Configurar Sem destino' });
    const target = screen.getByRole('link', { name: 'Abrir PARTIU!' });
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await waitFor(() => expect(preferences.cardOrder).toEqual(['pending', 'partiu']));
    fireEvent.keyDown(source, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(preferences.cardOrder).toEqual(['partiu', 'pending']));
    const shortcuts = view.container.querySelector('.hb-shortcuts')!;
    const first = within(shortcuts as HTMLElement).getByRole('button', { name: /Catálogo/ });
    const last = within(shortcuts as HTMLElement).getByRole('button', { name: /Personalização/ });
    fireEvent.dragStart(last);
    fireEvent.dragOver(first);
    fireEvent.drop(first);
    await waitFor(() =>
      expect(preferences.shortcutOrder).toEqual(['identidade', 'catalogo', 'cofre', 'equipe']),
    );
    fireEvent.keyDown(last, { key: 'ArrowRight', altKey: true });
    await waitFor(() =>
      expect(preferences.shortcutOrder).toEqual(['catalogo', 'identidade', 'cofre', 'equipe']),
    );
    expect(screen.getByRole('button', { name: 'Ocultar atalhos' }).textContent).toBe('');
    await user.click(
      screen
        .getByRole('navigation', { name: 'Telas do Workspace' })
        .querySelector('button:last-child')!,
    );
    const settings = screen.getByRole('group', { name: 'Preferências da Home' });
    expect(settings.classList.contains('setting-group')).toBe(true);
    await user.selectOptions(within(settings).getByLabelText('Formato dos seus atalhos'), 'chips');
    await waitFor(() => expect(preferences.shortcutStyle).toBe('chips'));
    view.unmount();
    view = render(<App />);
    await screen.findByText('Empresa da API');
    expect(view.container.querySelector('.hb-shortcut-chips')).not.toBeNull();
    expect(view.container.querySelectorAll('.hb-shortcut b')[1]!.textContent).toBe(
      'Personalização',
    );
    expect(preferences.homeLayout).toBe('list');
  });

  it('cycles carousel pages indefinitely and pauses on hover, focus and explicit pause', async () => {
    const user = userEvent.setup();
    catalogItems.push(
      ...Array.from({ length: 3 }, (_, i) => ({
        ...catalogItems[0],
        id: `extra-${i}`,
        name: `Extra ${i}`,
      })),
    );
    const { container } = render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Carrossel' }));
    const carousel = await screen.findByRole('region', { name: 'Carrossel de serviços' });
    const track = container.querySelector('.hb-carousel-track') as HTMLElement;
    expect(track.style.animationPlayState).toBe('running');
    fireEvent.mouseEnter(carousel);
    expect(track.style.animationPlayState).toBe('paused');
    fireEvent.mouseLeave(carousel);
    expect(track.style.animationPlayState).toBe('running');
    // jsdom has no AnimationEvent constructor; React registers the WebKit fallback.
    fireEvent(track, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(
      screen.getByRole('button', { name: 'Ir para página 2' }).getAttribute('aria-current'),
    ).toBe('true');
    // jsdom has no AnimationEvent constructor; React registers the WebKit fallback.
    fireEvent(track, new Event('webkitAnimationEnd', { bubbles: true }));
    expect(
      screen.getByRole('button', { name: 'Ir para página 1' }).getAttribute('aria-current'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Slide anterior' }));
    expect(
      screen.getByRole('button', { name: 'Ir para página 2' }).getAttribute('aria-current'),
    ).toBe('true');
    const next = screen.getByRole('button', { name: 'Próximo slide' });
    fireEvent.focus(next);
    expect(track.style.animationPlayState).toBe('paused');
    fireEvent.blur(next, { relatedTarget: document.body });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar carrossel' }));
    expect(track.style.animationPlayState).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: 'Retomar carrossel' }));
    expect(track.style.animationPlayState).toBe('running');
    expect(container.querySelectorAll('.hb-carousel-page[inert][aria-hidden="true"]')).toHaveLength(
      2,
    );
  });

  it('disables carousel animation for reduced motion and retains manual navigation', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const user = userEvent.setup();
    catalogItems.push(
      ...Array.from({ length: 3 }, (_, i) => ({ ...catalogItems[0], id: `extra-${i}` })),
    );
    const { container } = render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Carrossel' }));
    await screen.findByRole('region', { name: 'Carrossel de serviços' });
    expect((container.querySelector('.hb-carousel-track') as HTMLElement).style.animationName).toBe(
      'none',
    );
    expect(screen.queryByRole('button', { name: 'Pausar carrossel' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Próximo slide' }));
    expect(
      screen.getByRole('button', { name: 'Ir para página 2' }).getAttribute('aria-current'),
    ).toBe('true');
  });

  it('offers the configured official store with offline fallback and a primary connection check', async () => {
    vi.stubEnv(
      'VITE_CHROME_WEBSTORE_URL',
      'https://chromewebstore.google.com/detail/hublink/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Instalar extensão' }));
    const dialog = screen.getByRole('dialog', { name: 'Central da Extensão' });
    expect(dialog.querySelector('.extension-center-wide')).not.toBeNull();
    const install = within(dialog).getByRole('link', { name: 'Adicionar ao Chrome (1 clique)' });
    expect(install.getAttribute('rel')).toBe('noopener noreferrer');
    expect(install.getAttribute('target')).toBe('_blank');
    expect(install.getAttribute('href')).toContain('chromewebstore.google.com/detail/hublink/');
    expect(
      within(dialog)
        .getByRole('button', { name: 'Verificar conexão agora' })
        .classList.contains('button-primary'),
    ).toBe(true);
    expect(within(dialog).queryByRole('list')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Instalação offline (.zip)' }));
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(3);
    await user.click(within(dialog).getByRole('button', { name: 'Voltar à Chrome Web Store' }));
    expect(within(dialog).queryByRole('list')).toBeNull();
  });

  it('uses local installation for an invalid store URL and hides installation after confirmed detection', async () => {
    vi.stubEnv(
      'VITE_CHROME_WEBSTORE_URL',
      'https://chromewebstore.google.com.example.test/detail/anything',
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Instalar extensão' }));
    expect(screen.queryByRole('link', { name: 'Adicionar ao Chrome (1 clique)' })).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: (_id: string, _msg: unknown, callback: (reply: unknown) => void) =>
          callback({ status: 'ok' }),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Verificar conexão agora' }));
    await screen.findByText('Conectada e pronta');
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Baixar extensão (.zip)' })).toBeNull();
    expect(
      (screen.getByRole('group', { name: 'Configurações do Chrome' }) as HTMLFieldSetElement)
        .disabled,
    ).toBe(false);
  });
});

describe('TICKET-019 profile', () => {
  it('saves personal identity and rejects mismatched password confirmation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Menu do usuário/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Meu Perfil' }));
    expect(screen.getByRole('heading', { name: 'Meu Perfil' })).not.toBeNull();
    await user.clear(screen.getByLabelText('Nome de exibição'));
    await user.type(screen.getByLabelText('Nome de exibição'), 'Novo Nome');
    await user.clear(screen.getByLabelText('E-mail'));
    await user.type(screen.getByLabelText('E-mail'), 'new@example.test');
    await user.type(screen.getByLabelText('Senha atual'), 'synthetic-current');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Perfil atualizado com sucesso.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Menu do usuário: Novo Nome' })).not.toBeNull();
    expect(requests.find((item) => item.url === '/api/auth/profile')?.body).toEqual({
      displayName: 'Novo Nome',
      email: 'new@example.test',
      currentPassword: 'synthetic-current',
      avatar: null,
    });
    await user.type(screen.getByLabelText('Senha atual'), 'synthetic-current');
    await user.type(screen.getByLabelText('Nova senha'), 'synthetic-new');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'different');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(screen.getByText('A confirmação da nova senha não confere.')).not.toBeNull();
    expect(requests.filter((item) => item.url === '/api/auth/profile')).toHaveLength(1);
  });
});

describe('TICKET-019 extension checks', () => {
  it('polls silently and keeps the manual spinner for 600 ms without losing connectivity', async () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const sendMessage = vi.fn((_id: string, _msg: unknown, callback: (value: unknown) => void) =>
      callback({
        status: 'ok',
        settings: { openOnStartup: false, openOnNewTab: false, showToastNotifications: true },
      }),
    );
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const hook = renderHook(() => {
      const state = useWorkspaceState();
      const bridge = useExtensionBridge(state);
      states.push(state.extensionState);
      return { state, bridge };
    });
    try {
      await act(async () => {});
      expect(hook.result.current.state.extensionState).toBe('detected');
      states.length = 0;
      act(() => hook.result.current.state.setShowExtensionGuide(true));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(states).not.toContain('checking');
      let check: Promise<boolean>;
      act(() => {
        check = hook.result.current.bridge.recheckExtension();
      });
      expect(hook.result.current.bridge.extensionChecking).toBe(true);
      expect(hook.result.current.state.extensionState).toBe('detected');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(599);
      });
      expect(hook.result.current.bridge.extensionChecking).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
        expect(await check!).toBe(true);
      });
      expect(hook.result.current.bridge.extensionChecking).toBe(false);
    } finally {
      hook.unmount();
      vi.useRealTimers();
    }
  });
});

it('shows audit only for administrators, with server-side pagination and filters', async () => {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (!url.startsWith('/api/admin/audit?')) return originalFetch(url, options);
      requests.push({ url, method: 'GET' });
      return {
        ok: true,
        json: async () => ({
          total: 51,
          events: [
            {
              id: new URL(url, 'https://example.test').searchParams.get('offset'),
              action: 'login_success',
              actorEmail: 'actor@example.test',
              actorUserId: 'actor',
              targetType: 'system',
              targetId: null,
              ip: '192.0.2.4',
              createdAt: '2026-01-01T12:00:00Z',
            },
          ],
        }),
      };
    }),
  );
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Auditoria' }));
  expect(await screen.findByRole('table', { name: 'Logs de auditoria' })).toBeTruthy();
  expect(await screen.findByText('actor@example.test')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
  await waitFor(() => expect(requests.some((r) => r.url.includes('offset=50'))).toBe(true));
  await userEvent.type(screen.getByLabelText('Ação', { exact: true }), 'login_success');
  await userEvent.click(screen.getByRole('button', { name: 'Filtrar auditoria' }));
  await waitFor(() =>
    expect(requests.some((r) => r.url.includes('offset=0&action=login_success'))).toBe(true),
  );
  cleanup();
  signedInUser = { ...admin, role: 'attendant' };
  requests = [];
  render(<App />);
  await screen.findByRole('button', { name: 'Catálogo' });
  expect(screen.queryByRole('table', { name: 'Logs de auditoria' })).toBeNull();
  expect(requests.some((r) => r.url.startsWith('/api/admin/audit'))).toBe(false);
});

it('lets an administrator retry an audit query after a network failure', async () => {
  let attempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (++attempts === 1) throw new Error('Synthetic offline');
      return { ok: true, json: async () => ({ events: [], total: 0 }) };
    }),
  );
  render(<AuditView />);
  await screen.findByText('Não foi possível carregar a auditoria.');
  await userEvent.click(screen.getByRole('button', { name: 'Filtrar auditoria' }));
  await screen.findByText('Nenhum evento encontrado.');
  expect(attempts).toBe(2);
});
