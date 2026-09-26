import { TIMER_CHOICES, type TimerChoice } from '../../domain/sounds';
import { useT } from '../I18nProvider';

/** 15 · 30 · 60 dk · ∞ as a radio group; ∞ means no timer (R15). */
export function TimerChips({ value, onChange }: { value: TimerChoice; onChange: (choice: TimerChoice) => void }) {
  const t = useT();
  return (
    <div className="chips" role="radiogroup" aria-label={t('sounds.timer')}>
      {TIMER_CHOICES.map((choice) => (
        <button
          key={choice ?? 'none'}
          type="button"
          role="radio"
          className="chip"
          aria-checked={value === choice}
          aria-label={choice === null ? t('sounds.timer.none') : undefined}
          onClick={() => onChange(choice)}
        >
          {choice === null ? '∞' : t('sounds.timer.minutes', { m: choice })}
        </button>
      ))}
    </div>
  );
}
