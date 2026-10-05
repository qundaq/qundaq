import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PumpEvent } from '../../src/domain/pump';
import { MINUTE } from '../../src/domain/time';
import type { TrackerEvent } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { PumpStrip } from '../../src/ui/home/PumpStrip';
import { LogSheet } from '../../src/ui/log/LogSheet';
import { PumpMlFields, measuredMinutes, pumpStopPatch } from '../../src/ui/log/forms/pump';
import { SideMinutes, chipTap } from '../../src/ui/log/forms/SideMinutes';

// Expected UI text, built from the dictionary the sheet renders (tr): never a Turkish literal here.
const tt = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);
const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const pump = (fields: Partial<PumpEvent> = {}): PumpEvent => ({
  id: 'p',
  type: 'pump',
  babyId: null,
  startAt: Date.now() - 8 * MINUTE,
  side: 'L',
  createdAt: 0,
  updatedAt: 0,
  ...fields,
});

const sheet = (events: readonly TrackerEvent[] = []) =>
  render(<LogSheet request={{ kind: 'pump' }} babies={[]} events={events} onClose={() => {}} />);

describe('the pumping sheet', () => {
  it('starts the timer from three buttons on top: left, right and both at once', () => {
    const html = sheet();
    expect(html).toContain(tt('pump.start'));
    for (const side of ['L', 'R', 'B'] as const)
      expect(html).toContain(`>${tt(`side.${side}.button`)}</span>`);
    // The start buttons come before "log afterwards".
    expect(html.indexOf(tt('side.B.button'))).toBeLessThan(html.indexOf(tt('entry.later')));
  });

  it('logs afterwards in minutes per side, with ml and the note behind their own buttons', () => {
    const html = sheet();
    expect(html).toContain(tt('entry.later'));
    expect(html).toContain(
      `aria-label="${tt('sideMinutes.value', { side: tt('side.L.button') })}"`,
    );
    expect(html).toContain(tt('pump.addMl'));
    expect(html).toContain(tt('note.add'));
    expect(html).not.toContain(tt('pump.ml', { side: tt('side.L.button') }));
    expect(html).toContain(tt('entry.endAt', { when: tt('time.foldedNow') }));
  });

  it('keeps Save disabled with a hint until minutes or ml are filled', () => {
    const html = sheet();
    const hint = /<p id="([^"]+)"[^>]*>([^<]*)<\/p>/.exec(html)!;
    expect(hint[2]).toBe(tt('pump.required'));
    expect(html).toMatch(new RegExp(`disabled=""[^>]*aria-describedby="${hint[1]}"`));
  });

  it('while a pump runs, the sheet finishes it: the running line, the measured minutes and Stop', () => {
    const html = sheet([pump({ side: 'R' })]);
    expect(html).not.toContain(tt('pump.start'));
    expect(html).toContain(tt('strip.pumping', { side: tt('side.R.button') }));
    expect(html).toContain(tt('pump.measured'));
    expect(html).toMatch(
      new RegExp(
        `aria-label="${tt('sideMinutes.value', { side: tt('side.R.button') })}"[^>]*value="8"`,
      ),
    );
    expect(html).toContain(`>${tt('timer.stop')}</button>`);
  });

  it('shows the measured minutes muted and tied to their caption until the parent changes them', () => {
    const html = sheet([pump({ side: 'R' })]);
    const caption = new RegExp(`<p id="([^"]+)"[^>]*>${tt('pump.measured')}</p>`).exec(html)!;
    expect(caption).not.toBeNull();
    // Both number fields are described by the caption.
    expect(html.match(new RegExp(`aria-describedby="${caption[1]}"`, 'g'))).toHaveLength(2);
    // The measured side's box has the muted look; the empty side keeps the empty one.
    const box = (side: 'L' | 'R') =>
      new RegExp(
        `<label class="([^"]+)"><input[^>]*aria-label="${tt('sideMinutes.value', { side: tt(`side.${side}.button`) })}"`,
      ).exec(html)![1]!;
    expect(box('R')).toMatch(/\bmeasured\b/);
    expect(box('R')).not.toMatch(/\bfilled\b/);
    expect(box('L')).toMatch(/\bempty\b/);
  });
});

