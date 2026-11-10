import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomChromeInset } from '@/hooks/useBottomChromeInset';
import { Text } from '@/ui/Text';

export interface ScreenProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
  scroll?: boolean;
  contentStyle?: ScrollViewProps['contentContainerStyle'];
  /** Measured width of the padded body, after the sidebar/rail. */
  onBodyLayout?: (event: LayoutChangeEvent) => void;
}

export function Screen({
  title,
  subtitle,
  children,
  right,
  scroll = true,
  contentStyle,
  onBodyLayout,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const chromeInset = useBottomChromeInset();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const padding = compact ? 16 : 28;

  const header =
    title || right ? (
      <View style={styles.header}>
        <View style={styles.headerText}>
          {title ? <Text variant={compact ? 'largeTitle' : 'display'}>{title}</Text> : null}
          {subtitle ? (
            <Text variant="body" tone="secondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    ) : null;

  const body = (
    <View
      onLayout={onBodyLayout}
      style={[
        styles.body,
        !scroll && styles.bodyFill,
        { paddingHorizontal: padding, paddingTop: insets.top + 18 },
      ]}
    >
      {header}
      {children}
    </View>
  );

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: 'transparent' }]}>
        <View style={{ flex: 1, minHeight: 0 }}>{body}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: chromeInset + 24 },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  body: {
    width: '100%',
    maxWidth: 1480,
    alignSelf: 'center',
    gap: 20,
  },
  bodyFill: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 4,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  subtitle: {
    maxWidth: 680,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
