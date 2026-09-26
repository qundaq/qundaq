import { useEffect, useState } from 'react';
import { browserDownloadDeps, canShareFiles, createDownloads, shareFiles } from '../../platform/share';
import { useLocale, useT } from '../I18nProvider';
import { Sheet, useSheetSession } from '../Sheet';
import { prepareBackup, type Prepared } from './prepare';
import type { ExportKind } from './text';

interface Props {
  kind: ExportKind | null;
  onClose: () => void;
  /** A JSON backup was shared, or its download confirmed, at `at`. */
  onBackedUp: (at: number) => void;
}

/** Prepares the file when it opens; a second tap shares it (or downloads it when sharing is not possible). */
export function ExportSheet({ kind, onClose, onBackedUp }: Props) {
  const t = useT();
  const session = useSheetSession(kind);
  return (
    <Sheet open={kind !== null} title={t('export.title')} onClose={onClose}>
      {session && <ExportForm key={session.id} onClose={onClose} onBackedUp={onBackedUp} />}
    </Sheet>
  );
}

type Done = 'shared' | 'saved';

function ExportForm({ onClose, onBackedUp }: Omit<Props, 'kind'>) {
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
    prepareBackup(t, locale)
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
  }, [t, locale]);
  useEffect(() => () => downloads.revokeAll(), [downloads]);

  if (prepared === null) return <p aria-busy="true">{t('export.preparing')}</p>;
  if (prepared === 'failed') {
    return (
      <>
        <p role="alert" className="status-warn">
          {t('export.failed')}
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.dismiss')}
          </button>
        </div>
      </>
    );
  }

  const finish = (how: Done) => {
    if (prepared.countsAsBackup) onBackedUp(Date.now());
    setDone(how);
  };

  if (done) {
    return (
      <>
        <p role="status" className="status-ok">
          {t(done === 'shared' ? 'export.shared' : 'export.saved')}
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
      <p className="muted small">{t('export.warning')}</p>
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
      ) : (
        <div className="export-actions">
          {shareable ? (
            <button type="button" className="btn btn-primary" onClick={share}>
              {t('export.share')}
            </button>
          ) : (
            files.map((file) => (
              <button key={file.name} type="button" className="btn btn-primary" onClick={() => download(file)}>
                {files.length === 1 ? t('export.download') : t('export.downloadNamed', { name: file.name })}
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
