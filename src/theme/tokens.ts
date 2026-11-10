import { Platform } from 'react-native';

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  artwork: 8,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Shared shape for the compact mini player and the floating bottom tabs. */
export const chromeRadii = {
  pill: radius.pill,
  rounded: radius.lg,
  soft: radius.md,
} as const;

export type ChromeRadius = keyof typeof chromeRadii;

export const typography = {
  display: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  largeTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  headline: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400' as const,
    letterSpacing: 0,
  },
  callout: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    letterSpacing: 0,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
} as const;

export const motion = {
  pressScale: 0.97,
  liftScale: 1.03,
  spring: { damping: 18, stiffness: 220, mass: 0.8 },
  snappySpring: { damping: 20, stiffness: 320, mass: 0.7 },
  /** Bottom sheets (queue, action sheets): critically damped, no overshoot. */
  /** Mini player ↔ full player morph (progress 0..1). */
  playerSpring: { damping: 30, stiffness: 420, mass: 0.6, overshootClamping: true },
  /** Snap-back after a swipe that did not commit; pass the gesture velocity. */
  releaseSpring: { damping: 26, stiffness: 320, mass: 0.7, overshootClamping: true },
  sheetSpring: { damping: 30, stiffness: 380, mass: 0.7, overshootClamping: true },
  fade: 220,
  paletteFade: 800,
} as const;

export const fontFamily = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

export const darkColors = {
  background: '#0B0B0D',
  surface: '#151518',
  elevated: '#1C1C20',
  elevated2: '#242429',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.18)',
  text: '#F5F5F7',
  textSecondary: 'rgba(245,245,247,0.64)',
  textTertiary: 'rgba(245,245,247,0.42)',
  accent: '#FA2D48',
  accentSolid: '#D91E3A',
  accentSoft: 'rgba(250,45,72,0.16)',
  success: '#32D74B',
  warning: '#FFD60A',
  danger: '#FF453A',
  scrim: 'rgba(0,0,0,0.55)',
} as const;

export const lightColors = {
  background: '#F7F7F8',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  elevated2: '#F0F0F2',
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.14)',
  text: '#111113',
  textSecondary: 'rgba(17,17,19,0.62)',
  textTertiary: 'rgba(17,17,19,0.40)',
  accent: '#E51B3D',
  accentSolid: '#C91532',
  accentSoft: 'rgba(229,27,61,0.12)',
  success: '#1B9C33',
  warning: '#B58900',
  danger: '#D70015',
  scrim: 'rgba(0,0,0,0.32)',
} as const;

export interface Colors {
  background: string;
  surface: string;
  elevated: string;
  elevated2: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  /** Solid accent for filled buttons; always dark enough for white text. */
  accentSolid: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  scrim: string;
}
