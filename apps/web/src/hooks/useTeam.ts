import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
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
  const [adminRole, setAdminRole] = useState<'admin' | 'attendant'>('attendant');
  const activeId = useRef(currentUser?.id);
  activeId.current = currentUser?.id;

  useEffect(() => {
    if (page !== 'equipe' || currentUser?.role !== 'admin') return;
    void refreshUsers();
  }, [page, currentUser]);
  async function refreshUsers() {
    const ownerId = currentUser?.id;
    try {
      const response = await fetch('/api/admin/users');
      if (activeId.current !== ownerId) return;
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Could not list users');
      const data: unknown = await response.json();
      if (activeId.current !== ownerId) return;
      if (
        typeof data !== 'object' ||
        data === null ||
        !('users' in data) ||
        !Array.isArray(data.users)
      ) {
        throw new Error('Invalid users');
      }
      setManagedUsers(
        data.users
          .filter(
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
          )
          .map((user) => ({
            ...user,
            active: typeof user.active === 'boolean' ? user.active : true,
          })),
      );
    } catch {
      if (activeId.current !== ownerId) return;
      setAdminNotice('Não foi possível carregar os usuários da equipe.');
    }
  }
  async function createAttendant(event: FormEvent<HTMLFormElement>): Promise<boolean> {
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
          role: adminRole,
        }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return false;
      }
      if (!response.ok) throw new Error('Could not create user');
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
      setAdminRole('attendant');
      setAdminNotice('Usuário cadastrado com sucesso.');
      await refreshUsers();
      return true;
    } catch {
      setAdminNotice('Não foi possível cadastrar o usuário. Verifique os dados e o e-mail.');
      return false;
    }
  }
  async function updateManagedUser(
    id: string,
    input: {
      displayName: string;
      email: string;
      role: 'admin' | 'attendant';
      active: boolean;
    },
  ): Promise<boolean> {
    setAdminNotice('');
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return false;
      }
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Não foi possível atualizar o usuário.');
      }
      setAdminNotice('Permissões e dados do usuário atualizados.');
      await refreshUsers();
      return true;
    } catch (cause) {
      setAdminNotice(
        cause instanceof Error ? cause.message : 'Não foi possível atualizar o usuário.',
      );
      return false;
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
  return {
    refreshUsers,
    createAttendant,
    updateManagedUser,
    changePassword,
    adminRole,
    setAdminRole,
  };
}
