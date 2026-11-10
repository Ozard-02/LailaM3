import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/auth';

export default function Index() {
  const server = useAuthStore((state) => state.server);
  return <Redirect href={server ? '/(main)' : '/login'} />;
}
