import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MINUTE } from '../../src/domain/time';
import type { Baby, TrackerEvent } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { clockTime } from '../../src/ui/history/describe';
import { LogSheet } from '../../src/ui/log/LogSheet';
import { timeChoiceText } from '../../src/ui/log/TimeChips';
import {
  MINUTE_CHIPS,
  SideMinutes,
  chipMinutes,
  nextEnabledChip,
  sideMax,
  stepMinutes,
  typedMinutes,
} from '../../src/ui/log/forms/SideMinutes';
import { StopTimerForm, runningSplit } from '../../src/ui/log/forms/timers';

// Expected UI text, built from the dictionary the sheet renders (tr): never a Turkish literal here.
const tt = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);

/** The accessible names of the markup's radio groups (aria-label, or the text aria-labelledby points to). */
function radiogroupNames(html: string): string[] {
  return [...html.matchAll(/role="radiogroup"([^>]*)>/g)].map(([, attrs]) => {
    const label = /aria-label="([^"]*)"/.exec(attrs!);
    if (label) return label[1]!;
    const id = /aria-labelledby="([^"]*)"/.exec(attrs!)![1]!;
    return new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)![1]!;
  });
}

const NOW = new Date(2026, 8, 25, 12, 0).getTime();
const ADA: Baby = { id: 'a', name: 'Ada', color: 'teal', createdAt: NOW, updatedAt: NOW } as Baby;

describe('SideMinutes stepping', () => {
  it('"+" on an empty side gives 5, then adds 5, never above the maximum', () => {
    expect(stepMinutes(null, 1, 240)).toBe(5);
    expect(stepMinutes(5, 1, 240)).toBe(10);
    expect(stepMinutes(238, 1, 240)).toBe(240);
    expect(stepMinutes(240, 1, 240)).toBe(240);
  });
  it('"−" takes 5 off and empties the side at 0 or below; an empty side stays empty', () => {
    expect(stepMinutes(10, -1, 240)).toBe(5);
    expect(stepMinutes(5, -1, 240)).toBeNull();
    expect(stepMinutes(3, -1, 240)).toBeNull();
    expect(stepMinutes(null, -1, 240)).toBeNull();
  });
  it('a chip sets its minutes; the chip already chosen empties the side', () => {
    expect(MINUTE_CHIPS).toEqual([5, 10, 15, 20]);
    expect(chipMinutes(null, 10, 240)).toBe(10);
    expect(chipMinutes(15, 10, 240)).toBe(10);
    expect(chipMinutes(10, 10, 240)).toBeNull();
  });
  it('one side never takes more than the other leaves of the total', () => {
    expect(sideMax(240, undefined, 200)).toBe(240);
    expect(sideMax(240, 240, null)).toBe(240);
    expect(sideMax(240, 240, 200)).toBe(40);
    expect(sideMax(240, 240, 240)).toBe(0);
    expect(sideMax(180, 240, 30)).toBe(180);
    // 240 + 240 cannot be entered: the second side is clamped to what is left.
    expect(typedMinutes('240', sideMax(240, 240, 240))).toBeNull();
    expect(typedMinutes('240', sideMax(240, 240, 200))).toBe(40);
    expect(stepMinutes(40, 1, sideMax(240, 240, 200))).toBe(40);
    expect(stepMinutes(null, 1, sideMax(240, 240, 240))).toBeNull();
    expect(chipMinutes(null, 20, sideMax(240, 240, 230))).toBe(10);
  });
  it('typed minutes are whole and positive, capped at the maximum', () => {
    expect(typedMinutes('12', 240)).toBe(12);
    expect(typedMinutes('999', 240)).toBe(240);
    expect(typedMinutes('', 240)).toBeNull();
    expect(typedMinutes('0', 240)).toBeNull();
    expect(typedMinutes('-4', 240)).toBeNull();
  });
});

describe('SideMinutes chip keys', () => {
  it('arrow keys skip the chips the other side leaves no room for', () => {
    // 10 minutes left: 15 and 20 are off.
    const enabled = [true, true, false, false];
    expect(nextEnabledChip('ArrowRight', 0, enabled)).toBe(1);
    expect(nextEnabledChip('ArrowRight', 1, enabled)).toBe(0);
    expect(nextEnabledChip('ArrowLeft', 0, enabled)).toBe(1);
    expect(nextEnabledChip('End', 0, enabled)).toBe(1);
    expect(nextEnabledChip('Home', 1, enabled)).toBe(0);
    expect(nextEnabledChip('Enter', 0, enabled)).toBeNull();
    // The chosen chip stays on even past the limit, and moves within the ones that are on.
    expect(nextEnabledChip('ArrowRight', 3, [true, false, false, true])).toBe(0);
    expect(nextEnabledChip('ArrowRight', 0, [false, false, false, false])).toBeNull();
  });
});

