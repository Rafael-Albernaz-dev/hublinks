// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { DEFAULT_CONFIG } from './config';
import type { HubConfig } from './config';

const apiConfig = {
  ...DEFAULT_CONFIG,
  companyName: 'Empresa da API',
  links: [{ id: 'site', title: 'Site público', description: '', url: 'https://example.com/' }],
};
let saved: HubConfig = apiConfig;
let requests: Array<{ method: string; body?: unknown }> = [];
let authenticated = true;
const admin = {
  id: 'admin',
  displayName: 'Administrador',
  email: 'admin@example.test',
  role: 'admin',
};

beforeEach(() => {
  saved = structuredClone(apiConfig);
  requests = [];
  authenticated = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET';
      requests.push({
        method,
        body: options?.body ? JSON.parse(options.body as string) : undefined,
      });
      if (url === '/api/auth/me')
        return {
          ok: authenticated,
          status: authenticated ? 200 : 401,
          json: async () => ({ user: admin }),
        };
      if (url === '/api/auth/login') {
        authenticated = true;
        return { ok: true, json: async () => ({ user: admin }) };
      }
      if (url === '/api/auth/logout') {
        authenticated = false;
        return { ok: true };
      }
      if (url === '/api/admin/users') return { ok: true, json: async () => ({ users: [] }) };
      if (method === 'PUT') saved = JSON.parse(options?.body as string);
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
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Não foi possível conectar à API'),
    );
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
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Não foi possível conectar à API'),
    );
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

  it('uploads a card logo, previews it, and renders it in the card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Empresa da API');
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    await user.click(screen.getByRole('button', { name: '+ Adicionar link' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome do link' }), 'Novo card');
    await user.type(screen.getByRole('textbox', { name: 'Endereço HTTPS' }), 'https://example.net');
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'card.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Enviar logo') as HTMLInputElement, image);
    expect(await screen.findByAltText('Prévia da logo do card')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Salvar link' }));
    const card = screen.getByRole('link', { name: /Novo card/ });
    expect(card.querySelector('.card-icon img')?.getAttribute('src')).toMatch(
      /^data:image\/png;base64,/,
    );
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(saved.links).toHaveLength(2));
    expect(saved.links[1]?.logoDataUrl).toMatch(/^data:image\/png;base64,/);
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
    expect(screen.queryByRole('link', { name: /Site público/ })).toBeNull();
  });

  it('unlocks links after login and returns to login after logout', async () => {
    authenticated = false;
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: 'E-mail' }), 'admin@example.test');
    await user.type(screen.getByLabelText('Senha'), 'synthetic-password');
    await user.click(screen.getByRole('button', { name: 'Entrar no Hublink' }));
    expect(await screen.findByRole('link', { name: /Site público/ })).not.toBeNull();
    expect(screen.getByText('Administrador')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar no Hublink' })).not.toBeNull();
    expect(screen.queryByRole('link', { name: /Site público/ })).toBeNull();
  });
});
