import { createElement, useState } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Web-only "skip to content" link. A real anchor gives native Enter/click
 * behaviour and jumps to the single `#main-content` landmark. It is the first
 * focusable element in the main layout.
 */
export function SkipLink() {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  if (Platform.OS !== 'web') return null;

  return createElement(
    'a',
    {
      href: '#main-content',
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      style: {
        position: 'fixed',
        left: 12,
        top: focused ? 12 : -64,
        zIndex: 10000,
        padding: '8px 14px',
        borderRadius: 8,
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.elevated,
        color: theme.colors.text,
        font: '600 14px system-ui, sans-serif',
        textDecoration: 'none',
      },
    },
    'Skip to content',
  );
}
