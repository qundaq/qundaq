import type { Ref } from 'react';
import { useT } from '../app/I18nProvider';
import { Button } from '../shared/Button';
import type { LogRequest } from '../log/drafts';
import styles from './Home.module.css';

/** Pumping is the parent's, not a baby's: one full-width button above the cards that opens its own sheet. */
export function PumpButton({
  onOpen,
  ref,
}: {
  onOpen: (request: LogRequest) => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const t = useT();
  return (
    <Button
      ref={ref}
      variant="secondary"
      icon="droplets"
      block
      className={styles.pump}
      onClick={() => onOpen({ kind: 'pump' })}
    >
      {t('home.pump')}
    </Button>
  );
}
