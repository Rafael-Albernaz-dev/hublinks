export type User = {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'attendant';
  active?: boolean;
};
export type ManagedUser = User & { createdAt: string };
export type CatalogService = {
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
export type ExtensionReply = { status?: string; version?: string; autofill?: boolean };
export type ChromeBridge = {
  runtime?: {
    lastError?: { message?: string };
    sendMessage: (id: string, message: unknown, callback: (reply?: ExtensionReply) => void) => void;
  };
};
