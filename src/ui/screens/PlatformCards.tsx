import { useEffect, useState } from 'react';
import { applyUpdate, checkForUpdate, hasWaitingUpdate } from '../../platform/sw-client';
import { useT } from '../I18nProvider';
import { useOfflineStatus, usePersistenceState } from '../usePlatformStatus';

export function OfflineCard() {
  const t = useT();
  const status = useOfflineStatus();
  return (
    <div className="card">
      <h2>{t('settings.offline.title')}</h2>
      {status?.state === 'ready' && <p className="status-ok">{t('settings.offline.ready', { version: status.version })}</p>}
      {(status === null || status.state === 'not-ready') && <p className="status-warn">{t('settings.offline.notReady')}</p>}
      {status?.state === 'unsupported' && <p className="status-warn">{t('settings.offline.unsupported')}</p>}
      {status?.state === 'insecure' && <p className="status-warn">{t('settings.offline.insecure')}</p>}
      {status?.state === 'dev' && <p className="muted">{t('settings.offline.dev')}</p>}
    </div>
  );
}

export function StorageCard() {
  const t = useT();
  const state = usePersistenceState();
  if (state === null) return null;
  return (
    <div className="card">
      <h2>{t('settings.storage.title')}</h2>
      <p className={state === 'persisted' ? 'status-ok' : 'status-warn'}>{t(`settings.storage.${state}`)}</p>
    </div>
  );
}

type UpdateUi = 'idle' | 'checking' | 'none' | 'ready' | 'failed';

export function UpdateCard() {
  const t = useT();
  const [state, setState] = useState<UpdateUi>('idle');

  useEffect(() => {
    void hasWaitingUpdate().then((waiting) => {
      if (waiting) setState('ready');
    });
  }, []);

  const check = async () => {
    setState('checking');
    setState(await checkForUpdate());
  };

  return (
    <div className="card">
      <h2>{t('settings.update.title')}</h2>
      <p className="muted small">{t('settings.update.hint')}</p>
      {state === 'ready' ? (
        <>
          <p role="status">{t('settings.update.ready')}</p>
          <button type="button" className="btn btn-primary" onClick={() => void applyUpdate()}>
            {t('settings.update.apply')}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn" disabled={state === 'checking'} onClick={() => void check()}>
            {t(state === 'checking' ? 'settings.update.checking' : 'settings.update.check')}
          </button>
          {state === 'none' && <p role="status">{t('settings.update.none')}</p>}
          {state === 'failed' && (
            <p role="status" className="status-warn">
              {t('settings.update.failed')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
