import { useEffect, useRef } from 'react';
import type { CatalogService } from '../types';
import type { WorkspaceActions } from '../types/actions';
import type { WorkspaceState } from './useWorkspaceState';
export function useCatalog(
  state: Pick<
    WorkspaceState,
    | 'currentUser'
    | 'setCatalog'
    | 'setCurrentUser'
    | 'setCatalogError'
    | 'vaultBusy'
    | 'setVaultBusy'
    | 'setVaultNotice'
    | 'editingCatalogId'
    | 'setEditingCatalogId'
    | 'setAddingCatalog'
  >,
  actions: Pick<WorkspaceActions, 'loadVaultCredentials'>,
) {
  const {
    currentUser,
    setCatalog,
    setCurrentUser,
    setCatalogError,
    vaultBusy,
    setVaultBusy,
    setVaultNotice,
    editingCatalogId,
    setEditingCatalogId,
    setAddingCatalog,
  } = state;
  const { loadVaultCredentials } = actions;
  const activeId = useRef(currentUser?.id);
  activeId.current = currentUser?.id;
  useEffect(() => {
    setCatalog([]);
    if (!currentUser) {
      return;
    }
    void loadCatalog();
  }, [currentUser]);
  async function loadCatalog() {
    const ownerId = currentUser?.id;
    try {
      const response = await fetch('/api/catalog');
      if (activeId.current !== ownerId) return;
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Falha ao carregar o catálogo privado.');
      const result = (await response.json()) as { services: CatalogService[] };
      if (activeId.current !== ownerId) return;
      if (!Array.isArray(result.services)) throw new Error('Catálogo inválido.');
      setCatalog(result.services);
      setCatalogError('');
    } catch (cause) {
      if (activeId.current !== ownerId) return;
      setCatalogError(cause instanceof Error ? cause.message : 'Falha ao carregar o catálogo.');
    }
  }
  async function saveCatalogService(
    input: Omit<CatalogService, 'id' | 'hasAction' | 'hasCredential'> & {
      username?: string;
      password?: string;
    },
  ) {
    if (!currentUser || vaultBusy) return;
    setVaultBusy(true);
    setVaultNotice('');
    try {
      const response = await fetch(
        editingCatalogId ? `/api/catalog/services/${editingCatalogId}` : '/api/catalog/services',
        {
          method: editingCatalogId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      );
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(error.error || 'Não foi possível salvar o card.');
      }
      const saved = (await response.json()) as { service?: { id?: unknown } };
      if (!saved.service || typeof saved.service.id !== 'string')
        throw new Error('A API retornou uma confirmação de card inválida.');
      setEditingCatalogId(null);
      setAddingCatalog(false);
      await loadCatalog();
      await loadVaultCredentials();
      setVaultNotice('Card salvo no catálogo privado.');
    } catch (cause) {
      setVaultNotice(cause instanceof Error ? cause.message : 'Não foi possível salvar o card.');
    } finally {
      setVaultBusy(false);
    }
  }
  async function deleteCatalogService(service: CatalogService) {
    if (!currentUser || vaultBusy) return;
    setVaultBusy(true);
    try {
      const response = await fetch(`/api/catalog/services/${service.id}`, { method: 'DELETE' });
      if (response.status === 401) {
        setCurrentUser(null);
        return;
      }
      if (!response.ok) throw new Error('Não foi possível excluir o card.');
      await loadCatalog();
      await loadVaultCredentials();
      setVaultNotice('Card excluído.');
    } catch (cause) {
      setVaultNotice(cause instanceof Error ? cause.message : 'Não foi possível excluir o card.');
    } finally {
      setVaultBusy(false);
    }
  }
  return { loadCatalog, saveCatalogService, deleteCatalogService };
}
