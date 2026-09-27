import type { MessageKey } from '../../i18n';
import { Icon } from '../shared/Icon';
import type { IconName } from '../shared/icons';
import { useT } from './I18nProvider';
import styles from './TabBar.module.css';

export type Tab = 'home' | 'log' | 'summary' | 'sounds' | 'settings';

const TABS: readonly { id: Tab; label: MessageKey; icon: IconName }[] = [
  { id: 'home', label: 'tab.home', icon: 'house' },
  { id: 'log', label: 'tab.log', icon: 'list' },
  { id: 'summary', label: 'tab.summary', icon: 'chart-column' },
  { id: 'sounds', label: 'tab.sounds', icon: 'audio-lines' },
  { id: 'settings', label: 'tab.settings', icon: 'sliders-horizontal' },
];

export function TabBar({ current, onSelect }: { current: Tab; onSelect: (tab: Tab) => void }) {
  const t = useT();
  return (
    <nav className={styles.tabbar} aria-label={t('nav.label')}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={styles.tab}
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <Icon name={tab.icon} size={24} />
          <span>{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}
