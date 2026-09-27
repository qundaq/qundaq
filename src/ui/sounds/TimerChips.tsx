import { TIMER_CHOICES, type TimerChoice } from '../../domain/sounds';
import { useT } from '../app/I18nProvider';
import { Chip } from '../shared/Chip';
import styles from './Sounds.module.css';

/** The three minute chips (sounds.timer.minutes) plus ∞ as a radio group; ∞ means no timer (R15). */
export function TimerChips({
  value,
  onChange,
}: {
  value: TimerChoice;
  onChange: (choice: TimerChoice) => void;
}) {
  const t = useT();
  return (
    <div className={styles.chips} role="radiogroup" aria-label={t('sounds.timer')}>
      {TIMER_CHOICES.map((choice) => (
        <Chip
          key={choice ?? 'none'}
          mode="radio"
          selected={value === choice}
          aria-label={choice === null ? t('sounds.timer.none') : undefined}
          onClick={() => onChange(choice)}
        >
          {choice === null ? '∞' : t('sounds.timer.minutes', { m: choice })}
        </Chip>
      ))}
    </div>
  );
}
