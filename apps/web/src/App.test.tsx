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
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
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
      (screen.getByRole('button', { name: 'Personalizar hub' }) as HTMLButtonElement).disabled,
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
      (screen.getByRole('button', { name: 'Personalizar hub' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('closes with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = await screen.findByRole('button', { name: 'Personalizar hub' });
    await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'Fechar ajustes' });
    expect(document.activeElement).toBe(close);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Fechar ajustes' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('uploads a private card logo, previews it, and renders it in the card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar card' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome do serviço/card' }), 'Novo card');
    await user.type(screen.getByRole('textbox', { name: 'Endereço HTTPS' }), 'https://example.net');
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Enviar logo') as HTMLInputElement, image);
    expect(await screen.findByAltText('Prévia da logo do card')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Salvar card' }));
    const card = screen.getByRole('link', { name: /Novo card/ });
    expect(card.querySelector('.card-icon img')?.getAttribute('src')).toMatch(
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
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar hub' }));
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
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar no Hublink' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: /PARTIU!/ })).toBeNull();
  });

  it('renders vault credentials and allows an admin to reveal them', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    expect(await screen.findByText('Cofre de Credenciais (SVA)')).not.toBeNull();
    await waitFor(() => expect(screen.getAllByText('PARTIU!').length).toBeGreaterThan(0));
    const revealBtn = await screen.findByRole('button', { name: 'Revelar' });
    await user.click(revealBtn);
    expect(await screen.findByText('partiu_mock_user')).not.toBeNull();
    expect(await screen.findByText('partiu_mock_password')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByText('partiu_mock_user')).toBeNull();
  });

  it('lets an admin create an individual catalog card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    const trigger = await screen.findByRole('button', { name: '+ Adicionar card' });
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
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    expect(await screen.findByText('Cofre de Credenciais (SVA)')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '+ Adicionar card' })).toBeNull();
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
    expect(await screen.findByText('Senha pendente')).not.toBeNull();
    expect(screen.getByTitle('Em configuração').getAttribute('href')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cadastrar/Alterar minha senha' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    expect(screen.queryByRole('button', { name: '+ Adicionar card' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });

  it('shows shared credential fields only for shared access', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar card' }));
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

  it('lets an attendant start their own credential for a new individual service', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    expect(await screen.findByText('Individual Service')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
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
    await user.click(screen.getByRole('button', { name: 'Cadastrar/Alterar minha senha' }));
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
