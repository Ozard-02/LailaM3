import type { ServerConfig } from '@/core/models';
import { buildCoverUrl } from '@/core/subsonic/params';

/** Small cover used for palette extraction, shared by every caller. */
export const PALETTE_COVER_SIZE = 96;

export function paletteCoverUrl(server: ServerConfig, coverArt: string): string {
  return buildCoverUrl(server, coverArt, PALETTE_COVER_SIZE);
}

export interface ArtworkPalette {
  background: string;
  wash: string;
  elevated: string;
  accent: string;
  on: string;
  onVariant: string;
  divider: string;
}

export const ACCENT_PRESETS = [
  { name: 'Red', value: '#FA2D48' },
  { name: 'Blue', value: '#0A84FF' },
  { name: 'Green', value: '#30D158' },
  { name: 'Orange', value: '#FF9F0A' },
  { name: 'Purple', value: '#BF5AF2' },
  { name: 'Pink', value: '#FF375F' },
] as const;

export interface AccentPair {
  accent: string;
  solid: string;
  soft: string;
}

export function accentPair(hex: string): AccentPair {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#FA2D48';
  let accent = safe;
  if (luminance(accent) < 0.45) accent = mix(accent, '#FFFFFF', 0.2);
  let solid = safe;
  if (luminance(solid) > 0.42) solid = darken(solid, 0.3);
  return { accent, solid, soft: `${accent}22` };
}

export const neutralPalette: ArtworkPalette = {
  background: '#0B0B0D',
  wash: '#141416',
  elevated: '#1C1C20',
  accent: '#FA2D48',
  on: '#F5F5F7',
  onVariant: 'rgba(245,245,247,0.62)',
  divider: 'rgba(255,255,255,0.10)',
};

function clamp(value: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function darken(hex: string, amount: number): string {
  const parsed = hex.replace('#', '');
  const r = parseInt(parsed.slice(0, 2), 16);
  const g = parseInt(parsed.slice(2, 4), 16);
  const b = parseInt(parsed.slice(4, 6), 16);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function mix(hex: string, target: string, amount: number): string {
  const a = hex.replace('#', '');
  const b = target.replace('#', '');
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  return rgbToHex(
    ar + (br - ar) * amount,
    ag + (bg - ag) * amount,
    ab + (bb - ab) * amount,
  );
}

function luminance(hex: string): number {
  const parsed = hex.replace('#', '');
  const r = parseInt(parsed.slice(0, 2), 16) / 255;
  const g = parseInt(parsed.slice(2, 4), 16) / 255;
  const b = parseInt(parsed.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function paletteFromHex(hex: string): ArtworkPalette {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#1C1C20';
  const background = darken(safe, 0.78);
  const wash = darken(safe, 0.62);
  const elevated = mix(darken(safe, 0.5), '#1C1C20', 0.45);
  let accent = luminance(safe) > 0.55 ? darken(safe, 0.15) : mix(safe, '#FFFFFF', 0.18);
  // Keep the accent readable on dark surfaces: a dark sleeve must not produce
  // dark-on-dark active rows or controls.
  if (luminance(accent) < 0.52) accent = mix(accent, '#FFFFFF', 0.5);
  return {
    background,
    wash,
    elevated,
    accent,
    on: '#F5F5F7',
    onVariant: 'rgba(245,245,247,0.64)',
    divider: 'rgba(255,255,255,0.12)',
  };
}

function averageColor(data: Uint8ClampedArray): string {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] ?? 0;
    if (alpha < 128) continue;
    const pr = data[i] ?? 0;
    const pg = data[i + 1] ?? 0;
    const pb = data[i + 2] ?? 0;
    // Ignore near-black and near-white pixels: they make every cover grey.
    const lum = (pr + pg + pb) / 3;
    if (lum < 18 || lum > 238) continue;
    r += pr;
    g += pg;
    b += pb;
    count += 1;
  }
  if (count === 0) return '#1C1C20';
  return rgbToHex(r / count, g / count, b / count);
}

export async function extractPaletteFromUrl(url: string): Promise<ArtworkPalette> {
  if (typeof document === 'undefined') return neutralPalette;

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          resolve(neutralPalette);
          return;
        }
        context.drawImage(image, 0, 0, 32, 32);
        const data = context.getImageData(0, 0, 32, 32).data;
        resolve(paletteFromHex(averageColor(data)));
      } catch {
        resolve(neutralPalette);
      }
    };
    image.onerror = () => resolve(neutralPalette);
    image.src = url;
  });
}
