// TypeScript fallback. Metro resolves audio.web.ts / audio.native.ts at runtime.
import { WebAudioEngine } from '@/adapters/web/audio.web';
import type { AudioEngine } from '@/ports/audio';

export const audioEngine: AudioEngine = new WebAudioEngine();
