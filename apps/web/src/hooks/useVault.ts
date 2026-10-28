import type { FormEvent } from 'react';
import { useEffect, useRef } from 'react';
import type { VaultCredentialMeta } from '../types';
import type { WorkspaceActions } from '../types/actions';
import type { WorkspaceState } from './useWorkspaceState';
export function useVault(
  state: Pick<
    WorkspaceState,
    | 'individualModal'
    | 'individualUsername'
    | 'individualPassword'
    | 'setIndividualError'
    | 'setIndividualSaving'
    | 'setCatalog'
    | 'setIndividualModal'
    | 'setIndividualUsername'
    | 'setIndividualPassword'
    | 'setCurrentUser'
    | 'setVaultCredentials'
    | 'setVaultNotice'
    | 'page'
    | 'currentUser'
    | 'setVaultBusy'
    | 'vaultUsername'
    | 'vaultPassword'
    | 'setVaultUsername'
    | 'setVaultPassword'
    | 'setEditingVaultKey'
  >,
  actions: Pick<WorkspaceActions, 'openVaultService' | 'loadCatalog'>,
) {
  const {
    individualModal,
    individualUsername,
    individualPassword,
    setIndividualError,
    setIndividualSaving,
    setCatalog,
    setIndividualModal,
    setIndividualUsername,
    setIndividualPassword,
    setCurrentUser,
    setVaultCredentials,
    setVaultNotice,
    page,
    currentUser,
    setVaultBusy,
    vaultUsername,
    vaultPassword,
    setVaultUsername,
    setVaultPassword,
    setEditingVaultKey,
  } = state;
  const { loadCatalog, openVaultService } = actions;
  const activeId = useRef(currentUser?.id);
  activeId.current = currentUser?.id;
  async function loadVaultCredentials(): Promise<boolean> {
    const ownerId = currentUser?.id;
    try {
      const response = await fetch('/api/vault/credentials');
      if (activeId.current !== ownerId) return false;
      if (response.status === 401) {
        setCurrentUser(null);
        return false;
      }
      if (!response.ok) throw new Error('Could not load vault credentials');
      const data = (await response.json()) as { credentials: VaultCredentialMeta[] };
      if (activeId.current !== ownerId) return false;
      setVaultCredentials(data.credentials || []);
      return true;
    } catch {
      if (activeId.current !== ownerId) return false;
      setVaultNotice('Não foi possível carregar as credenciais do cofre.');
      return false;
    }
  }
  useEffect(() => {
    if (page !== 'cofre' || !currentUser) return;
    void loadVaultCredentials();
  }, [page, currentUser]);
  async function handleSaveVaultCredential(
    event: FormEvent<HTMLFormElement>,
    serviceId: string,
    ownerUserId: string | null,
  ) {
    event.preventDefault();
    setVaultBusy(true);
    setVaultNotice('');
    try {
      const response = await fetch(`/api/vault/credentials/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: vaultUsername,
          password: vaultPassword,
          ...(ownerUserId ? { ownerUserId } : {}),
        }),
      });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Erro ao salvar credencial.');
      }
      setVaultUsername('');
      setVaultPassword('');
      setEditingVaultKey(null);
      setVaultNotice('Credencial salva com sucesso e enquadrada em AES-256-GCM.');
      await loadVaultCredentials();
      await loadCatalog();
    } catch (cause) {
      setVaultNotice(
        cause instanceof Error ? cause.message : 'Não foi possível salvar a credencial.',
      );
    } finally {
      setVaultBusy(false);
    }
  }
  async function saveIndividualCredential(event: FormEvent<HTMLFormElement>) {
    if (!individualModal) return;

    event.preventDefault();
    if (!individualUsername.trim() || !individualPassword) {
      setIndividualError('Informe usuário e senha.');
      return;
    }
    setIndividualSaving(true);
    setIndividualError('');
    try {
      const res = await fetch(`/api/vault/credentials/${individualModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: individualUsername.trim(),
          password: individualPassword,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Erro ao salvar credencial.');
      }
      setCatalog((prev) =>
        prev.map((s) => (s.id === individualModal.id ? { ...s, hasCredential: true } : s)),
      );
      const target = { ...individualModal, hasCredential: true };
      setIndividualModal(null);
      setIndividualUsername('');
      setIndividualPassword('');
      void openVaultService(target);
    } catch (err) {
      setIndividualError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setIndividualSaving(false);
    }
  }
  return { loadVaultCredentials, handleSaveVaultCredential, saveIndividualCredential };
}

/** Issues an opaque ticket only; credential exchange remains inside the extension. */
export function issueOpeningTicket(serviceId: string): Promise<Response> {
  return fetch('/api/vault/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceId }),
  });
}
