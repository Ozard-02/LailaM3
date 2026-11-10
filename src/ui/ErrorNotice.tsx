import { useEffect, useRef, type ComponentRef } from 'react';
import { Platform, type StyleProp, type TextStyle } from 'react-native';
import { Text } from './Text';

export interface ErrorNoticeProps {
  message: string;
  /** Move keyboard focus to the message when it appears (web). */
  focus?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * Inline error with an alert/live-region announcement. On web it can take
 * focus so a keyboard or screen-reader user lands on the failure instead of
 * staying on a button that silently did nothing.
 */
export function ErrorNotice({ message, focus = true, style }: ErrorNoticeProps) {
  const ref = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    if (!focus || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const node = ref.current as unknown as HTMLElement | null;
      node?.focus?.({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focus, message]);

  return (
    <Text
      ref={ref}
      variant="caption"
      tone="danger"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      tabIndex={Platform.OS === 'web' ? -1 : undefined}
      style={style}
    >
      {message}
    </Text>
  );
}
