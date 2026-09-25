import { LOCALES } from '../../i18n';
import type { Settings } from '../../db/settings';
import { BabiesCard } from '../babies/BabiesCard';
import { useT } from '../I18nProvider';
import { OfflineCard, StorageCard, UpdateCard } from './PlatformCards';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}

export function SettingsScreen({ settings, onChange }: Props) {
  const t = useT();
  return (
    <section>
      <h1>{t('tab.settings')}</h1>

      <BabiesCard />

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

      <OfflineCard />
      <StorageCard />
      <UpdateCard />

      <div className="card">
        <h2>{t('settings.privacy.title')}</h2>
        <p>{t('settings.privacy.body')}</p>
      </div>

      <p className="muted small">{t('settings.about.version', { version: __APP_VERSION__, commit: __APP_COMMIT__ })}</p>
    </section>
  );
}
