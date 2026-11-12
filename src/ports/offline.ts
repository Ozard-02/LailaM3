import type { OfflineTrack } from '@/core/offline';

export interface DownloadedFile {
  uri: string;
  size: number;
}

export interface LocalOfflineFile {
  name: string;
  uri: string;
  size: number;
}

export interface OfflineDownloadTask {
  start(): Promise<DownloadedFile | null>;
  pause(): Promise<void>;
  resume(): Promise<DownloadedFile | null>;
  cancel(): void;
}

export interface OfflineFiles {
  createDownload(options: {
    url: string;
    trackId: string;
    extension: string;
    headers?: Record<string, string>;
    onProgress?: (progress: number, bytesWritten?: number, totalBytes?: number) => void;
  }): OfflineDownloadTask;
  remove(trackId: string, extension: string, uri?: string): Promise<void>;
  exists(trackId: string, extension: string): Promise<boolean>;
  /** Direct check of a persisted URI; the listing can miss older paths. */
  existsAt(uri: string): Promise<boolean>;
  sizeAt(uri: string): Promise<number>;
  /** Free bytes on the download volume, or null when the platform cannot tell. */
  freeSpace(): Promise<number | null>;
  uriFor(trackId: string, extension: string): string;
  sizeFor(trackId: string, extension: string): Promise<number>;
  downloadCover(
    coverArtId: string,
    url: string,
    headers?: Record<string, string>,
  ): Promise<DownloadedFile | null>;
  removeCover(coverArtId: string): Promise<void>;
  coverExists(coverArtId: string): Promise<boolean>;
  /** Files left in the downloads directory, used to recover a lost index. */
  listAudio(): Promise<LocalOfflineFile[]>;
  listCovers(): Promise<LocalOfflineFile[]>;
  /** Sidecar metadata next to each download; survives an index loss. */
  saveManifest(entry: OfflineTrack): Promise<void>;
  listManifests(): Promise<OfflineTrack[]>;
  removeManifest(trackId: string): Promise<void>;
  clearManifests(): Promise<void>;
}
