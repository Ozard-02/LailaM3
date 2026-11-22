import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { resolvePerformanceMode } from '@/core/device-tier';
import { isLowMemoryRuntime } from '@/services/device';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import { motion } from '@/theme/tokens';

export interface PlayerBackdropProps {
  /** Blurred cover URL; undefined draws only the palette colour. */
  uri?: string;
  /** Palette colour for this scene (the gradient and base fill). */
  color: string;
  /** False while the palette for this cover is still being extracted. */
  ready: boolean;
  /** Only update scenes while the player is on screen. */
  visible?: boolean;
  reduceMotion: boolean;
}

interface Layer {
  id: number;
  uri?: string;
  color: string;
}

const FADE_MS = motion.paletteFade;

function BackdropLayer({
  layer,
  fadeIn,
  reduceMotion,
  reduceBlur,
}: {
  layer: Layer;
  fadeIn: boolean;
  reduceMotion: boolean;
  reduceBlur: boolean;
}) {
  const opacity = useSharedValue(fadeIn && !reduceMotion ? 0 : 1);

  useEffect(() => {
    if (!fadeIn || reduceMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(withTiming(1, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) }));
  }, [fadeIn, opacity, reduceMotion]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const headers = useAuthStore((state) => state.server?.headers);
  // A stable source reference keeps expo-image from re-fetching the 900 px
  // backdrop on every unrelated render.
  const source = useMemo(() => {
    if (!layer.uri) return undefined;
    return headers ? { uri: layer.uri, headers } : layer.uri;
  }, [headers, layer.uri]);

  return (
    <Animated.View
      testID="player-backdrop"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, fade]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: layer.color }]} />
      {source && !reduceBlur ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={70}
          cachePolicy="memory-disk"
        />
      ) : null}
      <LinearGradient
        colors={[`${layer.color}66`, layer.color, layer.color]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Cross-fades the whole player scene (blurred cover + palette gradient) when
 * the track changes. Layers are only swapped once the matching palette is
 * ready, so the top image and the bottom colour never update separately.
 */
export function PlayerBackdrop({
  uri,
  color,
  ready,
  visible = true,
  reduceMotion,
}: PlayerBackdropProps) {
  const reduceBlurSetting = useSettingsStore((state) => state.reduceBlur);
  const performanceSetting = useSettingsStore((state) => state.performanceMode);
  // Narrow subscriptions instead of the whole theme: palette changes while the
  // player is parked must not re-render this subtree.
  const reduceBlur =
    reduceBlurSetting || resolvePerformanceMode(performanceSetting, isLowMemoryRuntime());
  const [layers, setLayers] = useState<Layer[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (!ready || !visible) return;
    setLayers((current) => {
      const top = current[current.length - 1];
      if (top && top.uri === uri && top.color === color) return current;
      return [...current.slice(-1), { id: nextId.current++, uri, color }];
    });
  }, [color, ready, uri, visible]);

  // Drop the outgoing layer once the fade is done so two full-screen blurred
  // images are never decoded longer than necessary.
  useEffect(() => {
    if (layers.length < 2) return;
    const timer = setTimeout(() => setLayers((current) => current.slice(-1)), FADE_MS + 120);
    return () => clearTimeout(timer);
  }, [layers]);

  // The sheet is parked while the player is closed: render only the current
  // scene so outgoing 900 px blurred bitmaps are not retained. The fade timer
  // above prunes the state shortly after as well.
  const scenes = visible ? layers : layers.slice(-1);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {scenes.map((layer, index) => (
        <BackdropLayer
          key={layer.id}
          layer={layer}
          fadeIn={index > 0}
          reduceMotion={reduceMotion}
          reduceBlur={reduceBlur}
        />
      ))}
    </View>
  );
}
