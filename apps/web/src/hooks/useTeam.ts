import type { FormEvent } from 'react';
import { useEffect } from 'react';
import type { ManagedUser } from '../types';
import type { WorkspaceState } from './useWorkspaceState';
export function useTeam(
  state: Pick<
    WorkspaceState,
    | 'page'
    | 'currentUser'
    | 'setCurrentUser'
    | 'setManagedUsers'
    | 'setAdminNotice'
    | 'adminName'
    | 'adminEmail'
    | 'adminPassword'
    | 'setAdminName'
    | 'setAdminEmail'
    | 'setAdminPassword'
    | 'resetPassword'
    | 'setResetPassword'
    | 'setResetId'
  >,
) {
  const {
    page,
    currentUser,
    setCurrentUser,
    setManagedUsers,
    setAdminNotice,
    adminName,
    adminEmail,
    adminPassword,
    setAdminName,
    setAdminEmail,
    setAdminPassword,
    resetPassword,
    setResetPassword,
    setResetId,
  } = state;

  useEffect(() => {
    if (page !== 'equipe' || currentUser?.role !== 'admin') return;
    void refreshUsers();
  }, [page, currentUser]);
  async function refreshUsers() {
    try {
      const response = await fetch('/api/admin/users');
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not list users');
      const data: unknown = await response.json();
      if (
        typeof data !== 'object' ||
        data === null ||
        !('users' in data) ||
        !Array.isArray(data.users)
      ) {
        throw new Error('Invalid users');
      }
      setManagedUsers(
        data.users.filter(
          (user): user is ManagedUser =>
            typeof user === 'object' &&
            user !== null &&
            'id' in user &&
            typeof user.id === 'string' &&
            'displayName' in user &&
            typeof user.displayName === 'string' &&
            'email' in user &&
            typeof user.email === 'string' &&
            'role' in user &&
            (user.role === 'admin' || user.role === 'attendant') &&
            'createdAt' in user &&
            typeof user.createdAt === 'string',
        ),
      );
    } catch {
      setAdminNotice('Não foi possível carregar os atendentes.');
    }
  }
  async function createAttendant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminNotice('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: adminName,
          email: adminEmail,
          password: adminPassword,
        }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not create user');
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminNotice('Atendente cadastrado.');
      await refreshUsers();
    } catch {
      setAdminNotice('Não foi possível cadastrar o atendente. Verifique os dados e o e-mail.');
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setAdminNotice('');
    try {
      const response = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not reset password');
      setResetPassword('');
      setResetId(null);
      setAdminNotice('Senha redefinida. As sessões anteriores foram revogadas.');
    } catch {
      setAdminNotice('Não foi possível redefinir a senha.');
    }
  }
  return { refreshUsers, createAttendant, changePassword };
}
