export type RgbColor = { r: number; g: number; b: number };

export type HubLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  logoDataUrl?: string | null;
};

export type HubConfig = {
  version: 1;
  homeLayout?: 'grid' | 'list' | 'carousel';
  showShortcutCards?: boolean;
  companyName: string;
  subtitle: string;
  color: RgbColor;
  logoDataUrl: string | null;
  links: HubLink[];
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

export const DEFAULT_HEADER_TAGLINE = 'HUB DA EQUIPE';
export const DEFAULT_HOME_EYEBROW = 'SEU ESPAÇO DE TRABALHO';
export const DEFAULT_HOME_TITLE = 'Um bom dia começa aqui.';

export const DEFAULT_CONFIG: HubConfig = {
  version: 1,
  companyName: 'Sua empresa',
  subtitle: 'Seus acessos organizados em um só lugar.',
  color: { r: 31, g: 86, b: 139 },
  logoDataUrl: null,
  links: [],
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('O arquivo precisa conter um objeto de configuração.');
  }
  return value as Record<string, unknown>;
}

function textField(value: unknown, label: string, limit: number, required = true): string {
  if (typeof value !== 'string') throw new Error(`${label} precisa ser texto.`);
  const text = value.trim();
  if (required && !text) throw new Error(`${label} não pode ficar vazio.`);
  if (text.length > limit) throw new Error(`${label} aceita até ${limit} caracteres.`);
  return text;
}

function optionalHexField(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new Error(`${label} precisa ser uma cor hexadecimal de 6 dígitos (ex: #112233).`);
  }
  return value.trim().toLowerCase();
}

function channel(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} precisa ser um inteiro entre 0 e 255.`);
  }
  return value;
}

function imageDataUrl(value: unknown, maxBytes: number, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} precisa ser uma imagem válida.`);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !match[2] || match[2].length % 4 !== 0) {
    throw new Error(`${label} precisa ser uma imagem PNG, JPG ou WebP válida.`);
  }
  const bytes =
    (match[2].length / 4) * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (bytes > maxBytes) throw new Error(`${label} excede o limite de ${maxBytes / 1000} KB.`);
  return value;
}

export function validateLinkUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Informe um link HTTPS válido.');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Use HTTPS, sem usuário ou senha no endereço.');
  }
  return url.href;
}

export function parseHubConfig(input: unknown): HubConfig {
  const value = record(input);
  if (value.version !== 1) throw new Error('Versão de configuração incompatível.');
  const color = record(value.color);
  const links = value.links;
  if (!Array.isArray(links) || links.length > 30) {
    throw new Error('A configuração aceita até 30 links.');
  }

  const logo = imageDataUrl(value.logoDataUrl, 1_000_000, 'Logo da empresa');
  const headerTagline =
    value.headerTagline === undefined
      ? undefined
      : textField(value.headerTagline, 'Tagline do cabeçalho', 60, false);
  const homeEyebrow =
    value.homeEyebrow === undefined
      ? undefined
      : textField(value.homeEyebrow, 'Selo da tela inicial', 60, false);
  const homeTitle =
    value.homeTitle === undefined
      ? undefined
      : textField(value.homeTitle, 'Título da tela inicial', 120, false);
  const brandPrimaryText =
    value.brandPrimaryText === undefined
      ? undefined
      : textField(value.brandPrimaryText, 'Texto principal da marca', 40, false);
  const brandSecondaryText =
    value.brandSecondaryText === undefined
      ? undefined
      : textField(value.brandSecondaryText, 'Texto secundário da marca', 40, false);
  const brandPrimaryColor = optionalHexField(value.brandPrimaryColor, 'Cor do texto principal');
  const brandSecondaryColor = optionalHexField(
    value.brandSecondaryColor,
    'Cor do texto secundário',
  );
  const textColor = optionalHexField(value.textColor, 'Cor do texto');
  if (
    value.homeLayout !== undefined &&
    value.homeLayout !== 'grid' &&
    value.homeLayout !== 'list' &&
    value.homeLayout !== 'carousel'
  )
    throw new Error('Modo da Home inválido.');
  if (value.showShortcutCards !== undefined && typeof value.showShortcutCards !== 'boolean')
    throw new Error('Atalhos inválidos.');
  const backgroundColor = optionalHexField(value.backgroundColor, 'Cor de fundo');

  const ids = new Set<string>();
  return {
    version: 1,
    ...(value.homeLayout !== undefined
      ? { homeLayout: value.homeLayout as 'grid' | 'list' | 'carousel' }
      : {}),
    ...(value.showShortcutCards !== undefined
      ? { showShortcutCards: value.showShortcutCards as boolean }
      : {}),
    companyName: textField(value.companyName, 'Nome da empresa', 60),
    subtitle: textField(value.subtitle, 'Descrição', 160, false),
    color: {
      r: channel(color.r, 'R'),
      g: channel(color.g, 'G'),
      b: channel(color.b, 'B'),
    },
    logoDataUrl: logo,
    links: links.map((item, index) => {
      const link = record(item);
      const id = textField(link.id, `ID do link ${index + 1}`, 80);
      if (ids.has(id)) throw new Error('Há IDs de links repetidos.');
      ids.add(id);
      const parsed: HubLink = {
        id,
        title: textField(link.title, `Nome do link ${index + 1}`, 70),
        description: textField(link.description, `Descrição do link ${index + 1}`, 140, false),
        url: validateLinkUrl(textField(link.url, `URL do link ${index + 1}`, 2048)),
      };
      if (link.logoDataUrl !== undefined) {
        parsed.logoDataUrl = imageDataUrl(link.logoDataUrl, 500_000, `Logo do link ${index + 1}`);
      }
      return parsed;
    }),
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

export function rgbToCss(color: RgbColor): string {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

export function rgbToHex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(value: string): RgbColor {
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

function luminance(color: RgbColor): number {
  const linear = [color.r, color.g, color.b].map((value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

export function brandInk(color: RgbColor): string {
  const darkInk: RgbColor = { r: 16, g: 35, b: 51 };
  const base = luminance(color);
  const ink = luminance(darkInk);
  const whiteContrast = 1.05 / (base + 0.05);
  const darkContrast = (Math.max(base, ink) + 0.05) / (Math.min(base, ink) + 0.05);
  return whiteContrast >= darkContrast ? '#ffffff' : '#102333';
}

export function brandText(color: RgbColor): string {
  let candidate = color;
  while (luminance(candidate) > 0.18) {
    candidate = {
      r: Math.floor(candidate.r * 0.9),
      g: Math.floor(candidate.g * 0.9),
      b: Math.floor(candidate.b * 0.9),
    };
  }
  return rgbToCss(candidate);
}