describe('SideMinutes markup', () => {
  it("names each side's field, stepper buttons and chip group; an empty side has no chosen chip", () => {
    const html = render(
      <SideMinutes values={{ left: 10, right: null }} onChange={() => {}} max={240} />,
    );
    const left = tt('side.L.button');
    const right = tt('side.R.button');
    for (const side of [left, right]) {
      expect(html).toContain(`aria-label="${tt('sideMinutes.value', { side })}"`);
      expect(html).toContain(`aria-label="${tt('sideMinutes.less', { side, m: 5 })}"`);
      expect(html).toContain(`aria-label="${tt('sideMinutes.more', { side, m: 5 })}"`);
    }
    expect(html.match(/role="group"/g)).toHaveLength(2);
    expect(html.match(/role="radiogroup"/g)).toHaveLength(2);
    // Left is 10 minutes: its 10 chip is the only chosen one; right is empty.
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain('value="10"');
    expect(html).toContain('value=""');
    for (const m of MINUTE_CHIPS) expect(html).toContain(`>${tt('time.minutes', { m })}<`);
    expect(html).toContain('max="240"');
    // Each chip group has its own name ("Left, minutes"), not the row's bare side name again.
    expect(html).toContain(
      `role="radiogroup" aria-label="${tt('sideMinutes.value', { side: left })}"`,
    );
  });

  it('disables "−" on an empty side and "+" at the limit; outlines the empty field', () => {
    const html = render(
      <SideMinutes
        values={{ left: 200, right: null }}
        onChange={() => {}}
        max={240}
        maxTotal={200}
      />,
    );
    const button = (key: 'sideMinutes.less' | 'sideMinutes.more', side: 'L' | 'R') =>
      html.match(
        new RegExp(
          `<button[^>]*aria-label="${tt(key, { side: tt(`side.${side}.button`), m: 5 })}"[^>]*>`,
        ),
      )![0];
    expect(button('sideMinutes.more', 'L')).toContain('disabled');
    expect(button('sideMinutes.less', 'L')).not.toContain('disabled');
    expect(button('sideMinutes.less', 'R')).toContain('disabled');
    // The right side has nothing left of the 200 total: "+" and every chip are off.
    expect(button('sideMinutes.more', 'R')).toContain('disabled');
    expect(html).toContain('max="0"');
  });
});

describe('the feed sheet', () => {
  const sheet = (events: TrackerEvent[] = []) =>
    render(
      <LogSheet
        request={{ kind: 'breastfeed', babyId: 'a' }}
        babies={[ADA]}
        events={events}
        onClose={() => {}}
      />,
    );

  it('has no mode switch: side buttons start a timer, and "log afterwards" sits below', () => {
    const html = sheet();
    expect(radiogroupNames(html)).not.toContain(tt('sheet.mode'));
    expect(html).not.toContain(tt('sheet.mode.start'));
    expect(html).toContain(`aria-label="${tt('side.L.button')}"`);
    expect(html).toContain(`aria-label="${tt('side.R.button')}"`);
    expect(html).toContain(tt('side.next'));
    expect(html).toContain(tt('feed.start'));
    expect(html).toContain(tt('feed.startAt', { when: tt('time.foldedNow') }));
    expect(html).toContain(tt('feed.endAt', { when: tt('time.foldedNow') }));
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    // Both time rows stay folded until asked for: no time chips at all.
    expect(radiogroupNames(html)).not.toContain(tt('time.start'));
    expect(radiogroupNames(html)).not.toContain(tt('time.ended'));
    expect(html).not.toContain(tt('time.pick'));
    expect(html.indexOf(tt('feed.start'))).toBeLessThan(html.indexOf(tt('feed.later')));
    expect(html).toContain(
      `aria-label="${tt('sideMinutes.value', { side: tt('side.L.button') })}"`,
    );
  });

  it('keeps Save disabled with a hint until a side has minutes', () => {
    const html = sheet();
    const save = html.match(/<button[^>]*type="submit"[^>]*>/)![0];
    expect(save).toContain('disabled');
    expect(save).toContain('aria-describedby');
    expect(html).toContain(tt('sheet.durationRequired'));
    expect(html).not.toContain('role="alert"');
  });

  it('says once that starting the feed ends a running sleep', () => {
    const sleeping: TrackerEvent = {
      id: 's',
      type: 'sleep',
      babyId: 'a',
      startAt: NOW - 30 * MINUTE,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const html = sheet([sleeping]);
    const note = tt('conflict.sleepEnds', { names: 'Ada' });
    expect(html.split(note)).toHaveLength(2);
  });
});

describe('the running feed', () => {
  const segments = [
    { side: 'L' as const, start: NOW - 11 * MINUTE, end: NOW - 3 * MINUTE },
    { side: 'R' as const, start: NOW - 3 * MINUTE },
  ];
  it('splits the minutes so far per side, the open side counting up to now', () => {
    expect(runningSplit(tt, segments, NOW)).toBe(
      `${tt('side.L.button')} ${tt('time.minutes', { m: 8 })} · ${tt('side.R.button')} ${tt('time.minutes', { m: 3 })}`,
    );
  });
  it('shows the split in the stop sheet once the side has been switched', () => {
    const timer = {
      kind: 'breastfeed' as const,
      eventId: 'f',
      since: NOW - 11 * MINUTE,
      side: 'R' as const,
      segments,
    };
    const html = render(
      <StopTimerForm timer={timer} babies={[ADA]} onClose={() => {}} onStopped={() => {}} />,
    );
    expect(html).toContain(`${tt('side.L.button')} ${tt('time.minutes', { m: 8 })} · `);
    expect(html).toContain(tt('timer.switchSide'));
    expect(html).toContain(tt('timer.stop'));
    const single = render(
      <StopTimerForm
        timer={{ ...timer, side: 'L', segments: [{ side: 'L', start: NOW - 4 * MINUTE }] }}
        babies={[ADA]}
        onClose={() => {}}
        onStopped={() => {}}
      />,
    );
    expect(single).not.toContain(' · ' + tt('side.R.button'));
  });
});

describe('a folded time row', () => {
  it('says the chosen time in a few words: now, minutes ago or the picked clock time', () => {
    expect(timeChoiceText(tt, 'tr', { kind: 'now' })).toBe(tt('time.foldedNow'));
    expect(timeChoiceText(tt, 'tr', { kind: 'ago', minutes: 15 })).toBe(
      tt('time.agoChip', { m: 15 }),
    );
    expect(timeChoiceText(tt, 'tr', { kind: 'picked', at: NOW })).toBe(clockTime('tr', NOW));
  });
});
