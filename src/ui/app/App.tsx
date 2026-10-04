import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/instance';
import { defaultSettings, loadSettings, saveSettings, type Settings } from '../../db/settings';
import { DEFAULT_CAP } from '../../domain/sounds';
import { detectLocale } from '../../i18n';
import { ExportSheet } from '../backup/ExportSheet';
import {
  DEFAULT_CHOICES,
  readImportFile,
  type ImportChoices,
  type ImportSource,
} from '../backup/importFile';
import { ImportSheet } from '../backup/ImportSheet';
import { ErrorProvider, useReportError } from '../shared/ErrorBanner';
import { ToastProvider } from '../shared/ToastBanner';
import styles from './App.module.css';
import { Brand, BrandDate } from './Brand';
import { ErrorBoundary } from './ErrorBoundary';
import { BrandDayPicker } from '../history/BrandDayPicker';
import { DEFAULT_LOG_VIEW, LogScreen, type LogView } from '../history/LogScreen';
import { I18nProvider, useT } from './I18nProvider';
import { TabBar, type Tab } from './TabBar';
import { CrashScreen } from './CrashScreen';
import { HomeScreen } from '../home/HomeScreen';
import { SettingsScreen } from '../settings/SettingsScreen';
import { NowPlayingBar } from '../sounds/NowPlayingBar';
import { SoundsScreen } from '../sounds/SoundsScreen';
import {
  lastSoundOf,
  lastSoundToPersist,
  sameLastSound,
  soundName,
  toSavedSound,
} from '../sounds/text';
import { useMediaSession, useSoundEngine } from '../sounds/useSoundEngine';
import { DEFAULT_SUMMARY_VIEW, SummaryScreen, type SummaryView } from '../summary/SummaryScreen';
import { useApplyTheme } from './useTheme';

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
  }, [settings]);

  if (!settings) return null;

  return (
    <I18nProvider locale={settings.locale}>
      <ErrorProvider>
        <ToastProvider>
          <Shell settings={settings} onSettingsReplaced={setSettings} />
        </ToastProvider>
      </ErrorProvider>
    </I18nProvider>
  );
}

/**
 * The backup sheets. Only one <dialog> is open at a time: "back up this device first" (import.backupFirst) swaps the import
 * sheet for the export sheet, and closing the export sheet brings the import back while `pending` is set.
 */
interface BackupUi {
  sheet: 'export' | 'csv' | 'import' | null;
  pending: { source: ImportSource; choices: ImportChoices } | null;
}

const NO_BACKUP_UI: BackupUi = { sheet: null, pending: null };

