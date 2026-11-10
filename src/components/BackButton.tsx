import { useRouter } from 'expo-router';
import { ChevronLeft } from '@/ui/icons';
import { useTheme } from '@/theme/ThemeProvider';
import { IconButton } from '@/ui/IconButton';

export function BackButton({ label = 'Back' }: { label?: string }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <IconButton label={label} size={40} variant="soft" onPress={() => router.back()}>
      <ChevronLeft size={22} color={theme.colors.text} />
    </IconButton>
  );
}
