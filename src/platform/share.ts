/** The part of `navigator` that sharing needs; absent members mean "not supported". */
export interface ShareNavigator {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
}

/**
 * shared: the share sheet finished (for example "Save to Files").
 * cancelled: the user closed the sheet; nothing happened and it is not a backup.
 * retry: the browser refused this tap (lost user activation, or a sheet is still open); tapping again works.
 * failed: anything else; the caller offers a download instead.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'retry' | 'failed';

/** True when the browser can share exactly these files, so iOS offers "Save to Files". */
export function canShareFiles(files: readonly File[], nav: ShareNavigator | undefined): boolean {
  if (typeof nav?.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [...files] });
  } catch {
    return false;
  }
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

function outcomeOf(error: unknown): ShareOutcome {
  const name = errorName(error);
  if (name === 'AbortError') return 'cancelled';
  if (name === 'NotAllowedError' || name === 'InvalidStateError') return 'retry';
  return 'failed';
}

/**
 * Opens the share sheet with the files and nothing else: a title or text next to them makes iOS save an
 * extra text file. Call it straight from the tap handler with no `await` before it; iOS allows sharing
 * only while the tap's user activation lasts. `share` itself is called synchronously.
 */
export function shareFiles(files: readonly File[], nav: ShareNavigator): Promise<ShareOutcome> {
  let pending: Promise<void>;
  try {
    if (typeof nav.share !== 'function') return Promise.resolve('failed');
    pending = nav.share({ files: [...files] });
  } catch (error) {
    return Promise.resolve(outcomeOf(error));
  }
  return pending.then(
    () => 'shared' as const,
    (error: unknown) => outcomeOf(error),
  );
}

export interface DownloadDeps {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Clicks a temporary <a download> for the URL. */
  clickLink: (url: string, fileName: string) => void;
  setTimeout: (callback: () => void, ms: number) => void;
}

/** Revoking right after click() can cancel the download in WebKit, so object URLs live this long. */
export const REVOKE_AFTER_MS = 60_000;

export function browserDownloadDeps(): DownloadDeps {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    clickLink: (url, fileName) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
    },
    setTimeout: (callback, ms) => {
      window.setTimeout(callback, ms);
    },
  };
}

export interface Downloads {
  /** Starts a download of `file` through an object URL, which stays valid for REVOKE_AFTER_MS. */
  download: (file: File) => void;
  /** Revokes every URL still alive; call it when the sheet closes. */
  revokeAll: () => void;
}

export function createDownloads(deps: DownloadDeps): Downloads {
  const alive = new Set<string>();
  const revoke = (url: string) => {
    if (alive.delete(url)) deps.revokeObjectURL(url);
  };
  return {
    download(file) {
      const url = deps.createObjectURL(file);
      alive.add(url);
      deps.clickLink(url, file.name);
      deps.setTimeout(() => revoke(url), REVOKE_AFTER_MS);
    },
    revokeAll() {
      for (const url of [...alive]) revoke(url);
    },
  };
}
