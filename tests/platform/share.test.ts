import { describe, expect, it, vi } from 'vitest';
import {
  REVOKE_AFTER_MS,
  canShareFiles,
  createDownloads,
  shareFiles,
  type DownloadDeps,
  type ShareNavigator,
} from '../../src/platform/share';

const file = (name = 'qundaq-backup.json') => new File(['{}'], name, { type: 'application/json' });

describe('canShareFiles', () => {
  it('is true only when both share and canShare exist and canShare accepts the files', () => {
    const files = [file()];
    const share = vi.fn(async () => {});
    expect(canShareFiles(files, undefined)).toBe(false);
    expect(canShareFiles(files, {})).toBe(false);
    expect(canShareFiles(files, { share })).toBe(false);
    expect(canShareFiles(files, { share, canShare: () => false })).toBe(false);
    expect(
      canShareFiles(files, {
        share,
        canShare: () => {
          throw new TypeError('bad');
        },
      }),
    ).toBe(false);
    const canShare = vi.fn(() => true);
    expect(canShareFiles(files, { share, canShare })).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files });
  });
});

describe('shareFiles', () => {
  it('passes the files only and calls share synchronously', async () => {
    const share = vi.fn(async () => {});
    const files = [file()];
    const outcome = shareFiles(files, { share });
    expect(share).toHaveBeenCalledTimes(1); // before any await: the tap's user activation is still there
    expect(share).toHaveBeenCalledWith({ files });
    expect(await outcome).toBe('shared');
  });

  it.each([
    ['AbortError', 'cancelled'],
    ['NotAllowedError', 'retry'],
    ['InvalidStateError', 'retry'],
    ['DataError', 'failed'],
    ['TypeError', 'failed'],
  ] as const)('a rejection named %s is %s', async (name, outcome) => {
    const nav: ShareNavigator = { share: () => Promise.reject(new DOMException('no', name)) };
    expect(await shareFiles([file()], nav)).toBe(outcome);
  });

  it('a share that throws synchronously, or no share at all, is handled too', async () => {
    const throwing: ShareNavigator = {
      share: () => {
        throw new DOMException('busy', 'InvalidStateError');
      },
    };
    expect(await shareFiles([file()], throwing)).toBe('retry');
    expect(await shareFiles([file()], {})).toBe('failed');
    // The non-Error rejection reason is the point: shareFiles must survive whatever the browser throws.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    expect(await shareFiles([file()], { share: () => Promise.reject('weird') })).toBe('failed');
  });
});

describe('createDownloads', () => {
  function fakeDeps() {
    const timers: { callback: () => void; ms: number }[] = [];
    let next = 0;
    const deps = {
      createObjectURL: vi.fn(() => `blob:test/${++next}`),
      revokeObjectURL: vi.fn(),
      clickLink: vi.fn(),
      setTimeout: vi.fn((callback: () => void, ms: number) => {
        timers.push({ callback, ms });
      }),
    } satisfies DownloadDeps;
    return { deps, timers };
  }

  it('clicks a link named after the file and revokes the URL only after a minute', () => {
    const { deps, timers } = fakeDeps();
    const downloads = createDownloads(deps);
    downloads.download(file('a.json'));
    expect(deps.clickLink).toHaveBeenCalledWith('blob:test/1', 'a.json');
    expect(deps.revokeObjectURL).not.toHaveBeenCalled();
    expect(timers.map((timer) => timer.ms)).toEqual([REVOKE_AFTER_MS]);
    timers[0]!.callback();
    expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });

  it('revokes every live URL when the sheet closes, and each URL only once', () => {
    const { deps, timers } = fakeDeps();
    const downloads = createDownloads(deps);
    downloads.download(file('a.csv'));
    downloads.download(file('b.csv'));
    downloads.revokeAll();
    expect(deps.revokeObjectURL.mock.calls).toEqual([['blob:test/1'], ['blob:test/2']]);
    for (const timer of timers) timer.callback();
    downloads.revokeAll();
    expect(deps.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
