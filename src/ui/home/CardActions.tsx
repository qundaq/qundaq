import type { SheetKind } from '../log/drafts';
import { useT } from '../app/I18nProvider';
import { Icon } from '../shared/Icon';
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

/** The same five buttons in the same places on every card, whatever runs (muscle memory at night). */
export function CardActions({ name, onPick }: { name: string; onPick: (kind: SheetKind) => void }) {
  const t = useT();
  return (
    <div className={styles.actions} role="group" aria-label={t('card.actions', { name })}>
      {KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          className={styles.action}
          aria-label={`${name}: ${t(`quick.${kind}`)}`}
          onClick={() => onPick(kind)}
        >
          <Icon name={ICON[kind]} />
          <span className={styles.actionLabel}>{t(`quick.${kind}`)}</span>
        </button>
      ))}
    </div>
  );
}
