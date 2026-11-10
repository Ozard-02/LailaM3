import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Input';
import { Pill } from '@/ui/Pill';
import { ProgressBar } from '@/ui/ProgressBar';
import { Skeleton } from '@/ui/Skeleton';
import { Surface } from '@/ui/Surface';
import { Text } from '@/ui/Text';

export default function GalleryScreen() {
  const [value, setValue] = useState(0.35);
  const [selected, setSelected] = useState(true);

  return (
    <Screen title="Component gallery" subtitle="Design-system primitives in one place.">
      <Surface style={styles.section} bordered>
        <Text variant="headline">Buttons</Text>
        <View style={styles.row}>
          <Button label="Primary" onPress={() => undefined} />
          <Button label="Secondary" variant="secondary" onPress={() => undefined} />
          <Button label="Ghost" variant="ghost" onPress={() => undefined} />
          <Button label="Danger" variant="danger" onPress={() => undefined} />
          <Button label="Loading" loading onPress={() => undefined} />
        </View>
        <View style={styles.row}>
          <IconButton label="Example icon" selected onPress={() => undefined}>
            <Text>★</Text>
          </IconButton>
          <IconButton label="Another icon" variant="soft" onPress={() => undefined}>
            <Text>♪</Text>
          </IconButton>
        </View>
      </Surface>

      <Surface style={styles.section} bordered>
        <Text variant="headline">Selection</Text>
        <View style={styles.row}>
          <Pill label="Selected" selected={selected} onPress={() => setSelected(true)} />
          <Pill label="Unselected" selected={!selected} onPress={() => setSelected(false)} />
        </View>
        <Input placeholder="Text input" hint="Focus-visible ring appears on keyboard focus." />
      </Surface>

      <Surface style={styles.section} bordered>
        <Text variant="headline">Progress</Text>
        <ProgressBar label="Example progress" value={value} max={1} showThumb />
        <View style={styles.row}>
          <Button label="Less" size="sm" variant="secondary" onPress={() => setValue((v) => Math.max(0, v - 0.1))} />
          <Button label="More" size="sm" variant="secondary" onPress={() => setValue((v) => Math.min(1, v + 0.1))} />
        </View>
      </Surface>

      <Surface style={styles.section} bordered>
        <Text variant="headline">States</Text>
        <Skeleton style={{ width: '100%', height: 48, borderRadius: 8 }} />
        <EmptyState title="Empty state" message="Nothing here yet." />
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    padding: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
});
