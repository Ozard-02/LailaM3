import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

const STYLE_ID = 'laila-focus-styles';

/**
 * The single-file web export does not include `app/+html.tsx`, so inject the
 * focus ring at runtime. `:focus-visible` keeps mouse presses clean while
 * giving every keyboard control the same visible ring.
 */
export function WebFocusStyles() {
  const theme = useTheme();
  const accent = theme.colors.accent;
  const background = theme.colors.background;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      :root { color-scheme: dark light; }
      :where(button, a, input, textarea, select, [role="button"], [role="link"], [role="slider"], [role="tab"], [tabindex="0"]):focus-visible {
        outline: 2px solid ${accent} !important;
        outline-offset: 3px !important;
      }
      :where(button, a, input, textarea, select, [role="button"], [role="link"], [role="slider"], [role="tab"], [tabindex="0"]):focus:not(:focus-visible) {
        outline: none !important;
      }
      #main-content:focus { outline: none !important; }
      ::selection { background: ${accent}59; color: ${background}; }
    `;
  }, [accent, background]);

  return null;
}
