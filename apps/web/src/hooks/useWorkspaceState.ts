import { useRef, useState } from 'react';
import type { Page } from '../components/pages';
import type { HubConfig } from '../config';
import { DEFAULT_CONFIG } from '../config';
import type { CatalogService, ManagedUser, User, VaultCredentialMeta } from '../types';
export function useWorkspaceState() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [vaultCredentials, setVaultCredentials] = useState<VaultCredentialMeta[]>([]);
  const [editingVaultKey, setEditingVaultKey] = useState<string | null>(null);
  const [vaultUsername, setVaultUsername] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultNotice, setVaultNotice] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [extensionState, setExtensionState] = useState<'checking' | 'detected' | 'missing'>(
    document.documentElement.getAttribute('data-hublink-extension') === 'active'
      ? 'detected'
      : 'checking',
  );
  const [extensionModal, setExtensionModal] = useState<CatalogService | null>(null);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [openingServiceId, setOpeningServiceId] = useState<string | null>(null);
  const [openingNotice, setOpeningNotice] = useState('');
  const [individualModal, setIndividualModal] = useState<CatalogService | null>(null);
  const [individualUsername, setIndividualUsername] = useState('');
  const [individualPassword, setIndividualPassword] = useState('');
  const [individualShowPassword, setIndividualShowPassword] = useState(false);
  const [individualError, setIndividualError] = useState('');
  const [individualSaving, setIndividualSaving] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [addingCatalog, setAddingCatalog] = useState(false);
  const [config, setConfig] = useState<HubConfig>(DEFAULT_CONFIG);
  const [persisted, setPersisted] = useState<HubConfig | null>(null);
  const [apiState, setApiState] = useState<'loading' | 'online' | 'offline'>('loading');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState<Page>('inicio');
  const [query, setQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [colorChosen, setColorChosen] = useState(false);
  const [hexDraft, setHexDraft] = useState('#7137D1');
  const [rgbDraft, setRgbDraft] = useState('113, 55, 209');
  const [draggingLogo, setDraggingLogo] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  const [notice, setNotice] = useState('');
  return {
    currentUser,
    setCurrentUser,
    authChecked,
    setAuthChecked,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    setLoginError,
    authBusy,
    setAuthBusy,
    managedUsers,
    setManagedUsers,
    adminName,
    setAdminName,
    adminEmail,
    setAdminEmail,
    adminPassword,
    setAdminPassword,
    resetId,
    setResetId,
    resetPassword,
    setResetPassword,
    adminNotice,
    setAdminNotice,
    vaultCredentials,
    setVaultCredentials,
    editingVaultKey,
    setEditingVaultKey,
    vaultUsername,
    setVaultUsername,
    vaultPassword,
    setVaultPassword,
    vaultNotice,
    setVaultNotice,
    vaultBusy,
    setVaultBusy,
    catalog,
    setCatalog,
    catalogError,
    setCatalogError,
    extensionState,
    setExtensionState,
    extensionModal,
    setExtensionModal,
    showExtensionGuide,
    setShowExtensionGuide,
    openingServiceId,
    setOpeningServiceId,
    openingNotice,
    setOpeningNotice,
    individualModal,
    setIndividualModal,
    individualUsername,
    setIndividualUsername,
    individualPassword,
    setIndividualPassword,
    individualShowPassword,
    setIndividualShowPassword,
    individualError,
    setIndividualError,
    individualSaving,
    setIndividualSaving,
    editingCatalogId,
    setEditingCatalogId,
    addingCatalog,
    setAddingCatalog,
    config,
    setConfig,
    persisted,
    setPersisted,
    apiState,
    setApiState,
    saving,
    setSaving,
    page,
    setPage,
    query,
    setQuery,
    catalogQuery,
    setCatalogQuery,
    colorChosen,
    setColorChosen,
    hexDraft,
    setHexDraft,
    rgbDraft,
    setRgbDraft,
    draggingLogo,
    setDraggingLogo,
    gridRef,
    dialogRef,
    entered,
    notice,
    setNotice,
  };
}
export type WorkspaceState = ReturnType<typeof useWorkspaceState>;
