export type User = {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'attendant';
  active?: boolean;
};
export type ManagedUser = User & { createdAt: string };
export type CatalogService = {
  ownerUserId?: string | null;
  scope?: 'global' | 'personal';
  id: string;
  name: string;
  description: string | null;
  category: 'sva' | 'crm' | 'sheet' | 'sistemas' | 'outros';
  credentialType: 'shared' | 'individual' | 'none';
  targetUrl: string | null;
  hasAction: boolean;
  logoDataUrl: string | null;
  hasCredential: boolean;
};
export type VaultCredentialMeta = {
  serviceId: string;
  serviceName: string;
  category: string;
  credentialType: 'shared' | 'individual' | 'none';
  credentialId: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  keyVersion: number | null;
  updatedAt: string | null;
};
export type ExtensionSettings = {
  openOnStartup: boolean;
  openOnNewTab: boolean;
  showToastNotifications: boolean;
};
export type ExtensionReply = {
  status?: string;
  version?: string;
  autofill?: boolean;
  settings?: ExtensionSettings;
};
export type ChromeBridge = {
  runtime?: {
    lastError?: { message?: string };
    sendMessage: (id: string, message: unknown, callback: (reply?: ExtensionReply) => void) => void;
  };
};

export type HomeLayoutMode = 'grid' | 'list' | 'carousel';
export type UserThemeOverrides = Partial<
  Omit<import('../config').HubConfig, 'version' | 'links' | 'homeLayout' | 'showShortcutCards'>
>;
export type UserPreferences = {
  homeLayout: HomeLayoutMode;
  showShortcutCards: boolean;
  cardOrder: string[];
  themeOverrides: UserThemeOverrides | null;
};
