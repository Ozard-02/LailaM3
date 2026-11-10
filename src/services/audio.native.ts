import { NativeAudioEngine } from '@/adapters/native/audio.native';
import type { AudioEngine } from '@/ports/audio';

export const audioEngine: AudioEngine = new NativeAudioEngine();
