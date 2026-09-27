import type { KeyboardEvent } from 'react';

/** The radio to select after `key` in a group of `count`, or null when the key does not move. */
export function radioKeyTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Arrow keys on a radio (one tab stop per group): selects the target and moves focus to it. */
export function onRadioKeyDown(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  select: (i: number) => void,
): void {
  const target = radioKeyTarget(event.key, index, count);
  if (target === null) return;
  event.preventDefault();
  select(target);
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[target]?.focus();
}
