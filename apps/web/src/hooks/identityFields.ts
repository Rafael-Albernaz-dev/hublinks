import type { RgbColor } from '../config';
import { hexToRgb } from '../config';
export const WORKSPACE_PURPLE: RgbColor = { r: 113, g: 55, b: 209 };
export const colorEquals = (a: RgbColor, b: RgbColor) => a.r === b.r && a.g === b.g && a.b === b.b;
export const rgbField = (color: RgbColor) => [color.r, color.g, color.b].join(', ');
export function parseRgbField(input: string): RgbColor | null {
  const value = input.trim();
  const channelText = /^rgb\([^)]+\)$/i.test(value) ? value.slice(4, -1) : value;
  const match = /^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/.exec(channelText);
  if (!match || match.slice(1).some((part) => Number(part) > 255)) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}
export function parseHexField(input: string): RgbColor | null {
  return /^#?[\da-f]{6}$/i.test(input.trim())
    ? hexToRgb(input.trim().startsWith('#') ? input.trim() : '#' + input.trim())
    : null;
}
