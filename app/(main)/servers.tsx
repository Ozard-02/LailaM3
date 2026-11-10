import { useRouter } from 'expo-router';
import { Check, Circle, Plus, Server, Settings2, Trash2, Wifi } from '@/ui/icons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ServerConfig } from '@/core/models';
import { ping } from '@/core/subsonic/client';
import { headersToRows, parseHeaderRows } from '@/core/http/headers';
import { HeaderEditor, type HeaderEditorValue } from '@/components/HeaderEditor';
import { CELLULAR_NETWORK, type NetworkInfo } from '@/ports/network';
import { networkMonitor, requestNetworkPermission } from '@/services/network';
import { isServerUsable, useAuthStore } from '@/stores/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorNotice } from '@/ui/ErrorNotice';
import { IconButton } from '@/ui/IconButton';
import { Screen } from '@/components/Screen';
import { Surface } from '@/ui/Surface';
import { Text } from '@/ui/Text';

function networkLabel(server: ServerConfig): string {
  if (!server.network) return 'Any network';
  if (server.network === CELLULAR_NETWORK) return 'Cellular';
  return server.network;
}

function serverKey(server: ServerConfig): string {
  return `${server.url}|${server.username}`;
}

interface TestResult {
  ok: boolean;
  ms?: number;
  message?: string;
}

async function pingWithLatency(server: ServerConfig): Promise<number> {
  const started = Date.now();
  await ping(server);
  return Date.now() - started;
}

function displayName(server: ServerConfig): string {
  if (server.name) return server.name;
  try {
    return new URL(server.url).host;
  } catch {
    return server.url;
  }
}

