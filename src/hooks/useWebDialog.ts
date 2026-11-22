import { useEffect, type ComponentRef, type RefObject } from 'react';
import { Platform, type View } from 'react-native';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Web-only dialog behaviour for full-screen overlays that are not RN Modals
 * (the player sheet). When closed, `inert` keeps the hidden controls out of the
 * tab order. When open, focus moves inside, Tab is trapped, and closing
 * restores the previously focused element.
 */
export function useWebDialog(
  open: boolean,
  ref: RefObject<ComponentRef<typeof View> | null>,
  autoFocusSelector?: string,
) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    if (!open) {
      node.setAttribute('inert', '');
      return () => node.removeAttribute('inert');
    }

    node.removeAttribute('inert');
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
        if (element.closest('[aria-hidden="true"]')) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      });

    const initial =
      (autoFocusSelector ? node.querySelector<HTMLElement>(autoFocusSelector) : null) ??
      focusables()[0] ??
      node;
    if (initial === node && !node.hasAttribute('tabindex')) node.tabIndex = -1;
    const timer = window.setTimeout(() => initial.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      // A child modal (Add to playlist) owns the keyboard while it is up.
      const childModal = document.querySelector(
        '[role="dialog"][aria-modal="true"]:not([data-testid="player-sheet"])',
      );
      if (childModal) return;
      const list = focusables();
      if (list.length === 0) return;
      if (!node.contains(document.activeElement)) {
        // Focus can fall to <body> after a nested sheet closes or an inert
        // subtree is removed. Recover into the dialog instead of tabbing into
        // the background.
        event.preventDefault();
        list[0]!.focus();
        return;
      }
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture at document level: a keydown on <body> never bubbles through
    // the dialog node, so a node listener could not recover lost focus.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [autoFocusSelector, open, ref]);
}
