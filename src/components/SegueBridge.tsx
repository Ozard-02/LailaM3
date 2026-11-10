import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useCurrentTrack, usePlayerStore } from '@/stores/player';
import { useSegueStore } from '@/stores/segue';
import { useSettingsStore } from '@/stores/settings';

export function SegueBridge() {
  const server = useAuthStore((state) => state.server);
  const hubUrl = useSettingsStore((state) => state.hubUrl);
  const status = usePlayerStore((state) => state.status);
  const queueState = usePlayerStore((state) => state.queueState);
  const volume = usePlayerStore((state) => state.volume);
  const seekRevision = usePlayerStore((state) => state.seekRevision);
  const track = useCurrentTrack();

  // Reconnect only when the connection-relevant server fields change. The
  // server object is also replaced for header/network edits, which Segue does
  // not use and must not turn into a connection flap.
  const serverKey = server
    ? [
        server.url,
        server.username,
        server.authMode,
        server.apiKey ?? '',
        server.password ?? '',
        server.token ?? '',
        server.salt ?? '',
      ].join('|')
    : '';

  useEffect(() => {
    const current = useAuthStore.getState().server;
    if (!current) {
      useSegueStore.getState().disconnect();
      return;
    }
    void useSegueStore.getState().connect(current, hubUrl || undefined).catch(() => undefined);
    return () => useSegueStore.getState().disconnect();
  }, [hubUrl, serverKey]);

  useEffect(() => {
    if (useSegueStore.getState().status !== 'connected') return;
    useSegueStore.getState().reportPlayerState();
  }, [
    status,
    track?.id,
    queueState.index,
    queueState.queue.length,
    queueState.repeat,
    queueState.shuffle,
    volume,
    seekRevision,
  ]);

  return null;
}
