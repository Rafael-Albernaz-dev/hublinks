import type { Pool } from 'pg';
import type { FastifyRequest, FastifyReply } from 'fastify';

export type User = {
  id: string;
  displayName: string;
  email: string;
  role: 'admin' | 'attendant';
  active?: boolean;
  avatar?: string | null;
};
export type UserRow = {
  id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'attendant';
  active?: boolean;
  avatar?: string | null;
};
export type CredentialUserRow = UserRow & { password_hash: string };
export type SessionRow = UserRow & { session_id: string };
export type CatalogCategory = 'sva' | 'crm' | 'sheet' | 'sistemas' | 'outros';
export type CatalogCredentialType = 'shared' | 'individual' | 'none';
export type CatalogRow = {
  owner_user_id: string | null;
  id: string;
  name: string;
  description: string | null;
  category: CatalogCategory;
  credential_type: CatalogCredentialType;
  target_url: string | null;
  has_action: boolean;
  logo_data_url: string | null;
  has_credential: boolean;
};

export type CatalogItem = {
  ownerUserId: string | null;
  scope: 'global' | 'personal';
  id: string;
  name: string;
  description: string | null;
  category: CatalogCategory;
  credentialType: CatalogCredentialType;
  targetUrl: string | null;
  hasAction: boolean;
  logoDataUrl: string | null;
  hasCredential: boolean;
};
export type CredentialsInput = { email: string; password: string };
export type AttendantInput = CredentialsInput & {
  displayName: string;
  role?: 'admin' | 'attendant';
};
export type UserUpdateInput = {
  displayName: string;
  email: string;
  role: 'admin' | 'attendant';
  active: boolean;
};
export type ServiceInput = {
  name: string;
  credentialType: 'shared' | 'individual';
  category: 'sva' | 'crm' | 'sistemas' | 'outros';
  targetUrl: string | null;
};
export type VaultInput = { username: string; password: string; ownerUserId?: string | null };
export type RevealInput = { ownerUserId?: string | null };
export type TicketInput = { serviceId: string; ticket?: string };
export type CatalogInput = Omit<
  CatalogItem,
  'id' | 'hasAction' | 'hasCredential' | 'ownerUserId' | 'scope'
> & {
  scope?: 'global' | 'personal';
  credential: VaultInput | null;
};
export type DemoLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  logoDataUrl?: string | null;
};
export type DemoConfig = {
  version: 1;
  homeLayout?: 'grid' | 'list' | 'carousel' | 'compact' | 'sections';
  showShortcutCards?: boolean;
  companyName: string;
  subtitle: string;
  color: { r: number; g: number; b: number };
  logoDataUrl: string | null;
  links: DemoLink[];
  headerTagline?: string;
  homeEyebrow?: string;
  homeTitle?: string;
  brandPrimaryText?: string;
  brandPrimaryColor?: string | null;
  brandSecondaryText?: string;
  brandSecondaryColor?: string | null;
  textColor?: string | null;
  backgroundColor?: string | null;
};
export type RateLimitConfig = { max: number; windowMs: number };
export type ServerOptions = {
  loginRateLimit?: Partial<RateLimitConfig>;
  ticketRateLimit?: Partial<RateLimitConfig>;
};
export type ApiContext = {
  pool: Pool;
  configPath: string;
  extensionOrigin: string | null;
  rateLimit: (
    bucket: 'login' | 'tickets' | 'icons',
    request: FastifyRequest,
    reply: FastifyReply,
  ) => boolean;
};

export type UserThemeOverrides = Partial<
  Omit<DemoConfig, 'version' | 'links' | 'homeLayout' | 'showShortcutCards'>
>;
export type UserPreferences = {
  homeLayout: 'grid' | 'list' | 'carousel' | 'compact' | 'sections';
  showShortcutCards: boolean;
  cardOrder: string[];
  shortcutOrder: string[];
  shortcutStyle: 'cards' | 'chips';
  themeOverrides: UserThemeOverrides | null;
};
