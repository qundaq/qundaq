import { useEffect, useState } from 'react';
import { db } from '../db/instance';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../db/settings';
import { detectLocale } from '../i18n';
import { ExportSheet } from './backup/ExportSheet';
import { DEFAULT_CHOICES, readImportFile, type ImportChoices, type ImportSource } from './backup/importFile';
import { ImportSheet } from './backup/ImportSheet';
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
        <Shell settings={settings} onSettingsReplaced={setSettings} />
      </ErrorProvider>
    </I18nProvider>
  );
}

/**
 * The backup sheets. Only one <dialog> is open at a time: "Önce bu cihazın yedeğini al" swaps the import
 * sheet for the export sheet, and closing the export sheet brings the import back while `pending` is set.
 */
interface BackupUi {
  sheet: 'export' | 'csv' | 'import' | null;
  pending: { source: ImportSource; choices: ImportChoices } | null;
}

const NO_BACKUP_UI: BackupUi = { sheet: null, pending: null };

/** `onSettingsReplaced` takes settings read back after a save, an export or an import, so Home and Ayarlar follow at once. */
function Shell({ settings, onSettingsReplaced }: { settings: Settings; onSettingsReplaced: (next: Settings) => void }) {
  const report = useReportError();
  const [tab, setTab] = useState<Tab>('home');
  // Screen state lives here so it survives tab switches (and resets when the app restarts).
  const [logView, setLogView] = useState<LogView>(DEFAULT_LOG_VIEW);
  const [summaryView, setSummaryView] = useState<SummaryView>(DEFAULT_SUMMARY_VIEW);
  // The backup sheets live here, outside the screens, so they open from any screen and still work when a
  // screen has crashed.
  const [backupUi, setBackupUi] = useState<BackupUi>(NO_BACKUP_UI);
  // Counts the imports written: a screen that crashed on bad data starts over once a restore replaced it.
  const [imports, setImports] = useState(0);

  const updateSettings = async (patch: Partial<Settings>) => {
    try {
      onSettingsReplaced(await saveSettings(db, patch, fallbackLocale));
    } catch (error) {
      report(error);
    }
  };

  const openExport = () => setBackupUi((ui) => ({ ...ui, sheet: 'export' }));
  const openCsv = () => setBackupUi((ui) => ({ ...ui, sheet: 'csv' }));
  // A dialog's close event also fires when Shell swaps sheets; each close only acts if its sheet is current.
  const closeExport = () =>
    setBackupUi((ui) => (ui.sheet === 'export' || ui.sheet === 'csv' ? { ...ui, sheet: ui.pending ? 'import' : null } : ui));
  const closeImport = () => setBackupUi((ui) => (ui.sheet === 'import' ? NO_BACKUP_UI : ui));
  // The sheet opens at once and says "Yedek okunuyor…": reading 20 MB takes seconds on an older iPhone.
  const pickImportFile = async (file: File) => {
    const loading: ImportSource = { fileName: file.name, result: null };
    setBackupUi({ sheet: 'import', pending: { source: loading, choices: DEFAULT_CHOICES } });
    const result = await readImportFile(file, Date.now());
    setBackupUi((ui) => (ui.pending?.source === loading ? { ...ui, pending: { ...ui.pending, source: { fileName: file.name, result } } } : ui));
  };
  const onImportFile = (file: File) => void pickImportFile(file);
  const backupActions = { onExport: openExport, onImportFile, onCsv: openCsv };

  return (
    <>
      <main className="screen">
        {/* Keyed by tab and import: a crash on one screen never blocks the others, and switching tabs or
            restoring a backup starts over. */}
        <ErrorBoundary key={`${tab}:${imports}`} fallback={(error) => <CrashScreen error={error} onBackup={openExport} onRestore={onImportFile} />}>
          {tab === 'home' ? (
            <HomeScreen settings={settings} onSettingsChange={updateSettings} onImportFile={onImportFile} onBackup={openExport} />
          ) : tab === 'log' ? (
            <LogScreen view={logView} onViewChange={setLogView} />
          ) : tab === 'summary' ? (
            <SummaryScreen view={summaryView} onViewChange={setSummaryView} lastBabyIds={settings.lastBabyIds} />
          ) : tab === 'settings' ? (
            <SettingsScreen settings={settings} onChange={updateSettings} backup={backupActions} />
          ) : (
            <ComingSoon tab={tab} />
          )}
        </ErrorBoundary>
      </main>
      <TabBar current={tab} onSelect={setTab} />
      <ExportSheet
        kind={backupUi.sheet === 'export' ? 'json' : backupUi.sheet === 'csv' ? 'csv' : null}
        onClose={closeExport}
        onBackedUp={(at) => void updateSettings({ lastBackupAt: at })}
      />
      <ImportSheet
        source={backupUi.sheet === 'import' && backupUi.pending ? backupUi.pending.source : null}
        choices={backupUi.pending?.choices ?? DEFAULT_CHOICES}
        onChoicesChange={(choices) => setBackupUi((ui) => (ui.pending ? { ...ui, pending: { ...ui.pending, choices } } : ui))}
        onBackupFirst={openExport}
        onSettingsReplaced={onSettingsReplaced}
        onImported={() => setImports((n) => n + 1)}
        onClose={closeImport}
      />
    </>
  );
}