describe('the measured minutes and the chips', () => {
  it('shows no chip as chosen while the value is measured, so the matching chip is not a toggle', () => {
    const chips = (measured: boolean) =>
      render(
        <SideMinutes
          values={{ left: 10, right: null }}
          onChange={() => {}}
          max={180}
          measured={measured}
        />,
      ).match(/aria-checked="true"/g)?.length ?? 0;
    expect(chips(true)).toBe(0);
    expect(chips(false)).toBe(1);
  });

  it('a tap on the chip matching the measured minutes keeps them; once chosen, the same tap clears', () => {
    expect(chipTap(10, 10, 180, true)).toBe(10);
    expect(chipTap(10, 15, 180, true)).toBe(15);
    expect(chipTap(10, 10, 180, false)).toBeNull();
  });
});

describe('the ml fields', () => {
  it('sit under their own "Amount (ml)" heading, so they never read as more minute rows', () => {
    const html = render(<PumpMlFields value={{ mlLeft: '', mlRight: '' }} onChange={() => {}} />);
    const group = /role="group" aria-labelledby="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(`<span id="${group}" class="mlTitle">${tt('sheet.amount')}</span>`);
    expect(html.match(new RegExp(`>${tt('pump.mlUnit')}</span>`, 'g'))).toHaveLength(2);
    expect(translate('en', 'pump.mlUnit')).toBe('ml');
  });

  it('are two named text fields with the numeric keypad, side by side', () => {
    const html = render(<PumpMlFields value={{ mlLeft: '60', mlRight: '' }} onChange={() => {}} />);
    expect(html).toContain(`aria-label="${tt('pump.ml', { side: tt('side.L.button') })}"`);
    expect(html).toContain(`aria-label="${tt('pump.ml', { side: tt('side.R.button') })}"`);
    expect(html.match(/inputMode="numeric"/g)).toHaveLength(2);
    expect(html).toContain('value="60"');
  });
});

describe('stopping a pump from its sheet', () => {
  it('measures the minutes on the side(s) the pump runs on, up to the chosen end', () => {
    const start = 1_000_000;
    expect(measuredMinutes(pump({ startAt: start, side: 'L' }), start + 12 * MINUTE)).toEqual({
      left: 12,
      right: null,
    });
    expect(measuredMinutes(pump({ startAt: start, side: 'B' }), start + 20 * 1000)).toEqual({
      left: 1,
      right: 1,
    });
    expect(measuredMinutes(pump({ startAt: start, side: 'R' }), start - MINUTE)).toEqual({
      left: null,
      right: 1,
    });
  });

  it('sends the minutes only once corrected, and the ml typed (a typo as NaN)', () => {
    expect(pumpStopPatch(null, { mlLeft: '', mlRight: '' })).toEqual({});
    expect(pumpStopPatch({ left: 15, right: null }, { mlLeft: '', mlRight: ' 80 ' })).toEqual({
      minLeft: 15,
      minRight: null,
      mlRight: 80,
    });
    expect(pumpStopPatch(null, { mlLeft: '6x', mlRight: '' }).mlLeft).toBeNaN();
  });
});

describe('the running pump strip', () => {
  it('is a named region: the text opens the sheet, Stop is a named 48 px button', () => {
    const html = render(
      <PumpStrip pump={pump({ side: 'B' })} onOpen={() => {}} onStop={() => {}} />,
    );
    expect(html).toContain(`aria-label="${attr(tt('strip.pump.region'))}"`);
    expect(html).toMatch(/<section[^>]*aria-label=/);
    expect(html).toContain(tt('strip.pumping', { side: tt('side.B.button') }));
    expect(html).toContain('aria-haspopup="dialog"');
    // The open button's name is stable: what runs and what a tap does, never the ticking clock.
    const what = tt('strip.pumping', { side: tt('side.B.button') });
    expect(html).toContain(`aria-label="${attr(tt('strip.pump.open', { what }))}"`);
    expect(html).toMatch(/aria-haspopup="dialog" aria-label="[^"]*"/);
    expect(/aria-haspopup="dialog" aria-label="([^"]*)"/.exec(html)![1]).not.toMatch(/\d/);
    expect(html).toContain(`aria-label="${tt('timer.stopPump')}"`);
    expect(html).toContain(`>${tt('timer.stop')}</button>`);
    expect(html).toContain('data-testid="live-text"');
  });

  it('shows the hint it is given under the strip', () => {
    const html = render(
      <PumpStrip pump={pump()} onOpen={() => {}} onStop={() => {}} hint={<p>hint</p>} />,
    );
    expect(html).toMatch(/<\/div><p>hint<\/p><\/section>/);
  });
});
