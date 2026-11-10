import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useTrashAction } from '@/hooks/useTrashAction';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'button, a, input, textarea, select, [role="button"], [role="link"], [role="adjustable"], [contenteditable="true"]',
      ),
    )
  );
}

const CHORD_TIMEOUT_MS = 900;

/** Web keyboard-first transport and navigation. Native uses hardware/media keys. */
export function KeyboardBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const focusSearch = useUIStore((state) => state.focusSearch);
  const trash = useTrashAction();
  const chord = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const ui = useUIStore.getState();
      const player = usePlayerStore.getState();
      const typing = isTypingTarget(event.target);

      if (event.key === 'Escape') {
        if (ui.shortcutsOpen) {
          event.preventDefault();
          ui.setShortcutsOpen(false);
          return;
        }
        // Let React Native Web modals run their own onRequestClose first; the
        // player sheet is a dialog too but closes through its spring.
        const modals = Array.from(document.querySelectorAll('[aria-modal="true"]'));
        const hasOtherModal = modals.some(
          (node) => node.getAttribute('data-testid') !== 'player-sheet',
        );
        if (hasOtherModal) return;
        if (ui.playerOpen) {
          event.preventDefault();
          ui.requestClosePlayer();
          return;
        }
        if (pathname === '/lyrics' || pathname === '/devices' || pathname === '/queue') {
          event.preventDefault();
          router.back();
        }
        return;
      }

      if (typing) return;

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        ui.setShortcutsOpen(!ui.shortcutsOpen);
        chord.current = null;
        return;
      }

      if (ui.shortcutsOpen) return;

      // Other sheets (action menu, add-to-playlist) own the keyboard while open.
      const hasOtherModal = Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
        (node) => node.getAttribute('data-testid') !== 'player-sheet',
      );
      if (hasOtherModal) return;

      if (event.key === '/' && !ui.playerOpen) {
        event.preventDefault();
        focusSearch();
        router.navigate('/(main)/library');
        chord.current = null;
        return;
      }

      // g h / g l / g d / g s / g q navigation chord.
      const now = Date.now();
      if (chord.current && now - chord.current.at < CHORD_TIMEOUT_MS) {
        const second = event.key.toLowerCase();
        const routes: Record<string, string> = {
          h: '/',
          l: '/(main)/library',
          d: '/(main)/downloads',
          s: '/(main)/settings',
          q: '/queue',
        };
        const route = routes[second];
        chord.current = null;
        if (route && !ui.playerOpen) {
          event.preventDefault();
          router.navigate(route as never);
          return;
        }
      } else {
        chord.current = null;
      }

      if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        chord.current = { key: 'g', at: now };
        return;
      }

      if (event.repeat) return;

      if (event.key === 'Delete' && ui.playerOpen && player.queueState.queue.length > 0) {
        event.preventDefault();
        void trash(player.queueState.index);
        return;
      }

      if (event.key === ' ') {
        // Global transport even when a transport button still has focus; a
        // focused button used to re-run the last action instead of play/pause.
        // Capture + stopPropagation keeps React Native Web's Pressable from
        // activating the focused button first.
        if (player.queueState.queue.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        void player.toggle();
        return;
      }

      if (
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        !isInteractiveTarget(event.target)
      ) {
        if (player.queueState.queue.length === 0 || player.duration <= 0) return;
        event.preventDefault();
        const delta = (event.shiftKey ? 30 : 5) * (event.key === 'ArrowRight' ? 1 : -1);
        void player.seek(Math.max(0, Math.min(player.duration, player.position + delta)));
        return;
      }

      if (event.key.toLowerCase() === 'n' && player.queueState.queue.length > 0) {
        event.preventDefault();
        void player.next();
        return;
      }

      if (event.key.toLowerCase() === 'p' && player.queueState.queue.length > 0) {
        event.preventDefault();
        void player.previous();
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        player.toggleShuffle();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        player.cycleRepeat();
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        if (player.queueState.queue.length === 0) return;
        event.preventDefault();
        ui.requestTogglePlayer();
        return;
      }

      if (event.key.toLowerCase() === 'q' && !ui.playerOpen) {
        event.preventDefault();
        if (pathname === '/queue') router.back();
        else router.push('/queue');
      }
    };

    // Capture so global transport wins over a focused Pressable's own Space
    // handler; typing targets and open modals still opt out above.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusSearch, pathname, router, trash]);

  return null;
}
