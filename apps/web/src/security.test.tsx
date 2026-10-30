// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useWorkspaceState } from './hooks/useWorkspaceState';
import { useCatalog } from './hooks/useCatalog';
import { useVault } from './hooks/useVault';
import { useTeam } from './hooks/useTeam';
import { useAuth } from './hooks/useAuth';
import { useServiceFavicon } from './hooks/useServiceFavicon';
import type { User } from './types';

const first: User = {
  id: 'first',
  displayName: 'First',
  email: 'first@example.test',
  role: 'admin',
};
const second: User = {
  id: 'second',
  displayName: 'Second',
  email: 'second@example.test',
  role: 'attendant',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('a late catalog response from the previous account never replaces the next account catalog', async () => {
  const old = deferred<unknown>();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => old.promise })
    .mockResolvedValue({ ok: true, json: async () => ({ services: [{ id: 'second-private' }] }) });
  vi.stubGlobal('fetch', fetch);
  const { result } = renderHook(() => {
    const state = useWorkspaceState();
    useCatalog(state, { loadVaultCredentials: async () => true });
    return state;
  });
  act(() => result.current.setCurrentUser(first));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  act(() => result.current.setCurrentUser(second));
  await waitFor(() => expect(result.current.catalog[0]?.id).toBe('second-private'));
  await act(async () => {
    old.resolve({ services: [{ id: 'first-private' }] });
    await old.promise;
  });
  expect(result.current.catalog.map((item) => item.id)).toEqual(['second-private']);
});

it('late credential metadata is ignored after logout', async () => {
  const old = deferred<unknown>();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => old.promise }));
  const { result } = renderHook(() => {
    const state = useWorkspaceState();
    useVault(state, { loadCatalog: async () => {}, openVaultService: async () => {} });
    return state;
  });
  act(() => {
    result.current.setCurrentUser(first);
    result.current.setPage('cofre');
  });
  await act(async () => {});
  act(() => result.current.setCurrentUser(null));
  await act(async () => {
    old.resolve({ credentials: [{ serviceId: 'first-private' }] });
    await old.promise;
  });
  expect(result.current.vaultCredentials).toEqual([]);
});

it('late team information is ignored after the account changes', async () => {
  const old = deferred<unknown>();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => old.promise }));
  const { result } = renderHook(() => {
    const state = useWorkspaceState();
    useTeam(state);
    return state;
  });
  act(() => {
    result.current.setCurrentUser(first);
    result.current.setPage('equipe');
  });
  await act(async () => {});
  act(() => result.current.setCurrentUser(second));
  await act(async () => {
    old.resolve({ users: [{ ...first, createdAt: '2026-10-28T00:00:00Z' }] });
    await old.promise;
  });
  expect(result.current.managedUsers).toEqual([]);
});

it('a late profile save cannot restore the previous authenticated identity', async () => {
  const old = deferred<unknown>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/auth/me' ? { ok: false } : { ok: true, json: () => old.promise },
      ),
    ),
  );
  const { result } = renderHook(() => {
    const state = useWorkspaceState();
    return { ...state, ...useAuth(state) };
  });
  act(() => result.current.setCurrentUser(first));
  let saving!: Promise<void>;
  act(() => {
    saving = result.current.updateProfile({
      displayName: 'Changed',
      email: first.email,
      avatar: null,
    });
  });
  act(() => result.current.setCurrentUser(second));
  await act(async () => {
    old.resolve({ user: { ...first, displayName: 'Changed' } });
    await saving;
  });
  expect(result.current.currentUser?.id).toBe(second.id);
});

it('favicon requests omit private paths, query parameters and fragments, and ignore a stale result', async () => {
  const old = deferred<unknown>();
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => old.promise });
  vi.stubGlobal('fetch', fetch);
  const initialLogo = 'data:image/png;base64,aW5pdGlhbA==';
  const url = 'https://portal.example.test/private/path?token=synthetic-secret#private';
  const { result, rerender } = renderHook(
    ({ url }) =>
      useServiceFavicon({ targetUrl: url, setTargetUrl: vi.fn(), initialLogoDataUrl: initialLogo }),
    { initialProps: { url } },
  );
  let request!: Promise<void>;
  act(() => {
    request = result.current.fetchFaviconForUrl(url, true);
  });
  expect(fetch).toHaveBeenCalledWith('/api/catalog/favicon?url=https%3A%2F%2Fportal.example.test');
  rerender({ url: 'https://different.example.test/' });
  await act(async () => {
    old.resolve({ logoDataUrl: 'data:image/png;base64,b2xk' });
    await request;
  });
  expect(result.current.logoDataUrl).toBe(initialLogo);
});

it('a manual favicon capture is not cancelled by the automatic lookup its URL normalization triggers', async () => {
  const response = deferred<unknown>();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => response.promise })
    .mockResolvedValue({ ok: true, json: async () => ({ logoDataUrl: null }) });
  vi.stubGlobal('fetch', fetch);
  let current = 'portal.example.test';
  const { result, rerender } = renderHook(() =>
    useServiceFavicon({
      targetUrl: current,
      setTargetUrl: (value) => {
        current = typeof value === 'function' ? value(current) : value;
      },
    }),
  );
  let request!: Promise<void>;
  act(() => {
    result.current.setManualLogo(false);
    request = result.current.fetchFaviconForUrl(current, true);
  });
  expect(current).toBe('https://portal.example.test/');
  rerender();
  // Wait past the automatic debounce; previously it re-requested and discarded this capture.
  await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
  await act(async () => {
    response.resolve({
      logoDataUrl: 'data:image/png;base64,aWNvbg==',
      host: 'portal.example.test',
    });
    await request;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.current.faviconStatus).toBe('captured');
  expect(result.current.logoDataUrl).toBe('data:image/png;base64,aWNvbg==');
});
