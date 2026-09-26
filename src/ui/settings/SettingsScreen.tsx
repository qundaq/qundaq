import { useState } from 'react';
import type { Settings } from '../../db/settings';
import { DEFAULT_CAP } from '../../domain/sounds';
import { LOCALES } from '../../i18n';
import { BabiesCard } from '../babies/BabiesCard';
import { BackupCard, type BackupActions } from '../backup/BackupCard';
import { useT } from '../app/I18nProvider';
import { CapCard } from './CapCard';
import { SourcesSheet } from './SourcesSheet';
import { OfflineCard, StorageCard, UpdateCard } from './PlatformCards';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
  backup: BackupActions;
}

export function SettingsScreen({ settings, onChange, backup }: Props) {
  const t = useT();
  const [sources, setSources] = useState(false);
  return (
    <section>
      <h1>{t('tab.settings')}</h1>

      <BabiesCard />
      <BackupCard lastBackupAt={settings.lastBackupAt} actions={backup} />

      <div className="card">
        <h2>{t('settings.language')}</h2>
        <div className="segmented" role="group" aria-label={t('settings.language')}>
          {LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              aria-pressed={settings.locale === locale}
              onClick={() => void onChange({ locale })}
            >
              {t(`settings.language.${locale}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <label className="toggle">
          <input
            type="checkbox"
            role="switch"
            checked={settings.nightMode}
            onChange={(event) => void onChange({ nightMode: event.target.checked })}
          />
          <span>
            <strong>{t('settings.nightMode')}</strong>
            <br />
            <span className="muted small">{t('settings.nightMode.hint')}</span>
          </span>
        </label>
      </div>

      <CapCard
        cap={settings.volumeCap ?? DEFAULT_CAP}
        onChange={(volumeCap) => void onChange({ volumeCap })}
      />

      <OfflineCard />
      <StorageCard />
      <UpdateCard />

      <div className="card">
        <h2>{t('settings.privacy.title')}</h2>
        <p>{t('settings.privacy.body')}</p>
      </div>

      <div className="card">
        <h2>{t('settings.about.title')}</h2>
        <p className="muted small">
          {t('settings.about.version', { version: __APP_VERSION__, commit: __APP_COMMIT__ })}
        </p>
        <button type="button" className="btn" onClick={() => setSources(true)}>
          {t('settings.sources')}
        </button>
      </div>
      <SourcesSheet open={sources} onClose={() => setSources(false)} />
    </section>
  );
}
