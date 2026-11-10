import { Directory, DownloadTask, File, Paths } from 'expo-file-system';
import { md5 } from 'js-md5';
import type { OfflineTrack } from '@/core/offline';
import type {
  DownloadedFile,
  LocalOfflineFile,
  OfflineDownloadTask,
  OfflineFiles,
} from '@/ports/offline';

function safeName(trackId: string, extension: string): string {
  const base = trackId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = extension.replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  return `${base}.${ext}`;
}

const downloads = new Directory(Paths.document, 'laila-downloads');
const covers = new Directory(Paths.document, 'laila-covers');
const manifests = new Directory(downloads, 'manifests');

function ensureDirectory() {
  if (!downloads.exists) downloads.create({ intermediates: true, idempotent: true });
}

function ensureCoverDirectory() {
  if (!covers.exists) covers.create({ intermediates: true, idempotent: true });
}

function ensureManifestDirectory() {
  if (!manifests.exists) manifests.create({ intermediates: true });
}

function manifestFile(trackId: string): File {
  ensureDirectory();
  ensureManifestDirectory();
  return new File(manifests, `${md5(trackId)}.json`);
}

function coverFile(coverArtId: string): File {
  ensureCoverDirectory();
  const base = coverArtId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new File(covers, `${base}.jpg`);
}

function fileFor(trackId: string, extension: string): File {
  ensureDirectory();
  return new File(downloads, safeName(trackId, extension));
}

export class NativeOfflineFiles implements OfflineFiles {
  createDownload(options: {
    url: string;
    trackId: string;
    extension: string;
    headers?: Record<string, string>;
    onProgress?: (progress: number, bytesWritten?: number, totalBytes?: number) => void;
  }): OfflineDownloadTask {
    const destination = fileFor(options.trackId, options.extension);
    const task = new DownloadTask(options.url, destination, {
      headers: options.headers,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) {
          options.onProgress?.(Math.min(1, bytesWritten / totalBytes), bytesWritten, totalBytes);
        }
      },
    });

    return {
      async start() {
        const result = await task.downloadAsync();
        if (!result) return null;
        return { uri: result.uri, size: result.size };
      },
      async pause() {
        await task.pauseAsync();
      },
      async resume() {
        const result = await task.resumeAsync();
        if (!result) return null;
        return { uri: result.uri, size: result.size };
      },
      cancel() {
        task.cancel();
      },
    };
  }

  async remove(trackId: string, extension: string, uri?: string): Promise<void> {
    try {
      const file = uri ? new File(uri) : fileFor(trackId, extension);
      if (file.exists) file.delete();
    } catch {
      // A manifest URI can be stale after a storage migration; the manifest
      // removal below still runs.
    }
    await this.removeManifest(trackId);
  }

  async exists(trackId: string, extension: string): Promise<boolean> {
    return fileFor(trackId, extension).exists;
  }

  async existsAt(uri: string): Promise<boolean> {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  }

  async sizeAt(uri: string): Promise<number> {
    try {
      const file = new File(uri);
      return file.exists ? file.size : 0;
    } catch {
      return 0;
    }
  }

  async freeSpace(): Promise<number | null> {
    try {
      const free = Paths.availableDiskSpace;
      return Number.isFinite(free) && free > 0 ? free : null;
    } catch {
      return null;
    }
  }

  uriFor(trackId: string, extension: string): string {
    return fileFor(trackId, extension).uri;
  }

  async sizeFor(trackId: string, extension: string): Promise<number> {
    const file = fileFor(trackId, extension);
    return file.exists ? file.size : 0;
  }

  async downloadCover(
    coverArtId: string,
    url: string,
    headers?: Record<string, string>,
  ): Promise<DownloadedFile | null> {
    const destination = coverFile(coverArtId);
    if (destination.exists) return { uri: destination.uri, size: destination.size };
    const file = await File.downloadFileAsync(url, destination, { headers });
    return file ? { uri: file.uri, size: file.size } : null;
  }

  async removeCover(coverArtId: string): Promise<void> {
    const file = coverFile(coverArtId);
    if (file.exists) file.delete();
  }

  async coverExists(coverArtId: string): Promise<boolean> {
    return coverFile(coverArtId).exists;
  }

  async listAudio(): Promise<LocalOfflineFile[]> {
    ensureDirectory();
    return downloads
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({ name: file.name, uri: file.uri, size: file.size }));
  }

  async listCovers(): Promise<LocalOfflineFile[]> {
    ensureCoverDirectory();
    return covers
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({ name: file.name, uri: file.uri, size: file.size }));
  }

  async saveManifest(entry: OfflineTrack): Promise<void> {
    const file = manifestFile(entry.track.id);
    if (!file.exists) file.create({ intermediates: true, overwrite: true });
    await file.write(JSON.stringify(entry));
  }

  async listManifests(): Promise<OfflineTrack[]> {
    ensureDirectory();
    ensureManifestDirectory();
    const files = manifests
      .list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.json'));
    const entries = await Promise.all(
      files.map(async (file) => {
        try {
          const parsed = JSON.parse(await file.text()) as OfflineTrack;
          if (!parsed?.track?.id || !parsed.extension || !parsed.fileUri) return null;
          return parsed;
        } catch {
          return null;
        }
      }),
    );
    return entries.filter((entry): entry is OfflineTrack => entry !== null);
  }

  async removeManifest(trackId: string): Promise<void> {
    const file = manifestFile(trackId);
    if (file.exists) file.delete();
  }

  async clearManifests(): Promise<void> {
    ensureDirectory();
    ensureManifestDirectory();
    for (const entry of manifests.list()) {
      if (entry instanceof File) entry.delete();
    }
  }
}
