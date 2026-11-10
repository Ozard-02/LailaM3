import { BlurView } from 'expo-blur';
import { usePathname, useRouter } from 'expo-router';
import {
  Download,
  Home,
  Library,
  Settings,
  type LucideIcon,
} from '@/ui/icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/stores/settings';
import { chromeRadii } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { Artwork } from '@/ui/Artwork';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/(main)', icon: Home },
  { label: 'Library', href: '/(main)/library', icon: Library },
  { label: 'Downloads', href: '/(main)/downloads', icon: Download },
  { label: 'Settings', href: '/(main)/settings', icon: Settings },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => {
    if (href === '/(main)') return pathname === '/' || pathname === '';
    const path = href.replace('/(main)', '');
    return pathname === path || pathname.startsWith(`${path}/`);
  };
}

function NavButton({
  item,
  compact,
  rail,
}: {
  item: NavItem;
  compact?: boolean;
  rail?: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const isActive = useActive()(item.href);
  const Icon = item.icon;
  const color = isActive ? theme.colors.text : theme.colors.textSecondary;

  if (rail) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isActive }}
        onPress={() => router.navigate(item.href as never)}
        style={[
          styles.railItem,
          {
            backgroundColor: isActive ? theme.colors.accentSoft : 'transparent',
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Icon size={26} color={isActive ? theme.colors.accent : color} />
      </PressableScale>
    );
  }

  if (compact) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isActive }}
        onPress={() => router.navigate(item.href as never)}
        containerStyle={styles.tabItem}
        style={styles.tabContent}
      >
        <Icon size={21} color={isActive ? theme.colors.accent : color} />
        <Text
          variant="label"
          tone={isActive ? 'accent' : 'tertiary'}
          style={styles.tabLabel}
          numberOfLines={1}
        >
          {item.label}
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: isActive }}
      onPress={() => router.navigate(item.href as never)}
      style={[
        styles.railItem,
        {
          backgroundColor: isActive ? theme.colors.accentSoft : 'transparent',
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Icon size={26} color={isActive ? theme.colors.accent : color} />
    </PressableScale>
  );
}

export function Rail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.rail,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.railNav}>
        {NAV_ITEMS.map((item) => (
          <NavButton key={item.href} item={item} rail />
        ))}
      </View>
    </View>
  );
}

export function BottomTabs() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceBlur = useSettingsStore((state) => state.reduceBlur);
  const chromeRadius = useSettingsStore((state) => state.chromeRadius);
  const tabsStyle = [
    styles.tabs,
    {
      borderColor: theme.colors.border,
      borderRadius: chromeRadii[chromeRadius],
      backgroundColor: reduceBlur
        ? theme.colors.elevated
        : theme.mode === 'dark'
          ? 'rgba(22,22,25,0.72)'
          : 'rgba(255,255,255,0.72)',
    },
  ];
  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabsWrap, { bottom: Math.max(insets.bottom, 10) }]}
    >
      {reduceBlur ? (
        <View style={tabsStyle}>
          {NAV_ITEMS.map((item) => (
            <NavButton key={item.href} item={item} compact />
          ))}
        </View>
      ) : (
        <BlurView
          intensity={50}
          tint={theme.mode === 'dark' ? 'dark' : 'light'}
          style={tabsStyle}
        >
          {NAV_ITEMS.map((item) => (
            <NavButton key={item.href} item={item} compact />
          ))}
        </BlurView>
      )}
    </View>
  );
}

export function PlayerArtworkBadge() {
  return <Artwork size={40} />;
}

const styles = StyleSheet.create({
  rail: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  railNav: {
    gap: 10,
  },
  railItem: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 30,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 440,
    height: 62,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
  },
  tabContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    width: '100%',
    fontSize: 9,
    textAlign: 'center',
  },
});
