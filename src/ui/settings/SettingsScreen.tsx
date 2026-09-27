import { useState } from 'react';
import type { Settings } from '../../db/settings';
import { DEFAULT_CAP } from '../../domain/sounds';
import { THEME_CHOICES } from '../../domain/theme';
import { LOCALES } from '../../i18n';
import { BabiesCard } from '../babies/BabiesCard';
import { BackupCard, type BackupActions } from '../backup/BackupCard';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { Chip } from '../shared/Chip';
import { VisuallyHidden } from '../shared/VisuallyHidden';
import { CapCard } from './CapCard';
import { SourcesSheet } from './SourcesSheet';
import { OfflineCard, StorageCard, UpdateCard } from './PlatformCards';
import styles from './Settings.module.css';

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
      <VisuallyHidden as="h1">{t('tab.settings')}</VisuallyHidden>

      <BabiesCard />
      <BackupCard lastBackupAt={settings.lastBackupAt} actions={backup} />

      <Card>
        <h2>{t('settings.language')}</h2>
        <div className={styles.segmented} role="group" aria-label={t('settings.language')}>
          {LOCALES.map((locale) => (
            <Chip
              key={locale}
              selected={settings.locale === locale}
              onClick={() => void onChange({ locale })}
            >
              {t(`settings.language.${locale}`)}
            </Chip>
          ))}
        </div>
      </Card>

      <Card>
        <h2>{t('settings.theme.title')}</h2>
        <div className={styles.segmented} role="group" aria-label={t('settings.theme.title')}>
          {THEME_CHOICES.map((choice) => (
            <Chip
              key={choice}
              selected={settings.theme === choice}
              onClick={() => void onChange({ theme: choice })}
            >
              {t(`settings.theme.${choice}`)}
            </Chip>
          ))}
        </div>
      </Card>

      <Card>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            role="switch"
            checked={settings.nightMode}
            onChange={(event) => void onChange({ nightMode: event.target.checked })}
          />
          <span>
            <strong>{t('settings.nightMode')}</strong>
            <br />
            <span className={styles.hint}>{t('settings.nightMode.hint')}</span>
          </span>
        </label>
      </Card>

      <CapCard
        cap={settings.volumeCap ?? DEFAULT_CAP}
        onChange={(volumeCap) => void onChange({ volumeCap })}
      />

      <OfflineCard />
      <StorageCard />
      <UpdateCard />

      <Card>
        <h2>{t('settings.privacy.title')}</h2>
        <p>{t('settings.privacy.body')}</p>
      </Card>

      <Card>
        <h2>{t('settings.about.title')}</h2>
        <p className={styles.hint} data-testid="app-version">
          {t('settings.about.version', { version: __APP_VERSION__, commit: __APP_COMMIT__ })}
        </p>
        <Button onClick={() => setSources(true)}>{t('settings.sources')}</Button>
      </Card>
      <SourcesSheet open={sources} onClose={() => setSources(false)} />
    </section>
  );
}
