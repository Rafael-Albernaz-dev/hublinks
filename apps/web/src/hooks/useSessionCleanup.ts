import { useEffect } from 'react';
import type { WorkspaceState } from './useWorkspaceState';
export function useSessionCleanup({
  setIndividualModal,
  setIndividualUsername,
  setIndividualPassword,
  currentUser,
  setPage,
  setManagedUsers,
  setVaultCredentials,
  setEditingVaultKey,
  setVaultUsername,
  setVaultPassword,
  setAdminPassword,
  setResetPassword,
}: Pick<
  WorkspaceState,
  | 'setIndividualModal'
  | 'setIndividualUsername'
  | 'setIndividualPassword'
  | 'currentUser'
  | 'setPage'
  | 'setManagedUsers'
  | 'setVaultCredentials'
  | 'setEditingVaultKey'
  | 'setVaultUsername'
  | 'setVaultPassword'
  | 'setAdminPassword'
  | 'setResetPassword'
>) {
  useEffect(() => {
    if (currentUser) return;
    setPage('inicio');
    setManagedUsers([]);
    setVaultCredentials([]);
    setEditingVaultKey(null);
    setVaultUsername('');
    setVaultPassword('');
    setAdminPassword('');
    setResetPassword('');
    setIndividualModal(null);
    setIndividualUsername('');
    setIndividualPassword('');
  }, [currentUser]);
}
