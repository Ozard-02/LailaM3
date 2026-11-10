import { useRouter } from 'expo-router';
import { PlayerScreen } from '@/components/PlayerScreen';

export default function PlayerRoute() {
  const router = useRouter();
  return (
    <PlayerScreen
      onClose={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/(main)');
      }}
    />
  );
}
