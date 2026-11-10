import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function tapFeedback(): void {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function selectFeedback(): void {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync();
}

export function successFeedback(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
