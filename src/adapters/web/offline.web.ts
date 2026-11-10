import type { OfflineTrack } from '@/core/offline';
import type { OfflineDownloadTask, OfflineFiles } from '@/ports/offline';

class UnsupportedTask implements OfflineDownloadTask {
  async start(): Promise<never> {
    throw new Error('Offline downloads are available on Android in v1.');
  }
  async pause(): Promise<void> {}
  async resume(): Promise<never> {
    throw new Error('Offline downloads are available on Android in v1.');
  }
  cancel(): void {}
}

export class WebOfflineFiles implements OfflineFiles {
  createDownload(): OfflineDownloadTask {
    return new UnsupportedTask();
  }
  async remove(): Promise<void> {}
  async exists(): Promise<boolean> {
    return false;
  }
  async existsAt(): Promise<boolean> {
    return false;
  }
  async sizeAt(): Promise<number> {
    return 0;
  }
  async freeSpace(): Promise<number | null> {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    try {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      return Math.max(0, quota - usage);
    } catch {
      return null;
    }
  }
  uriFor(): string {
    return '';
  }
  async sizeFor(): Promise<number> {
    return 0;
  }
  async downloadCover(): Promise<null> {
    return null;
  }
  async removeCover(): Promise<void> {}
  async coverExists(): Promise<boolean> {
    return false;
  }
  async listAudio(): Promise<[]> {
    return [];
  }
  async listCovers(): Promise<[]> {
    return [];
  }
  async saveManifest(): Promise<void> {}
  async listManifests(): Promise<OfflineTrack[]> {
    return [];
  }
  async removeManifest(): Promise<void> {}
  async clearManifests(): Promise<void> {}
}
