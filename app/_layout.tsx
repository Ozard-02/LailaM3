import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppStateBridge } from '@/components/AppStateBridge';
import { KeyboardBridge } from '@/components/KeyboardBridge';
import { NetworkBridge } from '@/components/NetworkBridge';
import { WebFocusStyles } from '@/components/WebFocusStyles';
import { WebServiceWorker } from '@/components/WebServiceWorker';
import { OfflineBridge } from '@/components/OfflineBridge';
import { PlayerBridge } from '@/components/PlayerBridge';
import { PlayerSourceBridge } from '@/components/PlayerSourceBridge';
import { SegueBridge } from '@/components/SegueBridge';
import { WebMediaSession } from '@/components/WebMediaSession';
import { ShortcutsSheet } from '@/components/ShortcutsSheet';
import { ToastHost } from '@/components/ToastHost';
import { queryClient } from '@/services/query';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function AppStack() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="(main)" options={{ animation: 'none' }} />
        <Stack.Screen
          name="player"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="queue"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="devices"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="lyrics"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <PlayerBridge />
            <WebMediaSession />
            <PlayerSourceBridge />
            <SegueBridge />
            <OfflineBridge />
            <NetworkBridge />
            <AppStateBridge />
            <WebServiceWorker />
            <WebFocusStyles />
            <KeyboardBridge />
            <AppStack />
            <ShortcutsSheet />
            <ToastHost />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
