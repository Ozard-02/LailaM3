import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, KeyRound, Lock, Music2, Server, User } from '@/ui/icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/ui/Button';
import { HeaderEditor, type HeaderEditorValue } from '@/components/HeaderEditor';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { Input } from '@/ui/Input';
import { Surface } from '@/ui/Surface';
import { Text } from '@/ui/Text';
import { isServerUsable, useAuthStore, type Credentials } from '@/stores/auth';
import { networkMonitor, requestNetworkPermission } from '@/services/network';
import { CELLULAR_NETWORK, type NetworkInfo } from '@/ports/network';
import { useTheme } from '@/theme/ThemeProvider';
import { headersToRows, parseHeaderRows } from '@/core/http/headers';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { add, reconnect: reconnectParam } = useLocalSearchParams<{ add?: string; reconnect?: string }>();
  const adding = add === '1';
  const reconnect = reconnectParam === '1';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const connect = useAuthStore((state) => state.connect);
  const connecting = useAuthStore((state) => state.connecting);
  const authError = useAuthStore((state) => state.error);
  const restoreFallback = useAuthStore((state) => state.restoreFallback);
  const canRestore = useAuthStore((state) =>
    state.servers.some((item) => isServerUsable(item)),
  );

  const savedServer = reconnect ? useAuthStore.getState().server : null;
  const [url, setUrl] = useState(savedServer?.url ?? '');
  const [username, setUsername] = useState(savedServer?.username ?? '');
  const [authMode, setAuthMode] = useState<'apiKey' | 'token'>(savedServer?.authMode ?? 'apiKey');
  const [apiKey, setApiKey] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [serverName, setServerName] = useState(savedServer?.name ?? '');
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [bindNetwork, setBindNetwork] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [showHeaders, setShowHeaders] = useState(Boolean(savedServer?.headers));
  const [headerValue, setHeaderValue] = useState<HeaderEditorValue>(() =>
    parseHeaderRows(headersToRows(savedServer?.headers)),
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void networkMonitor.get().then(setNetwork);
  }, []);


  const bindCurrentNetwork = async () => {
    setNetworkError(null);
    const granted = await requestNetworkPermission();
    if (!granted) {
      setNetworkError('Location permission is needed to read the Wi-Fi name.');
      return;
    }
    const info = await networkMonitor.get();
    setNetwork(info);
    if (info.type === 'none' || (info.type === 'wifi' && !info.ssid)) {
      setNetworkError('Could not detect the current network.');
      return;
    }
    setBindNetwork(true);
  };

  const submit = async () => {
    const credentials: Credentials = {
      url,
      username,
      authMode,
      apiKey: authMode === 'apiKey' ? apiKey : undefined,
      password: authMode === 'token' ? password : undefined,
      name: serverName.trim() || undefined,
      headers: headerValue.headers,
      network:
        bindNetwork && network
          ? network.type === 'cellular'
            ? CELLULAR_NETWORK
            : network.ssid
          : undefined,
    };
    const ok = await connect(credentials, { remember });
    if (ok) {
      if (adding) router.back();
      else router.replace('/(main)');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <LinearGradient
        colors={[theme.colors.accentSoft, 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.9 }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.grid, wide && styles.gridWide]}>
            <View style={[styles.hero, wide && styles.heroWide]}>
              <View
                style={[
                  styles.logo,
                  { backgroundColor: theme.colors.accent, borderRadius: theme.radius.xl },
                ]}
              >
                <Music2 size={34} color="#fff" strokeWidth={2.4} />
              </View>
              <Text variant="display" style={styles.title}>
                Laila
              </Text>
              <Text variant="body" tone="secondary" style={styles.subtitle}>
                Your library, everywhere. A calm, fast client for your Navidrome or
                OpenSubsonic server.
              </Text>
              <View style={styles.bullets}>
                {['Original quality', 'Adaptive layout', 'Segue-ready'].map((item) => (
                  <View key={item} style={styles.bullet}>
                    <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
                    <Text variant="callout" tone="secondary">
                      {item}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <Surface
              variant="raised"
              bordered
              radius={theme.radius.lg}
              style={[styles.card, wide && styles.cardWide]}
            >
              <Text variant="title">{adding ? 'Add server' : reconnect ? 'Unlock server' : 'Connect'}</Text>
              <Text variant="caption" tone="secondary" style={styles.cardHint}>
                Credentials stay on this device. Nothing is sent anywhere except your
                server.
              </Text>
              {reconnect ? (
                <>
                  <Text variant="caption" tone="secondary">
                    This session was saved without its secret. Enter the API key or password
                    again to unlock it.
                  </Text>
                  {canRestore ? (
                    <Button
                      label="Back to another server"
                      size="sm"
                      variant="ghost"
                      onPress={() => {
                        restoreFallback();
                        router.replace('/(main)');
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              <Input
                label="Server name (optional)"
                placeholder="Home Wi-Fi"
                value={serverName}
                onChangeText={setServerName}
                importantForAutofill="no"
                autoComplete="off"
              />
              <Input
                label="Server URL"
                placeholder="https://music.example.com"
                value={url}
                onChangeText={setUrl}
                keyboardType="url"
                autoComplete="url"
                textContentType="URL"
                importantForAutofill="no"
                hint={
                  url.trim().startsWith('http://')
                    ? 'HTTP is unencrypted. Use it only on a trusted LAN.'
                    : undefined
                }
                trailing={<Server size={18} color={theme.colors.textTertiary} />}
              />
              <Input
                label="Username"
                placeholder="your username"
                value={username}
                onChangeText={setUsername}
                autoComplete="username"
                textContentType="username"
                importantForAutofill="yes"
                trailing={<User size={18} color={theme.colors.textTertiary} />}
              />

              <View style={styles.modeRow}>
                {(['apiKey', 'token'] as const).map((mode) => {
                  const selected = authMode === mode;
                  return (
                    <Button
                      key={mode}
                      label={mode === 'apiKey' ? 'API key' : 'Password'}
                      size="sm"
                      variant={selected ? 'secondary' : 'ghost'}
                      onPress={() => setAuthMode(mode)}
                      style={styles.modeButton}
                    />
                  );
                })}
              </View>

              {authMode === 'apiKey' ? (
                <Input
                  label="OpenSubsonic API key"
                  placeholder="paste your API key"
                  value={apiKey}
                  onChangeText={setApiKey}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  importantForAutofill="yes"
                  trailing={<KeyRound size={18} color={theme.colors.textTertiary} />}
                  hint="Preferred: revocable, and safer than storing a password."
                />
              ) : (
                <Input
                  label="Password"
                  placeholder="your password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  importantForAutofill="yes"
                  trailing={<Lock size={18} color={theme.colors.textTertiary} />}
                  hint="Used once to derive a token. The password is never stored."
                />
              )}

              <Button
                label="Proxy headers"
                size="sm"
                variant={showHeaders ? 'secondary' : 'ghost'}
                onPress={() => setShowHeaders((value) => !value)}
              />
              {showHeaders ? (
                <HeaderEditor
                  initialValue={savedServer?.headers}
                  onChange={setHeaderValue}
                />
              ) : null}

              {Platform.OS !== 'web' ? (
                <View style={styles.networkBlock}>
                  <Button
                    label={
                      bindNetwork && network
                        ? network.type === 'cellular'
                          ? 'Bound to cellular'
                          : `Bound to ${network.ssid ?? 'Wi-Fi'}`
                        : 'Bind to current network'
                    }
                    size="sm"
                    variant={bindNetwork ? 'secondary' : 'ghost'}
                    onPress={() => {
                      if (bindNetwork) setBindNetwork(false);
                      else void bindCurrentNetwork();
                    }}
                  />
                  <Text variant="caption" tone={networkError ? 'danger' : 'tertiary'}>
                    {networkError ??
                      'Optional: switch to this address automatically on this Wi-Fi or cellular network.'}
                  </Text>
                </View>
              ) : null}

              <Button
                label="Remember this server"
                size="sm"
                variant={remember ? 'secondary' : 'ghost'}
                onPress={() => setRemember((value) => !value)}
                icon={
                  <View
                    style={[
                      styles.check,
                      {
                        backgroundColor: remember ? theme.colors.accent : 'transparent',
                        borderColor: remember ? theme.colors.accent : theme.colors.borderStrong,
                      },
                    ]}
                  />
                }
              />
              {authMode === 'token' ? (
                <Text variant="caption" tone="tertiary">
                  {remember
                    ? 'A remembered password session stores a replayable token on this device. Do not use it on a shared device.'
                    : 'Without remember, the password stays in memory only and is asked again after a reload.'}
                </Text>
              ) : null}

              {authError ? <ErrorNotice message={authError} /> : null}

              <Button
                label="Connect"
                size="lg"
                fullWidth
                loading={connecting}
                disabled={Boolean(headerValue.error)}
                onPress={() => void submit()}
                icon={<ArrowRight size={18} color="#fff" />}
                style={styles.connect}
              />
            </Surface>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  grid: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    gap: 32,
  },
  gridWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 64,
  },
  hero: {
    gap: 14,
  },
  heroWide: {
    flex: 1,
  },
  logo: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 8,
  },
  subtitle: {
    maxWidth: 440,
  },
  bullets: {
    gap: 8,
    marginTop: 8,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  card: {
    gap: 16,
    padding: 24,
  },
  cardWide: {
    width: 420,
  },
  cardHint: {
    marginTop: -8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
  },
  connect: {
    marginTop: 4,
  },
  networkBlock: {
    gap: 6,
    alignItems: 'flex-start',
  },
});
