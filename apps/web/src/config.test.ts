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
});
