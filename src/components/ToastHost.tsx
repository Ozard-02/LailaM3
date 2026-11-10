import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '@/stores/player';
import { useUIStore } from '@/stores/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

const TOAST_MS = 4000;

/** Transient bottom message with one optional action (used by Trash undo). */
export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);
  const queueState = usePlayerStore((state) => state.queueState);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hideToast, TOAST_MS);
    return () => clearTimeout(timer);
  }, [hideToast, toast]);

  // A new queue action replaces the old context: the previous Undo is stale.
  useEffect(() => {
    if (useUIStore.getState().toast) hideToast();
  }, [hideToast, queueState]);

  if (!toast) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 84 }]}>
      <Animated.View
        entering={theme.reduceMotion ? undefined : FadeInDown.duration(180)}
        exiting={theme.reduceMotion ? undefined : FadeOutDown.duration(140)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          {
            backgroundColor: theme.colors.elevated2,
            borderColor: toast.tone === 'error' ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Text variant="callout" style={styles.message} numberOfLines={3}>
          {toast.message}
        </Text>
        {toast.actionLabel && toast.onAction ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            haptic={false}
            onPress={() => {
              toast.onAction?.();
              hideToast();
            }}
          >
            <Text variant="callout" tone="accent" style={styles.action}>
              {toast.actionLabel}
            </Text>
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  message: {
    flex: 1,
  },
  action: {
    fontWeight: '600',
  },
});
