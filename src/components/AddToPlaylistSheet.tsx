import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Lock, Music2, Shuffle, X } from '@/ui/icons';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@/core/models';
import { FAVOURITES_COLLECTION } from '@/core/offline';
import { getPlaylist, star, updatePlaylist } from '@/core/subsonic/client';
import { queryKeys } from '@/core/queryKeys';
import { usePlaylists } from '@/hooks/useLibrary';
import { invalidatePlaylistQueries } from '@/services/query';
import { useAuthStore } from '@/stores/auth';
import { isOfflineNow, useOfflineStore } from '@/stores/offline';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { PressableScale } from '@/ui/PressableScale';
import { BottomSheetModal } from '@/ui/BottomSheetModal';
import { Text } from '@/ui/Text';

export function AddToPlaylistSheet({
  tracks,
  onClose,
}: {
  tracks: Track[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const server = useAuthStore((state) => state.server);
  const playlists = usePlaylists();
  const queryClient = useQueryClient();
  const [playlistOverrides, setPlaylistOverrides] = useState<Map<string, boolean>>(new Map());
  const [favouriteOverride, setFavouriteOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uniqueTracks = tracks.filter(
    (track, index, array) => array.findIndex((item) => item.id === track.id) === index,
  );
  const allStarred = uniqueTracks.length > 0 && uniqueTracks.every((track) => track.starred);
  const title = uniqueTracks.length === 1 ? uniqueTracks[0]?.title : `${uniqueTracks.length} tracks`;
  const favouriteSelected = favouriteOverride ?? allStarred;
  const canApply = playlistOverrides.size > 0 || favouriteOverride !== null;

  const visiblePlaylists = playlists.data ?? [];
  const membership = useQuery({
    queryKey: queryKeys.playlistMembership(
      server,
      visiblePlaylists.map((playlist) => playlist.id),
      uniqueTracks.map((track) => track.id),
    ),
    queryFn: async () => {
      if (!server) return [];
      return Promise.all(
        visiblePlaylists.map(async (playlist) => {
          const full = await getPlaylist(server, playlist.id);
          return {
            id: playlist.id,
            trackIds: (full.songs ?? []).map((track) => track.id),
          };
        }),
      );
    },
    enabled: Boolean(server && visiblePlaylists.length > 0),
    staleTime: 0,
  });
  const membershipById = new Map(
    (membership.data ?? []).map((item) => [item.id, new Set(item.trackIds)]),
  );

  const togglePlaylist = (id: string, initial: boolean) => {
    setPlaylistOverrides((current) => {
      const next = new Map(current);
      const value = next.get(id) ?? initial;
      const desired = !value;
      if (desired === initial) next.delete(id);
      else next.set(id, desired);
      return next;
    });
  };

  const toggleFavourite = () => {
    setFavouriteOverride((current) => {
      const desired = !(current ?? allStarred);
      return desired === allStarred ? null : desired;
    });
  };

  const submit = async () => {
    if (!server || !canApply || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (favouriteOverride !== null) {
        for (const track of uniqueTracks) {
          if (favouriteOverride && !track.starred) {
            await star(server, track.id);
            const offline = useOfflineStore.getState();
            if (!isOfflineNow() && offline.index.collections[FAVOURITES_COLLECTION.id]) {
              offline.downloadTracks([track], FAVOURITES_COLLECTION, { append: true });
            }
          } else if (!favouriteOverride && track.starred) {
            await star(server, track.id, { remove: true });
            await useOfflineStore
              .getState()
              .removeCollectionTrack(FAVOURITES_COLLECTION.id, track.id);
          }
        }
      }
      for (const [playlistId, desired] of playlistOverrides) {
        const playlist = visiblePlaylists.find((item) => item.id === playlistId);
        const readOnly = Boolean(
          playlist?.owner && server.username && playlist.owner !== server.username,
        );
        if (!playlist || readOnly) continue;
        const full = await getPlaylist(server, playlistId);
        const songs = full.songs ?? [];
        if (desired) {
          const existing = new Set(songs.map((track) => track.id));
          const added: Track[] = [];
          for (const track of uniqueTracks) {
            if (!existing.has(track.id)) {
              await updatePlaylist(server, playlistId, { songIdToAdd: track.id });
              added.push(track);
            }
          }
          const offline = useOfflineStore.getState();
          if (added.length > 0 && !isOfflineNow() && offline.index.collections[playlistId]) {
            offline.downloadTracks(
              added,
              {
                id: playlistId,
                type: 'playlist',
                name: playlist.name,
                coverArt: playlist.coverArt ?? playlist.songs?.[0]?.coverArt,
              },
              { append: true },
            );
          }
        } else {
          const ids = new Set(uniqueTracks.map((track) => track.id));
          const indexes = songs
            .map((track, index) => ({ id: track.id, index }))
            .filter((item) => ids.has(item.id))
            .map((item) => item.index)
            .sort((a, b) => b - a);
          for (const index of indexes) {
            await updatePlaylist(server, playlistId, { songIndexToRemove: index });
          }
        }
      }
      invalidatePlaylistQueries();
      await queryClient.invalidateQueries({ queryKey: queryKeys.starred(server) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the playlist.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheetModal
      visible
      onClose={onClose}
      dismissLabel="Dismiss add to playlist"
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
          <Text variant="title">Add to playlist</Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {title}
          </Text>
        </View>
        <IconButton label="Close add to playlist" size={38} variant="soft" onPress={onClose}>
          <X size={18} color={theme.colors.text} />
        </IconButton>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <PlaylistRow
          label="Favourited"
          hint={
            favouriteSelected
              ? allStarred
                ? 'Already favourited'
                : 'Will be added'
              : allStarred
                ? 'Will be removed'
                : 'Add to your favourites'
          }
          icon={<Heart size={18} color={theme.colors.accent} />}
          selected={favouriteSelected}
          onPress={toggleFavourite}
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
          const contained = membershipById.get(playlist.id);
          const presentCount = contained
            ? uniqueTracks.filter((track) => contained.has(track.id)).length
            : 0;
          const allPresent =
            uniqueTracks.length > 0 && presentCount === uniqueTracks.length;
          const initial = presentCount > 0;
          const desired = playlistOverrides.get(playlist.id) ?? initial;
          return (
            <PlaylistRow
              key={playlist.id}
              label={playlist.name}
              hint={[
                readOnly
                  ? 'Read-only'
                  : desired && allPresent
                    ? 'Already in playlist'
                    : desired && presentCount > 0
                      ? `${presentCount} of ${uniqueTracks.length} already added`
                      : !desired && presentCount > 0
                        ? 'Will be removed'
                        : playlist.songCount
                          ? `${playlist.songCount} tracks`
                          : undefined,
                excluded ? 'Excluded from shuffle' : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
              icon={
                readOnly ? (
                  <Lock size={16} color={theme.colors.textTertiary} />
                ) : excluded ? (
                  <Shuffle size={16} color={theme.colors.warning} />
                ) : (
                  <Music2 size={16} color={theme.colors.textTertiary} />
                )
              }
              selected={desired}
              disabled={readOnly}
              onPress={() => togglePlaylist(playlist.id, initial)}
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

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
        <Button
          label="Apply"
          onPress={() => void submit()}
          disabled={!canApply || busy}
          loading={busy}
        />
      </View>
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
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      haptic={false}
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.check,
          {
            borderColor: selected ? theme.colors.accent : theme.colors.border,
            backgroundColor: selected ? theme.colors.accent : 'transparent',
          },
        ]}
      >
        {selected ? <Check size={13} color={theme.colors.background} /> : null}
      </View>
      <View style={styles.rowText}>
        <Text variant="callout" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
      {icon}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  loading: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  empty: {
    paddingVertical: 12,
  },
  error: {
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
});
