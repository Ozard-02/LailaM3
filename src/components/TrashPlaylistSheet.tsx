import { Check, Lock, Music2, Shuffle, Trash2, X } from '@/ui/icons';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Playlist } from '@/core/models';
import { withExclusiveComment } from '@/core/exclusions';
import { serverKey } from '@/core/queryKeys';
import { updatePlaylist } from '@/core/subsonic/client';
import { usePlaylists } from '@/hooks/useLibrary';
import { refreshExcludedSongIds } from '@/services/exclusions';
import { invalidatePlaylistQueries } from '@/services/query';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { useTheme } from '@/theme/ThemeProvider';
import { BottomSheetModal } from '@/ui/BottomSheetModal';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { Text } from '@/ui/Text';

/** Choose the playlist used by the queue trash action. */
export function TrashPlaylistSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const server = useAuthStore((state) => state.server);
  const playlists = usePlaylists();
  const trashPlaylistIds = useSettingsStore((state) => state.trashPlaylistIds);
  const setTrashPlaylist = useSettingsStore((state) => state.setTrashPlaylist);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedId = server ? trashPlaylistIds[serverKey(server)] : undefined;
  const visiblePlaylists = [...(playlists.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const choose = async (playlist: Playlist | null) => {
    if (!server || busy) return;
    setError(null);
    setBusy(playlist?.id ?? 'none');
    try {
      if (!playlist) {
        setTrashPlaylist(serverKey(server), null);
        onClose();
        return;
      }
      const readOnly = Boolean(
        playlist.owner && server.username && playlist.owner !== server.username,
      );
      if (readOnly) return;
      const comment = withExclusiveComment(playlist.comment, server.username, true);
      if (comment !== (playlist.comment ?? '')) {
        await updatePlaylist(server, playlist.id, { comment });
      }
      setTrashPlaylist(serverKey(server), playlist.id);
      onClose();
      void refreshExcludedSongIds(server).catch(() => undefined);
      invalidatePlaylistQueries();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the playlist.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      dismissLabel="Close trash playlist"
      style={[
        styles.sheet,
        {
          backgroundColor: theme.colors.elevated,
          borderColor: theme.colors.border,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="title">Trash playlist</Text>
          <Text variant="caption" tone="secondary">
            The playlist is marked “Exclude from shuffle” so trashed songs stay out of
            shuffle and radio.
          </Text>
        </View>
        <IconButton label="Close trash playlist" size={38} variant="soft" onPress={onClose}>
          <X size={18} color={theme.colors.text} />
        </IconButton>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <PlaylistRow
          label="No trash playlist"
          hint="Disable the trash action"
          icon={<Trash2 size={17} color={theme.colors.textTertiary} />}
          selected={!selectedId}
          disabled={busy !== null}
          onPress={() => void choose(null)}
        />
        {playlists.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.textSecondary} />
          </View>
        ) : null}
        {visiblePlaylists.map((playlist) => {
          const readOnly = Boolean(
            playlist.owner && server?.username && playlist.owner !== server.username,
          );
          const excluded = Boolean(
            playlist.comment?.includes(`#${server?.username ?? ''}-exclusive`),
          );
          return (
            <PlaylistRow
              key={playlist.id}
              label={playlist.name}
              hint={
                readOnly
                  ? 'Read-only'
                  : excluded
                    ? 'Excluded from shuffle'
                    : `${playlist.songCount ?? 0} tracks`
              }
              icon={
                readOnly ? (
                  <Lock size={16} color={theme.colors.textTertiary} />
                ) : excluded ? (
                  <Shuffle size={16} color={theme.colors.warning} />
                ) : (
                  <Music2 size={16} color={theme.colors.textTertiary} />
                )
              }
              selected={playlist.id === selectedId}
              disabled={readOnly || busy !== null}
              onPress={() => void choose(playlist)}
            />
          );
        })}
        {!playlists.isLoading && visiblePlaylists.length === 0 ? (
          <Text variant="caption" tone="tertiary" style={styles.empty}>
            No playlists yet. Create one in Navidrome first.
          </Text>
        ) : null}
      </ScrollView>

      {error ? (
        <Text variant="caption" tone="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {busy ? (
        <View style={styles.saving}>
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          <Text variant="caption" tone="secondary">
            Saving…
          </Text>
        </View>
      ) : null}
    </BottomSheetModal>
  );
}

function PlaylistRow({
  label,
  hint,
  icon,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}${hint ? `, ${hint}` : ''}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={false}
    >
      <View
        style={[
          styles.row,
          {
            borderBottomColor: theme.colors.border,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        {icon}
        <View style={styles.rowText}>
          <Text variant="callout" tone={selected ? 'accent' : 'primary'}>
            {label}
          </Text>
          {hint ? (
            <Text variant="caption" tone="tertiary">
              {hint}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <Check size={18} color={theme.colors.accent} />
        ) : (
          <View style={styles.checkSpacer} />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
    gap: 10,
    maxHeight: '78%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  checkSpacer: {
    width: 18,
  },
  loading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 20,
  },
  error: {
    paddingTop: 4,
  },
  saving: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 4,
  },
});
