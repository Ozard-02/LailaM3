import { useEffect, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { audioEngine } from '@/services/audio';
import { useAuthStore } from '@/stores/auth';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { paletteCoverUrl } from '@/theme/palette';
import { useTheme } from '@/theme/ThemeProvider';

export function PlayerBridge() {
  const track = useCurrentTrack();
  const server = useAuthStore((state) => state.server);
  const theme = useTheme();
  const setArtworkFromUrl = theme.setArtworkFromUrl;
  const resetArtwork = theme.resetArtwork;
  const notificationAsked = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !track || notificationAsked.current) return;
    if (Number(Platform.Version) < 33) return;
    notificationAsked.current = true;
    void PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    ).catch(() => undefined);
  }, [track]);

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((state) => {
      usePlayerStore.getState()._syncFromEngine(state);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const unregister = audioEngine.setAutoAdvanceHandler?.((mediaId) => {
      usePlayerStore.getState()._handleAutoAdvance(mediaId);
    });
    return unregister;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    return audioEngine.setRemoteHandlers?.({
      next: () => usePlayerStore.getState().next(),
      previous: () => usePlayerStore.getState().previous(),
    });
  }, []);

  useEffect(() => {
    if (track?.coverArt && server) {
      setArtworkFromUrl(paletteCoverUrl(server, track.coverArt));
    } else {
      resetArtwork();
    }
  }, [track?.coverArt, server, setArtworkFromUrl, resetArtwork]);

  return null;
}
