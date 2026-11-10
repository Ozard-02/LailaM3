import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { ComponentRef, RefObject } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  containerStyle?: ViewStyle;
  trailing?: React.ReactNode;
  inputRef?: RefObject<ComponentRef<typeof TextInput> | null>;
}

export function Input({
  label,
  hint,
  error,
  containerStyle,
  trailing,
  inputRef,
  style,
  ...rest
}: InputProps) {
  const theme = useTheme();
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="caption" tone="secondary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.elevated,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <TextInput
          {...rest}
          ref={inputRef}
          placeholderTextColor={theme.colors.textTertiary}
          style={[styles.input, { color: theme.colors.text }, style]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" style={styles.hint}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    marginLeft: 2,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  } as object,
  hint: {
    marginLeft: 2,
  },
});
