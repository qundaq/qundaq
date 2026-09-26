import { useEffect, useState } from 'react';
import { useT } from '../I18nProvider';
import { Sheet } from '../Sheet';

/** Where every sound comes from, served with the app (precached like everything in dist). */
export const SOURCES_PATH = 'sounds/SOURCES.md';

type Loaded = { state: 'loading' } | { state: 'ready'; text: string } | { state: 'failed' };

/**
 * Ayarlar → Hakkında → Ses kaynakları: shows public/sounds/SOURCES.md as preformatted text. A fetch, not
 * a navigation: the service worker answers every navigation with index.html, and a home-screen app has
 * no back button (R9). The fetch is same-origin and comes from the cache, so it works in airplane mode.
 */
export function SourcesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded({ state: 'loading' });
    fetch(SOURCES_PATH)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setLoaded({ state: 'ready', text });
      })
      .catch((error: unknown) => {
        console.error('Could not load the sound sources', error);
        if (!cancelled) setLoaded({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Sheet open={open} title={t('settings.sources')} onClose={onClose}>
      {loaded.state === 'loading' && <p aria-busy="true">{t('sources.loading')}</p>}
      {loaded.state === 'failed' && (
        <p role="alert" className="status-warn">
          {t('sources.failed')}
        </p>
      )}
      {loaded.state === 'ready' && <pre className="sources">{loaded.text}</pre>}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.dismiss')}
        </button>
      </div>
    </Sheet>
  );
}
