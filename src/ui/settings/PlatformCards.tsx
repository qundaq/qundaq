import { useEffect, useState } from 'react';
import { applyUpdate, checkForUpdate, hasWaitingUpdate } from '../../platform/sw-client';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Card, CardTitle } from '../shared/Card';
import { Icon } from '../shared/Icon';
import { useOfflineStatus, usePersistenceState } from '../shared/usePlatformStatus';
import styles from './Settings.module.css';

export function OfflineCard() {
  const t = useT();
  const status = useOfflineStatus();
  return (
    <Card>
      <CardTitle>{t('settings.offline.title')}</CardTitle>
      {status?.state === 'ready' && (
        <p className={styles.status}>
          <Icon name="check" size={16} className={styles.ok} />
          {t('settings.offline.ready', { version: status.version })}
        </p>
      )}
      {(status === null || status.state === 'not-ready') && (
        <p className={[styles.status, styles.hint].filter(Boolean).join(' ')}>
          <Icon name="info" size={16} />
          {t('settings.offline.notReady')}
        </p>
      )}
      {status?.state === 'unsupported' && (
        <p className={[styles.status, styles.warn].filter(Boolean).join(' ')}>
          <Icon name="triangle-alert" size={16} />
          {t('settings.offline.unsupported')}
        </p>
      )}
      {status?.state === 'insecure' && (
        <p className={[styles.status, styles.warn].filter(Boolean).join(' ')}>
          <Icon name="triangle-alert" size={16} />
          {t('settings.offline.insecure')}
        </p>
      )}
      {status?.state === 'dev' && (
        <p className={[styles.status, styles.hint].filter(Boolean).join(' ')}>
          <Icon name="info" size={16} />
          {t('settings.offline.dev')}
        </p>
      )}
    </Card>
  );
}

export function StorageCard() {
  const t = useT();
  const state = usePersistenceState();
  if (state === null) return null;
  return (
    <Card>
      <CardTitle>{t('settings.storage.title')}</CardTitle>
      {state === 'persisted' ? (
        <p className={styles.status}>
          <Icon name="check" size={16} className={styles.ok} />
          {t('settings.storage.persisted')}
        </p>
      ) : (
        <p className={[styles.status, styles.hint].filter(Boolean).join(' ')}>
          <Icon name="info" size={16} />
          {t(`settings.storage.${state}`)}
        </p>
      )}
    </Card>
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
    <Card>
      <CardTitle>{t('settings.update.title')}</CardTitle>
      <p className={styles.hint}>{t('settings.update.hint')}</p>
      {state === 'ready' ? (
        <>
          <p role="status">{t('settings.update.ready')}</p>
          <Button variant="primary" onClick={() => void applyUpdate()}>
            {t('settings.update.apply')}
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" disabled={state === 'checking'} onClick={() => void check()}>
            {t(state === 'checking' ? 'settings.update.checking' : 'settings.update.check')}
          </Button>
          {state === 'none' && <p role="status">{t('settings.update.none')}</p>}
          {state === 'failed' && (
            <p role="status" className={[styles.status, styles.warn].filter(Boolean).join(' ')}>
              <Icon name="triangle-alert" size={16} />
              {t('settings.update.failed')}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
