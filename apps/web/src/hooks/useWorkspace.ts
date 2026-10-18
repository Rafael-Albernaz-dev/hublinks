import type { User } from '../types';
import type { WorkspaceActions } from '../types/actions';
import { useAuth } from './useAuth';
import { useCatalog } from './useCatalog';
import { useExtensionBridge } from './useExtensionBridge';
import { useIdentity } from './useIdentity';
import { useTeam } from './useTeam';
import { useTheme } from './useTheme';
import { useVault } from './useVault';
import { useDialogFocus } from './useDialogFocus';
import { useSessionCleanup } from './useSessionCleanup';
import { useCatalogEntry } from './useCatalogEntry';
import { useWorkspaceState } from './useWorkspaceState';
export function useWorkspace() {
  const state = useWorkspaceState();
  const theme = useTheme();
  // Cross-domain refreshes run after interaction, once all hooks are initialized.
  const dependencies: WorkspaceActions = {
    loadCatalog: () => catalog.loadCatalog(),
    loadVaultCredentials: () => vault.loadVaultCredentials(),
    openVaultService: (service) => extensionBridge.openVaultService(service),
  };
  const auth = useAuth(state);
  const catalog = useCatalog(state, dependencies);
  const vault = useVault(state, dependencies);
  const team = useTeam(state);
  const identity = useIdentity(state);
  const extensionBridge = useExtensionBridge(state);
  useDialogFocus(state);
  useSessionCleanup(state);
  useCatalogEntry(state);
  return {
    ...state,
    ...theme,
    ...auth,
    ...catalog,
    ...vault,
    ...team,
    ...extensionBridge,
    ...identity,
  };
}
export type WorkspaceModel = ReturnType<typeof useWorkspace>;
export type AuthenticatedWorkspace = WorkspaceModel & { currentUser: User };
