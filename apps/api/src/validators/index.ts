import type {
  CatalogCategory,
  CatalogCredentialType,
  CredentialsInput,
  AttendantInput,
  UserUpdateInput,
  ServiceInput,
  CatalogInput,
  VaultInput,
  RevealInput,
  TicketInput,
  DemoConfig,
} from '../types/index.js';

export function ticketInput(body: unknown, exchange = false): TicketInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.serviceId !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(input.serviceId))
    return null;
  if (!exchange) return Object.keys(input).length === 1 ? { serviceId: input.serviceId } : null;
  if (Object.keys(input).length !== 2 || typeof input.ticket !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.ticket)) return null;
  return { serviceId: input.serviceId, ticket: input.ticket };
}

export function validTarget(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function credentials(body: unknown): CredentialsInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  if (!('email' in body) || !('password' in body)) return null;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  const email = body.email.trim().toLowerCase();
  if (email.length < 3 || email.length > 255 || !/^\S+@\S+\.\S+$/.test(email)) return null;
  return { email, password: body.password };
}

export function attendantInput(body: unknown): AttendantInput | null {
  const account = credentials(body);
  if (!account || typeof body !== 'object' || body === null || !('displayName' in body))
    return null;
  const b = body as Record<string, unknown>;
  if (typeof b.displayName !== 'string') return null;
  const displayName = b.displayName.trim();
  if (!displayName || displayName.length > 80 || account.password.length < 8) return null;
  let role: 'admin' | 'attendant' = 'attendant';
  if ('role' in b && b.role !== undefined) {
    if (b.role === 'admin') role = 'admin';
    else if (b.role === 'attendant' || b.role === 'user') role = 'attendant';
    else return null;
  }
  return { displayName, ...account, role };
}

export function userUpdateInput(body: unknown): UserUpdateInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.displayName !== 'string' || typeof b.email !== 'string') return null;
  const displayName = b.displayName.trim();
  const email = b.email.trim().toLowerCase();
  if (!displayName || displayName.length > 80) return null;
  if (email.length < 3 || email.length > 255 || !/^\S+@\S+\.\S+$/.test(email)) return null;
  let role: 'admin' | 'attendant';
  if (b.role === 'admin') role = 'admin';
  else if (b.role === 'attendant' || b.role === 'user') role = 'attendant';
  else return null;
  const active = b.active === undefined ? true : b.active;
  if (typeof active !== 'boolean') return null;
  return { displayName, email, role, active };
}

export function serviceInput(body: unknown): ServiceInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !['name', 'credentialType', 'category', 'targetUrl'].includes(key),
    ) ||
    typeof input.name !== 'string' ||
    (input.credentialType !== 'shared' && input.credentialType !== 'individual')
  )
    return null;
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return null;
  // Sheet links have no vault credential; these categories support credential-bearing services.
  const category = input.category === undefined ? 'sva' : input.category;
  if (category !== 'sva' && category !== 'crm' && category !== 'sistemas' && category !== 'outros')
    return null;
  let targetUrl: string | null = null;
  if (input.targetUrl !== undefined && input.targetUrl !== null) {
    if (typeof input.targetUrl !== 'string' || input.targetUrl.length > 2048) return null;
    try {
      const url = new URL(input.targetUrl);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
      targetUrl = url.href;
    } catch {
      return null;
    }
  }
  return {
    name,
    credentialType: input.credentialType,
    category,
    targetUrl,
  };
}

export function catalogInput(body: unknown): CatalogInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'name',
          'description',
          'category',
          'credentialType',
          'targetUrl',
          'logoDataUrl',
          'username',
          'password',
        ].includes(key),
    )
  )
    return null;
  if (typeof input.name !== 'string') return null;
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return null;
  if (
    typeof input.category !== 'string' ||
    !['sva', 'crm', 'sheet', 'sistemas', 'outros'].includes(input.category)
  )
    return null;
  if (
    typeof input.credentialType !== 'string' ||
    !['shared', 'individual', 'none'].includes(input.credentialType)
  )
    return null;
  const category = input.category as CatalogCategory;
  const credentialType = input.credentialType as CatalogCredentialType;
  if (category === 'sheet' && credentialType !== 'none') return null;
  if (
    input.description !== undefined &&
    input.description !== null &&
    typeof input.description !== 'string'
  )
    return null;
  const description =
    typeof input.description === 'string' ? input.description.trim() || null : null;
  if (description && description.length > 255) return null;
  let targetUrl: string | null = null;
  if (input.targetUrl !== undefined && input.targetUrl !== null && input.targetUrl !== '') {
    if (typeof input.targetUrl !== 'string' || input.targetUrl.length > 2048) return null;
    try {
      const url = new URL(input.targetUrl);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
      targetUrl = url.href;
    } catch {
      return null;
    }
  }
  let logoDataUrl: string | null;
  try {
    logoDataUrl = image(input.logoDataUrl ?? null, 500_000, 'Card logo');
  } catch {
    return null;
  }
  const hasUsername = input.username !== undefined && input.username !== '';
  const hasPassword = input.password !== undefined && input.password !== '';
  if (credentialType !== 'shared' && (hasUsername || hasPassword)) return null;
  if (hasUsername !== hasPassword) return null;
  const credential = hasUsername
    ? vaultInput({ username: input.username, password: input.password })
    : null;
  if (hasUsername && !credential) return null;
  return { name, description, category, credentialType, targetUrl, logoDataUrl, credential };
}

