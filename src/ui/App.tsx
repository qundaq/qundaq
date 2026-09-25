import { useEffect, useState } from 'react';
import { db } from '../db/instance';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../db/settings';
import { detectLocale } from '../i18n';
import { I18nProvider } from './I18nProvider';
import { TabBar, type Tab } from './TabBar';
import { ComingSoon } from './screens/ComingSoon';
import { SettingsScreen } from './screens/SettingsScreen';

const fallbackLocale = detectLocale(navigator.language);

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>('home');

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

  const updateSettings = async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(db, patch, fallbackLocale));
  };

  return (
    <I18nProvider locale={settings.locale}>
      <main className="screen">
        {tab === 'settings' ? <SettingsScreen settings={settings} onChange={updateSettings} /> : <ComingSoon tab={tab} />}
      </main>
      <TabBar current={tab} onSelect={setTab} />
    </I18nProvider>
  );
}
