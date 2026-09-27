import type { SheetKind } from '../log/drafts';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import type { IconName } from '../shared/icons';
import styles from './Home.module.css';

const KINDS: readonly SheetKind[] = ['breastfeed', 'bottle', 'sleep', 'diaper', 'other'];

const ICON: Record<SheetKind, IconName> = {
  breastfeed: 'heart',
  bottle: 'milk',
  sleep: 'moon',
  diaper: 'baby',
  other: 'ellipsis',
};

export function QuickActions({ onPick }: { onPick: (kind: SheetKind) => void }) {
  const t = useT();
  return (
    <div className={styles.quickActions} role="group" aria-label={t('quick.label')}>
      {KINDS.map((kind) => (
        <Button key={kind} className={styles.quick} icon={ICON[kind]} onClick={() => onPick(kind)}>
          <span className={styles.quickLabel}>{t(`quick.${kind}`)}</span>
        </Button>
      ))}
    </div>
  );
}
