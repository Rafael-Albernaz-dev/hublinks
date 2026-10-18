import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, brandInk, brandText, parseHubConfig, validateLinkUrl } from './config';

describe('public demo configuration', () => {
  it('accepts a valid branded configuration', () => {
    const parsed = parseHubConfig({
      ...DEFAULT_CONFIG,
      companyName: 'Cliente Exemplo',
      color: { r: 255, g: 100, b: 0 },
      links: [{ id: 'portal', title: 'Portal', description: '', url: 'https://example.com' }],
    });
    expect(parsed.links[0]?.url).toBe('https://example.com/');
    expect(parsed.color.r).toBe(255);
  });

  it('rejects unsafe or credentialed links', () => {
    expect(() => validateLinkUrl('javascript:alert(1)')).toThrow();
    expect(() => validateLinkUrl('https://user:pass@example.com')).toThrow();
    expect(() => validateLinkUrl('http://example.com')).toThrow();
  });

  it('rejects invalid RGB values and executable image formats', () => {
    expect(() => parseHubConfig({ ...DEFAULT_CONFIG, color: { r: 256, g: 0, b: 0 } })).toThrow();
    expect(() =>
      parseHubConfig({ ...DEFAULT_CONFIG, logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }),
    ).toThrow();
  });

  it('accepts a valid card logo and rejects malformed or oversized card logos', () => {
    const link = { id: 'one', title: 'Site', description: '', url: 'https://example.com/' };
    const valid = 'data:image/png;base64,iVBORw==';
    expect(
      parseHubConfig({ ...DEFAULT_CONFIG, links: [{ ...link, logoDataUrl: valid }] }).links[0]
        ?.logoDataUrl,
    ).toBe(valid);
    expect(() =>
      parseHubConfig({
        ...DEFAULT_CONFIG,
        links: [{ ...link, logoDataUrl: 'data:image/png;base64,broken!' }],
      }),
    ).toThrow();
    expect(() =>
      parseHubConfig({
        ...DEFAULT_CONFIG,
        links: [{ ...link, logoDataUrl: `data:image/png;base64,${'AAAA'.repeat(166_667)}` }],
      }),
    ).toThrow();
  });

  it('chooses readable text on light and dark brand colors', () => {
    expect(brandInk({ r: 255, g: 255, b: 255 })).toBe('#102333');
    expect(brandInk({ r: 0, g: 0, b: 0 })).toBe('#ffffff');
    expect(brandText({ r: 255, g: 255, b: 255 })).not.toBe('rgb(255 255 255)');
  });

  it('validates and preserves bicolor brand, home texts, and optional colors', () => {
    const parsed = parseHubConfig({
      ...DEFAULT_CONFIG,
      companyName: 'Rural Conecta',
      headerTagline: 'PORTAL OPERACIONAL',
      homeEyebrow: 'CENTRAL DE OPERAÇÕES',
      homeTitle: 'Bem-vindo à Rural Conecta.',
      brandPrimaryText: 'Rural',
      brandPrimaryColor: '#1E7E34',
      brandSecondaryText: 'Conecta',
      brandSecondaryColor: '#0B5ED7',
      textColor: '#14131A',
      backgroundColor: '#F5F6FA',
    });
    expect(parsed.brandPrimaryText).toBe('Rural');
    expect(parsed.brandPrimaryColor).toBe('#1e7e34');
    expect(parsed.brandSecondaryText).toBe('Conecta');
    expect(parsed.brandSecondaryColor).toBe('#0b5ed7');
    expect(parsed.headerTagline).toBe('PORTAL OPERACIONAL');
    expect(parsed.homeEyebrow).toBe('CENTRAL DE OPERAÇÕES');
    expect(parsed.homeTitle).toBe('Bem-vindo à Rural Conecta.');
    expect(parsed.textColor).toBe('#14131a');
    expect(parsed.backgroundColor).toBe('#f5f6fa');
    expect(() =>
      parseHubConfig({ ...DEFAULT_CONFIG, brandPrimaryColor: 'invalid-color' }),
    ).toThrow();
  });
});
