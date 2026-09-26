import { useEffect, useState } from 'react';
import {
  browserDownloadDeps,
  canShareFiles,
  createDownloads,
  shareFiles,
} from '../../platform/share';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { useLocale, useT } from '../app/I18nProvider';
import { Sheet, useSheetSession } from '../shared/Sheet';
import { prepareBackup, prepareCsv, type Prepared } from './prepare';
import { SheetMessage } from './SheetMessage';
import type { ExportKind } from './text';

interface Props {
  kind: ExportKind | null;
  onClose: () => void;
  /** A JSON backup was shared, or its download confirmed, at `at`. */
  onBackedUp: (at: number) => void;
}

/** The sheet's texts for each kind: a CSV export is not a backup and must not say so. */
const TEXT = {
  json: {
    title: 'export.title',
    preparing: 'export.preparing',
    warning: 'export.warning',
    failed: 'export.failed',
  },
  csv: {
    title: 'csv.title',
    preparing: 'csv.preparing',
    warning: 'csv.warning',
    failed: 'csv.failed',
  },
} as const;

/** Prepares the files when it opens; a second tap shares them (or downloads them when sharing is not possible). */
export function ExportSheet({ kind, onClose, onBackedUp }: Props) {
  const t = useT();
  const session = useSheetSession(kind);
  const text = TEXT[session?.value ?? 'json'];
  return (
    <Sheet open={kind !== null} title={t(text.title)} onClose={onClose}>
      {/* The sheet sits outside the screens' boundary: a render error here shows its failure, not a blank app. */}
      {session && (
        <ErrorBoundary
          key={session.id}
          fallback={() => <SheetMessage message={t(text.failed)} onClose={onClose} />}
        >
          <ExportForm kind={session.value} onClose={onClose} onBackedUp={onBackedUp} />
        </ErrorBoundary>
      )}
    </Sheet>
  );
}

type Done = 'shared' | 'saved';

function ExportForm({ kind, onClose, onBackedUp }: Omit<Props, 'kind'> & { kind: ExportKind }) {
  const t = useT();
  const locale = useLocale();
  const [prepared, setPrepared] = useState<Prepared | 'failed' | null>(null);
  const [retry, setRetry] = useState(false); // the share was refused; another tap usually works
  const [shareFailed, setShareFailed] = useState(false); // sharing broke: offer the download instead
  const [asking, setAsking] = useState(false); // after a download: "Dosya kaydedildi mi?"
  const [done, setDone] = useState<Done | null>(null);
  const [downloads] = useState(() => createDownloads(browserDownloadDeps()));

  useEffect(() => {
    let cancelled = false;
    (kind === 'json' ? prepareBackup : prepareCsv)(t, locale)
      .then((next) => {
        if (!cancelled) setPrepared(next);
      })
      .catch((error: unknown) => {
        console.error('Could not prepare the backup', error);
        if (!cancelled) setPrepared('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [kind, t, locale]);
  useEffect(() => () => downloads.revokeAll(), [downloads]);

  if (prepared === null) return <p aria-busy="true">{t(TEXT[kind].preparing)}</p>;
  if (prepared === 'failed')
    return <SheetMessage message={t(TEXT[kind].failed)} onClose={onClose} />;

  const finish = (how: Done) => {
    if (prepared.countsAsBackup) onBackedUp(Date.now());
    setDone(how);
  };

  if (done) {
    return (
      <>
        <p role="status" className="status-ok">
          {t(kind === 'csv' ? 'csv.shared' : done === 'shared' ? 'export.shared' : 'export.saved')}
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t('common.ok')}
          </button>
        </div>
      </>
    );
  }

  const { files } = prepared;
  const shareable = !shareFailed && canShareFiles(files, navigator);

  // No await before shareFiles: iOS shares only while the tap's user activation lasts.
  const share = () => {
    setRetry(false);
    void shareFiles(files, navigator).then((outcome) => {
      if (outcome === 'shared') finish('shared');
      else if (outcome === 'retry') setRetry(true);
      else if (outcome === 'failed') setShareFailed(true);
    });
  };

  const download = (file: File) => {
    downloads.download(file);
    if (prepared.countsAsBackup) setAsking(true);
  };

  return (
    <>
      <p>{prepared.summary}</p>
      <p className="muted small">{t(TEXT[kind].warning)}</p>
      {asking ? (
        <div className="export-actions">
          <p>{t('export.savedQuestion')}</p>
          <div className="timer-row">
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              {t('common.no')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => finish('saved')}>
              {t('common.yes')}
            </button>
          </div>
        </div>
      ) : files.length === 0 ? null : (
        <div className="export-actions">
          {shareable ? (
            <button type="button" className="btn btn-primary" onClick={share}>
              {t('export.share')}
            </button>
          ) : (
            files.map((file) => (
              <button
                key={file.name}
                type="button"
                className="btn btn-primary"
                onClick={() => download(file)}
              >
                {files.length === 1
                  ? t('export.download')
                  : t('export.downloadNamed', { name: file.name })}
              </button>
            ))
          )}
          {retry && (
            <p role="alert" className="status-warn">
              {t('export.retry')}
            </p>
          )}
        </div>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </>
  );
}
