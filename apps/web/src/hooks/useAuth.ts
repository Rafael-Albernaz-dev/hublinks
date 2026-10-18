import type { FormEvent } from 'react';
import { useEffect } from 'react';
import { DEFAULT_CONFIG } from '../config';
import type { User } from '../types';
import type { WorkspaceState } from './useWorkspaceState';
function readUser(value: unknown): User {
  if (typeof value !== 'object' || value === null || !('user' in value))
    throw new Error('Invalid user');
  const user = value.user;
  if (
    typeof user !== 'object' ||
    user === null ||
    !('id' in user) ||
    typeof user.id !== 'string' ||
    !('displayName' in user) ||
    typeof user.displayName !== 'string' ||
    !('email' in user) ||
    typeof user.email !== 'string' ||
    !('role' in user) ||
    (user.role !== 'admin' && user.role !== 'attendant')
  ) {
    throw new Error('Invalid user');
  }
  return { id: user.id, displayName: user.displayName, email: user.email, role: user.role };
}
export function useAuth(
  state: Pick<
    WorkspaceState,
    | 'setCurrentUser'
    | 'setAuthChecked'
    | 'setAuthBusy'
    | 'setLoginError'
    | 'loginEmail'
    | 'loginPassword'
    | 'setLoginPassword'
    | 'setConfig'
    | 'setColorChosen'
    | 'setPersisted'
    | 'setApiState'
    | 'setPage'
    | 'setManagedUsers'
    | 'setNotice'
  >,
) {
  const {
    setCurrentUser,
    setAuthChecked,
    setAuthBusy,
    setLoginError,
    loginEmail,
    loginPassword,
    setLoginPassword,
    setConfig,
    setColorChosen,
    setPersisted,
    setApiState,
    setPage,
    setManagedUsers,
    setNotice,
  } = state;

  useEffect(() => {
    const controller = new AbortController();
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/me', { signal: controller.signal });
        if (response.ok) setCurrentUser(readUser(await response.json()));
      } catch {
        // The login screen also handles a temporarily unavailable API.
      } finally {
        if (!controller.signal.aborted) setAuthChecked(true);
      }
    }
    void checkAuth();
    return () => controller.abort();
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setLoginError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!response.ok) throw new Error('Credenciais inválidas ou API indisponível.');
      setCurrentUser(readUser(await response.json()));
      setLoginPassword('');
    } catch {
      setLoginError('Credenciais inválidas ou API indisponível.');
    } finally {
      setAuthBusy(false);
    }
  }
  async function logout() {
    setAuthBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Could not log out');
      setCurrentUser(null);
      setConfig(DEFAULT_CONFIG);
      setColorChosen(false);
      setPersisted(null);
      setApiState('loading');
      setPage('inicio');
      setManagedUsers([]);
    } catch {
      setNotice('Não foi possível sair. Tente novamente.');
    } finally {
      setAuthBusy(false);
    }
  }
  return { login, logout };
}
