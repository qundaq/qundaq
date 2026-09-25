import { useEffect, useState } from 'react';
import { db } from '../db/instance';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../db/settings';
import { detectLocale } from '../i18n';
import { ErrorProvider, useReportError } from './ErrorBanner';
import { I18nProvider } from './I18nProvider';
import { TabBar, type Tab } from './TabBar';
import { ComingSoon } from './screens/ComingSoon';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const fallbackLocale = detectLocale(navigator.language);

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings(db, fallbackLocale)
      .then(setSettings)
      .catch((error: unknown) => {
        console.error('Could not load settings, using defaults', error);
        setSettings(defaultSettings(fallbackLocale));
      });
  }, []);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.lang = settings.locale;
    document.documentElement.dataset.night = String(settings.nightMode);
  }, [settings]);

  if (!settings) return null;

  return (
    <I18nProvider locale={settings.locale}>
      <ErrorProvider>
        <Shell settings={settings} onSettingsSaved={setSettings} />
      </ErrorProvider>
    </I18nProvider>
  );
}

function Shell({ settings, onSettingsSaved }: { settings: Settings; onSettingsSaved: (next: Settings) => void }) {
  const report = useReportError();
  const [tab, setTab] = useState<Tab>('home');

  const updateSettings = async (patch: Partial<Settings>) => {
    try {
      onSettingsSaved(await saveSettings(db, patch, fallbackLocale));
    } catch (error) {
      report(error);
    }
  };

  return (
    <>
      <main className="screen">
        {tab === 'home' ? (
          <HomeScreen settings={settings} onSettingsChange={updateSettings} />
        ) : tab === 'settings' ? (
          <SettingsScreen settings={settings} onChange={updateSettings} />
        ) : (
          <ComingSoon tab={tab} />
        )}
      </main>
      <TabBar current={tab} onSelect={setTab} />
    </>
  );
}