export function vaultInput(body: unknown): VaultInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.username !== 'string' || typeof b.password !== 'string') return null;
  const username = b.username.trim();
  const password = b.password;
  if (!username || username.length > 255 || !password || password.length > 2048) return null;
  let ownerUserId: string | null = null;
  if ('ownerUserId' in b && b.ownerUserId !== undefined && b.ownerUserId !== null) {
    if (
      typeof b.ownerUserId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.ownerUserId)
    ) {
      return null;
    }
    ownerUserId = b.ownerUserId;
  }
  return { username, password, ownerUserId };
}

export function revealInput(body: unknown): RevealInput | null {
  if (!body) return { ownerUserId: null };
  if (typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  let ownerUserId: string | null = null;
  if ('ownerUserId' in b && b.ownerUserId !== undefined && b.ownerUserId !== null) {
    if (
      typeof b.ownerUserId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.ownerUserId)
    ) {
      return null;
    }
    ownerUserId = b.ownerUserId;
  }
  return { ownerUserId };
}

export const DEFAULT_CONFIG: DemoConfig = {
  version: 1,
  companyName: 'Sua empresa',
  subtitle: 'Seus acessos organizados em um só lugar.',
  color: { r: 31, g: 86, b: 139 },
  logoDataUrl: null,
  links: [],
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Configuration must be an object.');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string, max: number, required = true): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new Error(`${name} is invalid.`);
  }
  return value.trim();
}

function optionalHexColor(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new Error(`${name} must be a 6-digit hex color.`);
  }
  return value.trim().toLowerCase();
}

export function image(value: unknown, max: number, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${name} is invalid.`);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new Error(`${name} is invalid.`);
  const base64 = match[2];
  const bytes =
    (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes > max) throw new Error(`${name} exceeds its size limit.`);
  return value;
}

export function parseConfig(input: unknown): DemoConfig {
  const config = object(input);
  if (config.version !== 1) throw new Error('Unsupported configuration version.');
  const color = object(config.color);
  for (const key of ['r', 'g', 'b']) {
    if (
      !Number.isInteger(color[key]) ||
      (color[key] as number) < 0 ||
      (color[key] as number) > 255
    ) {
      throw new Error(`Color ${key} must be an integer from 0 to 255.`);
    }
  }
  if (!Array.isArray(config.links) || config.links.length > 30)
    throw new Error('Links are invalid.');
  const ids = new Set<string>();
  const links = config.links.map((entry: unknown) => {
    const link = object(entry);
    const id = string(link.id, 'Link ID', 80);
    if (ids.has(id)) throw new Error('Link IDs must be unique.');
    ids.add(id);
    const url = string(link.url, 'Link URL', 2048);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Link URL must be valid HTTPS.');
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Link URL must be public HTTPS without credentials.');
    }
    return {
      id,
      title: string(link.title, 'Link title', 70),
      description: string(link.description, 'Link description', 140, false),
      url: parsed.href,
      ...(link.logoDataUrl === undefined
        ? {}
        : { logoDataUrl: image(link.logoDataUrl, 500_000, 'Card logo') }),
    };
  });
  const headerTagline =
    config.headerTagline === undefined
      ? undefined
      : string(config.headerTagline, 'Header tagline', 60, false);
  const homeEyebrow =
    config.homeEyebrow === undefined
      ? undefined
      : string(config.homeEyebrow, 'Home eyebrow', 60, false);
  const homeTitle =
    config.homeTitle === undefined ? undefined : string(config.homeTitle, 'Home title', 120, false);
  const brandPrimaryText =
    config.brandPrimaryText === undefined
      ? undefined
      : string(config.brandPrimaryText, 'Brand primary text', 40, false);
  const brandSecondaryText =
    config.brandSecondaryText === undefined
      ? undefined
      : string(config.brandSecondaryText, 'Brand secondary text', 40, false);
  const brandPrimaryColor = optionalHexColor(config.brandPrimaryColor, 'Brand primary color');
  const brandSecondaryColor = optionalHexColor(config.brandSecondaryColor, 'Brand secondary color');
  const textColor = optionalHexColor(config.textColor, 'Text color');
  const backgroundColor = optionalHexColor(config.backgroundColor, 'Background color');

  return {
    version: 1 as const,
    companyName: string(config.companyName, 'Company name', 60),
    subtitle: string(config.subtitle, 'Subtitle', 160, false),
    color: { r: color.r as number, g: color.g as number, b: color.b as number },
    logoDataUrl: image(config.logoDataUrl, 1_000_000, 'Company logo'),
    links,
    ...(headerTagline ? { headerTagline } : {}),
    ...(homeEyebrow ? { homeEyebrow } : {}),
    ...(homeTitle ? { homeTitle } : {}),
    ...(brandPrimaryText ? { brandPrimaryText } : {}),
    ...(brandPrimaryColor ? { brandPrimaryColor } : {}),
    ...(brandSecondaryText ? { brandSecondaryText } : {}),
    ...(brandSecondaryColor ? { brandSecondaryColor } : {}),
    ...(textColor ? { textColor } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
  };
}
