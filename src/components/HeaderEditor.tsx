import { Plus, Trash2 } from '@/ui/icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  headersToRows,
  parseHeaderRows,
  type HeaderRow,
} from '@/core/http/headers';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Input } from '@/ui/Input';
import { Text } from '@/ui/Text';

export interface HeaderEditorValue {
  headers?: Record<string, string>;
  error: string | null;
}

export interface HeaderEditorProps {
  initialValue?: Record<string, string>;
  onChange: (value: HeaderEditorValue) => void;
}

/**
 * Reverse-proxy headers (Authelia, Cloudflare Access, ...). Values are kept in
 * the server config and never logged; only the names are rendered after save.
 */
export function HeaderEditor({ initialValue, onChange }: HeaderEditorProps) {
  const theme = useTheme();
  const [rows, setRows] = useState<HeaderRow[]>(() => {
    const initial = headersToRows(initialValue);
    return initial.length ? initial : [{ name: '', value: '' }];
  });
  const [error, setError] = useState<string | null>(null);

  const update = (next: HeaderRow[]) => {
    setRows(next);
    const parsed = parseHeaderRows(next);
    setError(parsed.error);
    onChange({ headers: parsed.headers, error: parsed.error });
  };

  const changeRow = (index: number, patch: Partial<HeaderRow>) => {
    update(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)));
  };

  return (
    <View style={styles.wrap}>
      <Text variant="callout" style={styles.title}>
        Reverse proxy headers
      </Text>
      <Text variant="caption" tone="secondary">
        Optional. Sent with API, cover, download and Android playback requests.
        Browsers cannot attach custom headers to an audio element, so use a
        same-origin proxy or API-key auth for web playback. Values stay on this
        device and are never logged.
      </Text>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <Input
            containerStyle={styles.name}
            value={row.name}
            onChangeText={(name) => changeRow(index, { name })}
            placeholder="X-Auth-Request-User"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={`Header ${index + 1} name`}
          />
          <Input
            containerStyle={styles.value}
            value={row.value}
            onChangeText={(value) => changeRow(index, { value })}
            placeholder="value"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={`Header ${index + 1} value`}
          />
          <IconButton
            label={`Remove header ${index + 1}`}
            size={34}
            onPress={() => update(rows.filter((_, current) => current !== index))}
          >
            <Trash2 size={16} color={theme.colors.textTertiary} />
          </IconButton>
        </View>
      ))}
      <View style={styles.actions}>
        <Button
          label="Add header"
          size="sm"
          variant="ghost"
          icon={<Plus size={14} color={theme.colors.textSecondary} />}
          onPress={() => update([...rows, { name: '', value: '' }])}
          disabled={rows.length >= 32}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginTop: 12,
  },
  title: {
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  value: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
  },
});
