import { WebAudioEngine } from '@/adapters/web/audio.web';
import type { AudioEngine } from '@/ports/audio';

export const audioEngine: AudioEngine = new WebAudioEngine();
