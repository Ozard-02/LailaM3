import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.base, { padding: theme.spacing.xxxl }]}>
      {icon}
      <Text variant="headline" style={styles.title}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="secondary" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
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