/** `onSettingsReplaced` takes settings read back after a save, an export or an import, so Home and Settings follow at once. */
function Shell({
  settings,
  onSettingsReplaced,
}: {
  settings: Settings;
  onSettingsReplaced: (next: Settings) => void;
}) {
  useApplyTheme(settings);
  const t = useT();
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

  // The sound engine outlives the tabs. The last selection and the cap reach it once at start (nothing
  // plays until a tap, R6), then the cap again whenever Settings saves it (R19).
  const { engine, state: sound } = useSoundEngine();

  // The stored selection as the latest commit has it, for a persist timer set in an earlier render.
  const storedSound = useRef(settings.lastSound);
  useEffect(() => {
    storedSound.current = settings.lastSound;
  });

  // Nothing is remembered before the launch's restore ran: until then the engine holds the default selection.
  const restored = useRef(false);

  // A new cap reaches the engine first, in this call: it lowers the master when the cap rises (R1), and the
  // cap is then written together with that lowered master. Storage never holds more than what plays, even
  // when the write fails or lands late.
  const updateSettings = async (patch: Partial<Settings>) => {
    let full = patch;
    if (patch.volumeCap !== undefined) {
      engine.setCap(patch.volumeCap);
      full = { ...patch, lastSound: lastSoundOf(engine.getSnapshot()) };
    }
    try {
      onSettingsReplaced(await saveSettings(db, full, fallbackLocale));
    } catch (error) {
      report(error);
    }
  };

  useEffect(() => {
    engine.restore(
      settings.lastSound ? toSavedSound(settings.lastSound) : undefined,
      settings.volumeCap ?? DEFAULT_CAP,
    );
    restored.current = true;
    // The restore reads lastSound and volumeCap once, at launch; later settings must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // A no-op after updateSettings: the engine already holds the cap.
  useEffect(() => {
    engine.setCap(settings.volumeCap ?? DEFAULT_CAP);
  }, [engine, settings.volumeCap]);

  // The selection is remembered a second after it last changed, as the engine holds it then (never a
  // render's copy, which can predate a cap's rescale or the restore); the playing state never is.
  useEffect(() => {
    if (sameLastSound(lastSoundOf(sound), settings.lastSound)) return;
    const handle = window.setTimeout(() => {
      if (!restored.current) return;
      const next = lastSoundToPersist(engine.getSnapshot(), storedSound.current);
      if (next) void updateSettings({ lastSound: next });
    }, 1000);
    return () => window.clearTimeout(handle);
    // Deliberate deps: only these sound fields restart the 1 s debounce, and updateSettings is a new
    // function every render, so listing either would rearm the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sound.current, sound.master, sound.timer, settings.lastSound]);

  useMediaSession(engine, sound, soundName(t, sound.current));

  // On the other tabs the now-playing bar sits above the tab bar; the screens make room through --nowplaying-h (R16).
  const nowPlaying = tab !== 'sounds' && sound.status !== 'stopped';
  useEffect(() => {
    document.documentElement.classList.toggle('has-nowplaying', nowPlaying);
  }, [nowPlaying]);

  const openExport = () => setBackupUi((ui) => ({ ...ui, sheet: 'export' }));
  const openCsv = () => setBackupUi((ui) => ({ ...ui, sheet: 'csv' }));
  // A dialog's close event also fires when Shell swaps sheets; each close only acts if its sheet is current.
  const closeExport = () =>
    setBackupUi((ui) =>
      ui.sheet === 'export' || ui.sheet === 'csv'
        ? { ...ui, sheet: ui.pending ? 'import' : null }
        : ui,
    );
  const closeImport = () => setBackupUi((ui) => (ui.sheet === 'import' ? NO_BACKUP_UI : ui));
  // The sheet opens at once and says "reading backup…" (import.loading): reading 20 MB takes seconds on an older iPhone.
  const pickImportFile = async (file: File) => {
    const loading: ImportSource = { fileName: file.name, result: null };
    setBackupUi({ sheet: 'import', pending: { source: loading, choices: DEFAULT_CHOICES } });
    const result = await readImportFile(file, Date.now());
    setBackupUi((ui) =>
      ui.pending?.source === loading
        ? { ...ui, pending: { ...ui.pending, source: { fileName: file.name, result } } }
        : ui,
    );
  };
  const onImportFile = (file: File) => void pickImportFile(file);
  const backupActions = { onExport: openExport, onImportFile, onCsv: openCsv };

  return (
    <>
      <Brand
        context={
          tab === 'home' || tab === 'summary' ? (
            <BrandDate locale={settings.locale} />
          ) : tab === 'log' ? (
            <BrandDayPicker
              day={logView.day}
              onChange={(day) => setLogView((v) => ({ ...v, day }))}
            />
          ) : undefined
        }
      />
      <main className={styles.screen}>
        {/* Keyed by tab and import: a crash on one screen never blocks the others, and switching tabs or
            restoring a backup starts over. */}
        <ErrorBoundary
          key={`${tab}:${imports}`}
          fallback={(error) => (
            <CrashScreen error={error} onBackup={openExport} onRestore={onImportFile} />
          )}
        >
          {tab === 'home' ? (
            <HomeScreen
              settings={settings}
              onSettingsChange={updateSettings}
              onImportFile={onImportFile}
              onBackup={openExport}
            />
          ) : tab === 'log' ? (
            <LogScreen view={logView} onViewChange={setLogView} />
          ) : tab === 'summary' ? (
            <SummaryScreen view={summaryView} onViewChange={setSummaryView} />
          ) : tab === 'settings' ? (
            <SettingsScreen settings={settings} onChange={updateSettings} backup={backupActions} />
          ) : (
            <SoundsScreen />
          )}
        </ErrorBoundary>
      </main>
      {/* Outside the boundary: a crashed sounds screen can still be paused from any tab. */}
      {nowPlaying && (
        <NowPlayingBar
          state={sound}
          onOpen={() => setTab('sounds')}
          onPlay={() => engine.play()}
          onPause={() => engine.pause()}
        />
      )}
      <TabBar current={tab} onSelect={setTab} />
      <ExportSheet
        kind={backupUi.sheet === 'export' ? 'json' : backupUi.sheet === 'csv' ? 'csv' : null}
        onClose={closeExport}
        onBackedUp={(at) => void updateSettings({ lastBackupAt: at })}
      />
      <ImportSheet
        source={backupUi.sheet === 'import' && backupUi.pending ? backupUi.pending.source : null}
        choices={backupUi.pending?.choices ?? DEFAULT_CHOICES}
        onChoicesChange={(choices) =>
          setBackupUi((ui) => (ui.pending ? { ...ui, pending: { ...ui.pending, choices } } : ui))
        }
        onBackupFirst={openExport}
        onSettingsReplaced={onSettingsReplaced}
        onImported={() => setImports((n) => n + 1)}
        onClose={closeImport}
      />
    </>
  );
}
