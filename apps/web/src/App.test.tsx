// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { DEFAULT_CONFIG, STORAGE_KEY } from './config';

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('demo customization', () => {
  it('edits the brand color and links, then restores them from local storage', async () => {
    const user = userEvent.setup();
    const view = render(<App />);

    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    const company = screen.getByRole('textbox', { name: 'Nome da empresa' });
    await user.clear(company);
    await user.type(company, 'Cliente Exemplo');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'R' }), { target: { value: '255' } });
    await user.click(screen.getByRole('button', { name: '+ Adicionar link' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome do link' }), 'Portal público');
    await user.type(screen.getByRole('textbox', { name: 'Endereço HTTPS' }), 'https://example.net');
    await user.click(screen.getByRole('button', { name: 'Salvar link' }));

    expect(screen.getByRole('link', { name: /Portal público/ }).getAttribute('href')).toBe(
      'https://example.net/',
    );
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').companyName).toBe(
        'Cliente Exemplo',
      ),
    );
    view.unmount();

    render(<App />);
    expect(screen.getByRole('heading', { name: /Tudo o que sua equipe precisa/ })).not.toBeNull();
    expect(screen.getByText('Cliente Exemplo')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Portal público/ }).getAttribute('href')).toBe(
      'https://example.net/',
    );
  });

  it('accepts a local PNG logo without sending it to the API', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    const image = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
    await user.upload(document.querySelector('#logo-upload') as HTMLInputElement, image);

    expect(await screen.findByAltText('Logo atual')).not.toBeNull();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').logoDataUrl).toMatch(
        /^data:image\/png;base64,/,
      ),
    );
  });

  it('imports a valid portable JSON configuration', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Personalizar hub' }));
    const imported = {
      ...DEFAULT_CONFIG,
      companyName: 'Outra Empresa',
      links: [
        { id: 'publico', title: 'Página pública', description: '', url: 'https://example.net/' },
      ],
    };
    const file = new File([JSON.stringify(imported)], 'config.json', { type: 'application/json' });
    await user.upload(document.querySelector('#config-import') as HTMLInputElement, file);

    expect(await screen.findByText('Outra Empresa')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Página pública/ }).getAttribute('href')).toBe(
      'https://example.net/',
    );
  });
});
