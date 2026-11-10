import { getColors } from 'react-native-image-colors';
import { neutralPalette, paletteFromHex, type ArtworkPalette } from './palette';

export async function extractPaletteFromUrl(url: string): Promise<ArtworkPalette> {
  try {
    const colors = await getColors(url, {
      fallback: '#1C1C20',
      quality: 'low',
      cache: true,
      key: url,
    });
    const hex =
      colors.platform === 'ios'
        ? colors.primary
        : colors.platform === 'android'
          ? colors.dominant
          : colors.dominant;
    if (!hex) return neutralPalette;
    return paletteFromHex(hex);
  } catch {
    return neutralPalette;
  }
}
