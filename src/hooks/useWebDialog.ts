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
    const timer = window.setTimeout(() => initial.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
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

    node.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      node.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [autoFocusSelector, open, ref]);
}
