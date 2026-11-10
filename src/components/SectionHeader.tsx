import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="title">{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
});
