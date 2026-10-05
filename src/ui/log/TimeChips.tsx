import { useId, useState } from 'react';
import { AGO_MINUTES, NOW_CHOICE, type TimeChoice } from '../../domain/entryTime';
import { MINUTE, fromLocalInputValue, toLocalInputValue } from '../../domain/time';
import { useLocale, useT, type TranslateFn } from '../app/I18nProvider';
import { clockTime } from '../history/describe';
import { Button } from '../shared/Button';
import type { Locale } from '../../i18n';
import { Chip } from '../shared/Chip';
import { Field } from '../shared/Field';
import { onRadioKeyDown } from '../shared/radio';
import styles from './LogSheet.module.css';

const CHOICES: readonly (TimeChoice | 'pick')[] = [
  NOW_CHOICE,
  ...AGO_MINUTES.map((minutes): TimeChoice => ({ kind: 'ago', minutes })),
  'pick',
];

function isChosen(choice: TimeChoice | 'pick', value: TimeChoice): boolean {
  if (choice === 'pick') return value.kind === 'picked';
  return choice.kind === 'ago'
    ? value.kind === 'ago' && value.minutes === choice.minutes
    : value.kind === choice.kind;
}

function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

/**
 * What a chip tap makes the time. "Pick a time…" starts at `minute` (the current one); tapped again while
 * chosen, it keeps the date and time already typed.
 */
export function chooseTime(
  choice: TimeChoice | 'pick',
  value: TimeChoice,
  minute: number,
): TimeChoice {
  if (choice !== 'pick') return choice;
  return value.kind === 'picked' ? value : { kind: 'picked', at: minute };
}

/**
 * When an entry happened: now (the moment of saving), a few minutes ago, or a picked date and time. Chips
 * keep the keyboard closed on the common path; the native picker is the exception.
 */
export function TimeChips({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TimeChoice;
  onChange: (choice: TimeChoice) => void;
}) {
  const t = useT();
  const labelId = useId();
  const choose = (choice: TimeChoice | 'pick') => {
    const next = chooseTime(choice, value, currentMinute());
    if (next !== value) onChange(next);
  };
  const text = (choice: TimeChoice | 'pick') =>
    choice === 'pick'
      ? t('time.pick')
      : choice.kind === 'ago'
        ? t('time.agoChip', { m: choice.minutes })
        : t('sheet.now');
  return (
    <div className={styles.group}>
      <span id={labelId} className={styles.groupLabel}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.chips}>
        {CHOICES.map((choice, i) => {
          const chosen = isChosen(choice, value);
          return (
            <Chip
              key={text(choice)}
              mode="radio"
              selected={chosen}
              tabIndex={chosen ? 0 : -1}
              onClick={() => choose(choice)}
              onKeyDown={(event) =>
                onRadioKeyDown(event, i, CHOICES.length, (j) => choose(CHOICES[j]!))
              }
            >
              {text(choice)}
            </Chip>
          );
        })}
      </div>
      {value.kind === 'picked' && (
        <Field label={t('time.picked')}>
          <input
            type="datetime-local"
            value={toLocalInputValue(value.at)}
            // An emptied field (iOS has a Clear button) or a half-typed value changes nothing.
            onChange={(event) => {
              const at = fromLocalInputValue(event.target.value);
              if (at !== null) onChange({ kind: 'picked', at });
            }}
          />
        </Field>
      )}
    </div>
  );
}

/** A time choice in a few words, for a folded row's button: "now", "5 min ago" or the picked clock time. */
export function timeChoiceText(t: TranslateFn, locale: Locale, choice: TimeChoice): string {
  if (choice.kind === 'now') return t('time.foldedNow');
  if (choice.kind === 'ago') return t('time.agoChip', { m: choice.minutes });
  return clockTime(locale, choice.at);
}

/**
 * A time row folded behind one small button that says the time ("Start: now · change"), for a sheet where
 * "now" is nearly always right: a tap shows the chips under it, another hides them again.
 */
export function FoldedTimeChips({
  button,
  label,
  value,
  onChange,
}: {
  /** The button's text, given the time in a few words (timeChoiceText). */
  button: (when: string) => string;
  /** The chips' group label. */
  label: string;
  value: TimeChoice;
  onChange: (choice: TimeChoice) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={styles.folded}>
        <Button
          variant="tertiary"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((shown) => !shown)}
        >
          {button(timeChoiceText(t, locale, value))}
        </Button>
      </div>
      {open && (
        <div id={id}>
          <TimeChips label={label} value={value} onChange={onChange} />
        </div>
      )}
    </>
  );
}
