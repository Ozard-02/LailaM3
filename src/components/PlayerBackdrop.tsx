import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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

  return (
    <Animated.View
      testID="player-backdrop"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, fade]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: layer.color }]} />
      {layer.uri && !reduceBlur ? (
        <Image
          source={{ uri: layer.uri, headers }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={70}
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
  const [layers, setLayers] = useState<Layer[]>([]);
  const nextId = useRef(0);
  const reduceBlur = useSettingsStore((state) => state.reduceBlur);

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

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {layers.map((layer, index) => (
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
