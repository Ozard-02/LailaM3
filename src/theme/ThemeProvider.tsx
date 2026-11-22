import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import {
  darkColors,
  lightColors,
  motion,
  radius,
  spacing,
  typography,
  type Colors,
} from './tokens';
import { resolvePerformanceMode } from '@/core/device-tier';
import { isLowMemoryRuntime } from '@/services/device';
import { useSettingsStore } from '@/stores/settings';
import { useUIStore } from '@/stores/ui';
import { extractPaletteFromUrl } from './extract';
import { accentPair, neutralPalette, type ArtworkPalette } from './palette';

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  colors: Colors;
  artwork: ArtworkPalette;
  isArtwork: boolean;
  /** Cover URL the current palette was extracted from, if any. */
  artworkUrl: string | undefined;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  motion: typeof motion;
  reduceMotion: boolean;
  /** True when blur is disabled by the setting or by performance mode. */
  reduceBlur: boolean;
  /** Effective performance mode (Auto resolved against this device). */
  performanceMode: boolean;
  /** True when this device is at or below the low-memory threshold. */
  lowMemoryDevice: boolean;
  /**
   * Whether the artwork palette should follow the player. Always true outside
   * performance mode, so player open/close does not rebuild the theme.
   */
  palettePlayerOpen: boolean;
  setArtworkFromUrl: (url: string | undefined) => void;
  resetArtwork: () => void;
}

const ThemeContext = createContext<Theme | null>(null);

const PALETTE_CACHE_LIMIT = 120;
const paletteCache = new Map<string, ArtworkPalette>();

/** LRU touch: recent covers survive, old ones are evicted on write. */
function rememberPalette(url: string, palette: ArtworkPalette): void {
  paletteCache.delete(url);
  paletteCache.set(url, palette);
  while (paletteCache.size > PALETTE_CACHE_LIMIT) {
    const oldest = paletteCache.keys().next().value;
    if (oldest === undefined) break;
    paletteCache.delete(oldest);
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'light' ? 'light' : 'dark';
  // Reanimated's useReducedMotion is a startup-only constant. Start from it so
  // the first render is correct, then follow the system setting live.
  const initialReduceMotion = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(initialReduceMotion);
  const [artwork, setArtwork] = useState<ArtworkPalette>(neutralPalette);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => setReduceMotion(query.matches);
      query.addEventListener?.('change', update);
      return () => query.removeEventListener?.('change', update);
    }
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  const [artworkUrl, setArtworkUrl] = useState<string | undefined>(undefined);
  const [isArtwork, setIsArtwork] = useState(false);
  const customAccent = useSettingsStore((state) => state.accentColor);
  const performanceSetting = useSettingsStore((state) => state.performanceMode);
  const reduceBlurSetting = useSettingsStore((state) => state.reduceBlur);
  const playerOpen = useUIStore((state) => state.playerOpen);
  const lowMemoryDevice = isLowMemoryRuntime();
  const performanceMode = resolvePerformanceMode(performanceSetting, lowMemoryDevice);
  // Only performance mode ties palette work to the player. Outside it this is
  // a constant, so opening or closing the player never rebuilds the theme or
  // re-arms palette grace timers.
  const palettePlayerOpen = performanceMode ? playerOpen : true;
  const activeUrl = useRef<string | undefined>(undefined);

  const setArtworkFromUrl = useCallback(
    (url: string | undefined) => {
      // Performance mode keeps the palette for the open player only. Ignoring
      // browsing screens and track changes while parked avoids decoding and
      // extracting a cover the user is not looking at.
      if (!palettePlayerOpen) return;
      activeUrl.current = url;
      if (!url) {
        setArtwork(neutralPalette);
        setArtworkUrl(undefined);
        setIsArtwork(false);
        return;
      }
      const cached = paletteCache.get(url);
      if (cached) {
        rememberPalette(url, cached);
        startTransition(() => {
          setArtwork(cached);
          setArtworkUrl(url);
          setIsArtwork(true);
        });
        return;
      }
      void extractPaletteFromUrl(url).then((palette) => {
        if (activeUrl.current !== url) return;
        rememberPalette(url, palette);
        // Palette extraction can land mid-gesture; keep that update interruptible.
        startTransition(() => {
          setArtwork(palette);
          setArtworkUrl(url);
          setIsArtwork(palette !== neutralPalette);
        });
      });
    },
    [palettePlayerOpen],
  );

  const resetArtwork = useCallback(() => {
    activeUrl.current = undefined;
    setArtwork(neutralPalette);
    setArtworkUrl(undefined);
    setIsArtwork(false);
  }, []);

  const value = useMemo<Theme>(() => {
    const base = mode === 'light' ? lightColors : darkColors;
    // In performance mode the palette follows the open player only; when it is
    // parked the app keeps the neutral theme instead of tinting every screen.
    const useArtwork = mode === 'dark' && isArtwork && palettePlayerOpen;
    let colors: Colors = useArtwork
      ? {
          ...base,
          background: artwork.background,
          surface: artwork.wash,
          elevated: artwork.elevated,
          border: artwork.divider,
          borderStrong: artwork.divider,
          accent: artwork.accent,
          accentSoft: `${artwork.accent}22`,
          text: artwork.on,
          textSecondary: artwork.onVariant,
        }
      : base;

    if (customAccent) {
      const pair = accentPair(customAccent);
      colors = {
        ...colors,
        accent: mode === 'light' ? pair.solid : pair.accent,
        accentSolid: pair.solid,
        accentSoft: pair.soft,
      };
    }

    return {
      mode,
      colors,
      artwork: useArtwork ? artwork : neutralPalette,
      isArtwork: useArtwork,
      artworkUrl,
      spacing,
      radius,
      typography,
      motion,
      reduceMotion: reduceMotion || performanceMode,
      reduceBlur: reduceBlurSetting || performanceMode,
      performanceMode,
      lowMemoryDevice,
      palettePlayerOpen,
      setArtworkFromUrl,
      resetArtwork,
    };
  }, [
    mode,
    isArtwork,
    artwork,
    artworkUrl,
    customAccent,
    reduceMotion,
    reduceBlurSetting,
    performanceMode,
    lowMemoryDevice,
    palettePlayerOpen,
    setArtworkFromUrl,
    resetArtwork,
  ]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
