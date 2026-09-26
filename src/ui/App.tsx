import { useEffect, useState } from 'react';
import { db } from '../db/instance';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../db/settings';
import { detectLocale } from '../i18n';
import { ExportSheet } from './backup/ExportSheet';
import { ErrorProvider, useReportError } from './ErrorBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { DEFAULT_LOG_VIEW, LogScreen, type LogView } from './history/LogScreen';
import { I18nProvider } from './I18nProvider';
import { TabBar, type Tab } from './TabBar';
import { ComingSoon } from './screens/ComingSoon';
import { CrashScreen } from './screens/CrashScreen';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { DEFAULT_SUMMARY_VIEW, SummaryScreen, type SummaryView } from './summary/SummaryScreen';

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
  // Screen state lives here so it survives tab switches (and resets when the app restarts).
  const [logView, setLogView] = useState<LogView>(DEFAULT_LOG_VIEW);
  const [summaryView, setSummaryView] = useState<SummaryView>(DEFAULT_SUMMARY_VIEW);
  // The backup sheets live here, outside the screens, so they open from any screen and still work
  // when a screen has crashed.
  const [exporting, setExporting] = useState(false);

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
        {/* Keyed by tab: a crash on one screen never blocks the others, and switching tabs starts over. */}
        <ErrorBoundary key={tab} fallback={(error) => <CrashScreen error={error} onBackup={() => setExporting(true)} />}>
          {tab === 'home' ? (
            <HomeScreen settings={settings} onSettingsChange={updateSettings} />
          ) : tab === 'log' ? (
            <LogScreen view={logView} onViewChange={setLogView} />
          ) : tab === 'summary' ? (
            <SummaryScreen view={summaryView} onViewChange={setSummaryView} lastBabyIds={settings.lastBabyIds} />
          ) : tab === 'settings' ? (
            <SettingsScreen settings={settings} onChange={updateSettings} backup={{ onExport: () => setExporting(true) }} />
          ) : (
            <ComingSoon tab={tab} />
          )}
        </ErrorBoundary>
      </main>
      <TabBar current={tab} onSelect={setTab} />
      <ExportSheet
        kind={exporting ? 'json' : null}
        onClose={() => setExporting(false)}
        onBackedUp={(at) => void updateSettings({ lastBackupAt: at })}
      />
    </>
  );
}
