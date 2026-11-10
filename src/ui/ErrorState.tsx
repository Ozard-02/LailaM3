import { AlertTriangle } from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Block-level failure with a retry, used when a whole query cannot render. */
export function ErrorState({
  title = 'Could not load this',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.base, { padding: theme.spacing.xxxl }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <AlertTriangle size={28} color={theme.colors.danger} />
      <Text variant="headline" style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="secondary" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={styles.action}>
          <Button label={retryLabel} size="sm" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    maxWidth: 420,
  },
  action: {
    marginTop: 12,
  },
});
