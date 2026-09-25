import type { MessageKey } from '../i18n';
import { useT } from './I18nProvider';

export type Tab = 'home' | 'log' | 'summary' | 'sounds' | 'settings';

// ︎ forces text (non-emoji) presentation on iOS.
const TABS: readonly { id: Tab; label: MessageKey; icon: string }[] = [
  { id: 'home', label: 'tab.home', icon: '⌂︎' },
  { id: 'log', label: 'tab.log', icon: '☰︎' },
  { id: 'summary', label: 'tab.summary', icon: '▤︎' },
  { id: 'sounds', label: 'tab.sounds', icon: '♫︎' },
  { id: 'settings', label: 'tab.settings', icon: '⚙︎' },
];

export function TabBar({ current, onSelect }: { current: Tab; onSelect: (tab: Tab) => void }) {
  const t = useT();
  return (
    <nav className="tabbar" aria-label={t('nav.label')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab"
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span>{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}