export default function ServersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const servers = useAuthStore((state) => state.servers);
  const active = useAuthStore((state) => state.server);
  const switchServer = useAuthStore((state) => state.switchServer);
  const removeServer = useAuthStore((state) => state.removeServer);
  const setServerNetwork = useAuthStore((state) => state.setServerNetwork);
  const setServerHeaders = useAuthStore((state) => state.setServerHeaders);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [headerValue, setHeaderValue] = useState<HeaderEditorValue>({ error: null });
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void networkMonitor.get().then(setNetwork);
  }, []);

  const startHeaderEdit = (server: ServerConfig) => {
    setEditingKey(serverKey(server));
    setHeaderValue(parseHeaderRows(headersToRows(server.headers)));
  };

  const saveHeaders = (server: ServerConfig) => {
    if (headerValue.error) return;
    setServerHeaders(server.url, server.username, headerValue.headers);
    setEditingKey(null);
  };

  const testServer = async (server: ServerConfig) => {
    const key = serverKey(server);
    if (!isServerUsable(server)) {
      setTestResults((current) => ({
        ...current,
        [key]: { ok: false, message: 'Needs its secret again' },
      }));
      return;
    }
    setTestingKey(key);
    try {
      const ms = await pingWithLatency(server);
      setTestResults((current) => ({
        ...current,
        [key]: { ok: true, ms },
      }));
    } catch {
      setTestResults((current) => ({
        ...current,
        [key]: { ok: false, message: 'Unreachable' },
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const bindCurrent = async (server: ServerConfig) => {
    setError(null);
    if (Platform.OS === 'web') {
      setError('Network binding is available on Android in v1.');
      return;
    }
    const granted = await requestNetworkPermission();
    if (!granted) {
      setError('Location permission is needed to read the Wi-Fi name.');
      return;
    }
    const info = await networkMonitor.get();
    setNetwork(info);
    if (info.type === 'none' || (info.type === 'wifi' && !info.ssid)) {
      setError('Could not detect the current network.');
      return;
    }
    setServerNetwork(
      server.url,
      server.username,
      info.type === 'cellular' ? CELLULAR_NETWORK : (info.ssid ?? ''),
    );
  };

  return (
    <Screen
      title="Servers"
      subtitle="The same library can answer at more than one address."
      right={
        <Button
          label="Add server"
          size="sm"
          icon={<Plus size={15} color="#fff" />}
          onPress={() => router.push('/login?add=1')}
        />
      }
    >
      <Surface style={styles.note} bordered>
        <Text variant="caption" tone="secondary">
          Bind an instance to a Wi-Fi name or to cellular. Laila switches automatically
          when the network changes, and falls back to the unbound instance. Downloads are
          keyed by song id, so the downloaded flag follows you across addresses of the
          same library. Test pings a server without switching; proxy headers are sent on
          every request and their values are never logged.
        </Text>
        {network ? (
          <Text variant="caption" tone="tertiary">
            Current network: {network.type === 'cellular' ? 'Cellular' : network.ssid ?? 'Unknown'}
          </Text>
        ) : null}
        {error ? <ErrorNotice message={error} /> : null}
      </Surface>

      {servers.length ? (
        servers.map((server) => {
          const isActive = active?.url === server.url && active.username === server.username;
          const key = serverKey(server);
          const result = testResults[key];
          const editing = editingKey === key;
          return (
            <Surface key={key} style={styles.card} bordered>
              <View style={styles.row}>
                <View style={[styles.mark, { backgroundColor: isActive ? theme.colors.accentSoft : theme.colors.elevated2 }]}>
                  <Server size={18} color={isActive ? theme.colors.accent : theme.colors.textSecondary} />
                </View>
                <View style={styles.text}>
                  <View style={styles.nameRow}>
                    <Text variant="callout" style={styles.strong} numberOfLines={1}>
                      {displayName(server)}
                    </Text>
                    {isActive ? <Circle size={7} color={theme.colors.success} fill={theme.colors.success} /> : null}
                  </View>
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {server.url}
                  </Text>
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {server.username} · {networkLabel(server)}
                    {server.headers ? ` · ${Object.keys(server.headers).length} proxy headers` : ''}
                  </Text>
                  {result ? (
                    <Text
                      variant="caption"
                      tone={result.ok ? 'accent' : 'danger'}
                      accessibilityLiveRegion="polite"
                    >
                      {result.ok ? `Online · ${result.ms} ms` : result.message}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.actions}>
                  <Button
                    label={testingKey === key ? 'Testing…' : 'Test'}
                    size="sm"
                    variant="ghost"
                    disabled={testingKey === key}
                    onPress={() => void testServer(server)}
                    accessibilityLabel={`Test ${displayName(server)}`}
                  />
                  {!isActive ? (
                    <Button
                      label="Use"
                      size="sm"
                      variant="secondary"
                      onPress={() => switchServer(server.url, server.username)}
                    />
                  ) : (
                    <View style={styles.activeBadge}>
                      <Check size={14} color={theme.colors.success} />
                      <Text variant="caption" tone="secondary">
                        Active
                      </Text>
                    </View>
                  )}
                  {Platform.OS !== 'web' ? (
                    <IconButton
                      label={`Bind ${displayName(server)} to current network`}
                      size={34}
                      onPress={() => void bindCurrent(server)}
                    >
                      <Wifi size={16} color={theme.colors.textTertiary} />
                    </IconButton>
                  ) : null}
                  <IconButton
                    label={`Edit proxy headers for ${displayName(server)}`}
                    size={34}
                    onPress={() => startHeaderEdit(server)}
                  >
                    <Settings2 size={16} color={theme.colors.textTertiary} />
                  </IconButton>
                  <IconButton
                    label={`Remove ${displayName(server)}`}
                    size={34}
                    onPress={() => removeServer(server.url, server.username)}
                  >
                    <Trash2 size={16} color={theme.colors.textTertiary} />
                  </IconButton>
                </View>
              </View>
              {editing ? (
                <View style={[styles.editor, { borderTopColor: theme.colors.border }]}>
                  <HeaderEditor
                    initialValue={server.headers}
                    onChange={setHeaderValue}
                  />
                  <View style={styles.editorActions}>
                    <Button
                      label="Save headers"
                      size="sm"
                      disabled={Boolean(headerValue.error)}
                      onPress={() => saveHeaders(server)}
                    />
                    <Button
                      label="Cancel"
                      size="sm"
                      variant="ghost"
                      onPress={() => setEditingKey(null)}
                    />
                  </View>
                </View>
              ) : null}
            </Surface>
          );
        })
      ) : (
        <EmptyState
          title="No servers saved"
          message="Sign in to a Navidrome or OpenSubsonic server first."
          icon={<Server size={30} color={theme.colors.textTertiary} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    padding: 16,
    gap: 6,
  },
  card: {
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  strong: {
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editor: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
});
