import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

function routeLabel(pathname: string): string {
  if (!pathname || pathname === '/') return 'Home';
  const clean = pathname.replace(/^\/\(main\)\/?/, '/');
  if (clean.startsWith('/album/')) return 'Album';
  if (clean.startsWith('/artist/')) return 'Artist';
  if (clean.startsWith('/playlist/')) return 'Playlist';
  if (clean.startsWith('/genre/')) return 'Genre';
  const leaf = clean.split('/').filter(Boolean).pop() ?? 'Home';
  return leaf.charAt(0).toUpperCase() + leaf.slice(1).replace(/-/g, ' ');
}

/**
 * Moves focus to the main landmark after a route change and announces the new
 * screen. It deliberately does not steal focus from a text field or an open
 * modal (player, queue, action sheet).
 */
export function RouteFocus() {
  const pathname = usePathname();
  const theme = useTheme();
  const announcement = `Navigated to ${routeLabel(pathname)}`;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Focus after the screen has committed, but do not race a text field or a
    // modal that just took focus (search shortcut, player, queue, action sheet).
    const raf = window.requestAnimationFrame(() => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        active.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return;
      }
      const main = document.getElementById('main-content');
      main?.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.srOnly, { color: theme.colors.text }]}
    >
      {announcement}
    </Text>
  );
}

const styles = StyleSheet.create({
  srOnly: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
});
