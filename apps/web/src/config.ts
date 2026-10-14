export type RgbColor = { r: number; g: number; b: number };

export type HubLink = {
  id: string;
  title: string;
  description: string;
  url: string;
};

export type HubConfig = {
  version: 1;
  companyName: string;
  subtitle: string;
  color: RgbColor;
  logoDataUrl: string | null;
  links: HubLink[];
};

export const STORAGE_KEY = 'hublink.demo.config.v1';

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

function channel(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} precisa ser um inteiro entre 0 e 255.`);
  }
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

  const logo = value.logoDataUrl;
  if (
    logo !== null &&
    (typeof logo !== 'string' ||
      logo.length > 1_500_000 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo))
  ) {
    throw new Error('A logo deve ser uma imagem PNG, JPG ou WebP de até 1 MB.');
  }

  const ids = new Set<string>();
  return {
    version: 1,
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
      return {
        id,
        title: textField(link.title, `Nome do link ${index + 1}`, 70),
        description: textField(link.description, `Descrição do link ${index + 1}`, 140, false),
        url: validateLinkUrl(textField(link.url, `URL do link ${index + 1}`, 2048)),
      };
    }),
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
