import type { CatalogService } from './index';

/** Callbacks used to coordinate catalog, vault, and extension operations. */
export interface WorkspaceActions {
  loadCatalog: () => Promise<void>;
  loadVaultCredentials: () => Promise<boolean>;
  openVaultService: (service: CatalogService) => Promise<void>;
}
