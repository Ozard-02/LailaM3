import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentTrack } from '@/stores/player';
import { useUIStore } from '@/stores/ui';

/**
 * Height of the floating chrome that overlays the page (bottom tabs and the
 * mini player). Scroll views stay full height and add this as content bottom
 * padding, so pages are not permanently shrunk by an empty strip when the pill
 * is hidden. Mirrors the layout maths in `app/(main)/_layout.tsx`.
 */
export function useBottomChromeInset(): number {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const track = useCurrentTrack();
  const hidden = useUIStore((state) => state.miniPlayerHidden);
  const compact = width < 600;
  const medium = width >= 600 && width < 900;
  const hasPill = Boolean(track) && !hidden;

  const tabs = compact ? Math.max(insets.bottom, 10) + 62 : 0;
  const pill = hasPill
    ? compact
      ? 72
      : medium
        ? Math.max(insets.bottom, 10) + 72
        : Math.max(insets.bottom, 10) + 94
    : 0;

  return tabs + pill;
}
