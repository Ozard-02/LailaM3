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
import { useColorScheme } from 'react-native';
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
import { useSettingsStore } from '@/stores/settings';
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
  setArtworkFromUrl: (url: string | undefined) => void;
  resetArtwork: () => void;
}

const ThemeContext = createContext<Theme | null>(null);

const paletteCache = new Map<string, ArtworkPalette>();

export function ThemeProvider({ children }: PropsWithChildren) {
  const scheme = useColorScheme();
  const mode: ThemeMode = scheme === 'light' ? 'light' : 'dark';
  const reduceMotion = useReducedMotion();
  const [artwork, setArtwork] = useState<ArtworkPalette>(neutralPalette);
  const [artworkUrl, setArtworkUrl] = useState<string | undefined>(undefined);
  const [isArtwork, setIsArtwork] = useState(false);
  const customAccent = useSettingsStore((state) => state.accentColor);
  const activeUrl = useRef<string | undefined>(undefined);

  const setArtworkFromUrl = useCallback(
    (url: string | undefined) => {
      activeUrl.current = url;
      if (!url) {
        setArtwork(neutralPalette);
        setArtworkUrl(undefined);
        setIsArtwork(false);
        return;
      }
      const cached = paletteCache.get(url);
      if (cached) {
        startTransition(() => {
          setArtwork(cached);
          setArtworkUrl(url);
          setIsArtwork(true);
        });
        return;
      }
      void extractPaletteFromUrl(url).then((palette) => {
        if (activeUrl.current !== url) return;
        paletteCache.set(url, palette);
        // Palette extraction can land mid-gesture; keep that update interruptible.
        startTransition(() => {
          setArtwork(palette);
          setArtworkUrl(url);
          setIsArtwork(palette !== neutralPalette);
        });
      });
    },
    [],
  );

  const resetArtwork = useCallback(() => {
    activeUrl.current = undefined;
    setArtwork(neutralPalette);
    setArtworkUrl(undefined);
    setIsArtwork(false);
  }, []);

  useEffect(() => {
    // Keep the cache bounded.
    if (paletteCache.size > 120) {
      const firstKey = paletteCache.keys().next().value;
      if (firstKey) paletteCache.delete(firstKey);
    }
  }, [artwork]);

  const value = useMemo<Theme>(() => {
    const base = mode === 'light' ? lightColors : darkColors;
    const useArtwork = mode === 'dark' && isArtwork;
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
      reduceMotion,
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
