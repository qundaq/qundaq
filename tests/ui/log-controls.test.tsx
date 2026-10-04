import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { translate } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { STOOL_GROUPS } from '../../src/domain/stool';
import { DEFAULT_INPUTS } from '../../src/ui/log/drafts';
import { BottleForm, DiaperForm, diaperKind, withDiaperKind } from '../../src/ui/log/forms/care';
import { TimeChips, chooseTime } from '../../src/ui/log/TimeChips';
import { DURATION_CHIPS, DurationChips } from '../../src/ui/log/forms/timers';
import { PumpButton } from '../../src/ui/home/PumpButton';
import { OtherList } from '../../src/ui/log/forms/OtherList';
import { formatAgo } from '../../src/ui/shared/format';

// Expected UI text, built from the dictionary the sheet renders (tr): never a Turkish literal here.
const tt = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate('tr', key, vars);

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);

describe('TimeChips', () => {
  it('offers "now", three "ago" chips and "pick a time" as one radio group', () => {
    const html = render(
      <TimeChips label={tt('time.when')} value={{ kind: 'now' }} onChange={() => {}} />,
    );
    expect(html).toMatch(/role="radiogroup"/);
    for (const text of [
      tt('sheet.now'),
      tt('time.agoChip', { m: 5 }),
      tt('time.agoChip', { m: 15 }),
      tt('time.agoChip', { m: 30 }),
      tt('time.pick'),
    ])
      expect(html).toContain(text);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).not.toContain('datetime-local');
  });
  it('shows the date-and-time field once "pick a time" is chosen', () => {
    const at = new Date(2026, 8, 25, 9, 40).getTime();
    const html = render(
      <TimeChips label={tt('time.when')} value={{ kind: 'picked', at }} onChange={() => {}} />,
    );
    expect(html).toMatch(/type="datetime-local"/);
    expect(html).toContain('value="2026-09-25T09:40"');
    expect(html).toContain(tt('time.picked'));
  });
});

describe('chooseTime', () => {
  const minute = new Date(2026, 8, 25, 9, 40).getTime();
  it('starts "pick a time" at the current minute', () => {
    expect(chooseTime('pick', { kind: 'now' }, minute)).toEqual({ kind: 'picked', at: minute });
  });
  it('keeps the typed time when "pick a time" is tapped again', () => {
    const typed = { kind: 'picked', at: minute - 3 * 60 * 60 * 1000 } as const;
    expect(chooseTime('pick', typed, minute)).toBe(typed);
  });
  it('takes any other chip as it is', () => {
    const typed = { kind: 'picked', at: minute } as const;
    expect(chooseTime({ kind: 'ago', minutes: 15 }, typed, minute)).toEqual({
      kind: 'ago',
      minutes: 15,
    });
  });
});

describe('DurationChips', () => {
  it('offers the type\'s durations and "other", and the minutes field only after "other"', () => {
    expect(DURATION_CHIPS).toEqual({
      breastfeed: [5, 10, 15, 20, 30],
      sleep: [20, 40, 60, 90, 120],
    });
    const sleep = render(<DurationChips kind="sleep" value={null} onChange={() => {}} />);
    for (const text of [
      tt('duration.minutes', { m: 20 }),
      tt('duration.minutes', { m: 40 }),
      tt('duration.hours', { h: '1' }),
      tt('duration.hours', { h: '1,5' }), // the Turkish decimal comma
      tt('duration.hours', { h: '2' }),
      tt('sheet.durationOther'),
    ])
      expect(sleep).toContain(text);
    expect(sleep).toMatch(/role="radiogroup"/);
    expect(sleep).not.toMatch(/aria-checked="true"/);
    expect(sleep).not.toContain(tt('sheet.durationMinutes'));
    const chip = render(<DurationChips kind="breastfeed" value={15} onChange={() => {}} />);
    expect(chip.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(chip).not.toContain(tt('sheet.durationMinutes'));
    // 17 is not a chip, so "other" is chosen and the field shows it.
    const custom = render(<DurationChips kind="breastfeed" value={17} onChange={() => {}} />);
    expect(custom).toContain(tt('sheet.durationMinutes'));
    expect(custom).toContain('value="17"');
  });
});

describe('diaper kind', () => {
  it('maps the three segments to wet and dirty and keeps stool details only when dirty', () => {
    const base = DEFAULT_INPUTS.diaper;
    expect(diaperKind(base)).toBe('wet');
    expect(withDiaperKind(base, 'both')).toMatchObject({ wet: true, dirty: true });
    const dirty = { ...withDiaperKind(base, 'dirty'), stoolColor: 'green' as const };
    expect(diaperKind(dirty)).toBe('dirty');
    expect(withDiaperKind(dirty, 'wet')).toMatchObject({
      wet: true,
      dirty: false,
      stoolColor: null,
      consistency: null,
    });
  });
  it('groups the nine colours: four usual, five to ask a doctor about', () => {
    expect(STOOL_GROUPS.usual).toEqual(['yellow', 'mustard', 'green', 'brown']);
    expect(STOOL_GROUPS.doctor).toEqual(['pale-yellow', 'clay', 'white', 'red', 'black']);
  });
  it('shows the warning before any colour is chosen, and every colour by name', () => {
    const html = render(
      <DiaperForm value={withDiaperKind(DEFAULT_INPUTS.diaper, 'dirty')} onChange={() => {}} />,
    );
    expect(html).toContain(tt('stool.askDoctor'));
    for (const id of [...STOOL_GROUPS.usual, ...STOOL_GROUPS.doctor])
      expect(html).toContain(`>${tt(`stool.color.${id}`)}<`);
    expect(html).not.toMatch(/role="alert"/);
  });
  it('ties the ask-a-doctor line to the doctor-group colours only, for screen readers', () => {
    const html = render(
      <DiaperForm value={withDiaperKind(DEFAULT_INPUTS.diaper, 'dirty')} onChange={() => {}} />,
    );
    const line = [...html.matchAll(/<p id="([^"]+)"[^>]*>(.*?)<\/p>/g)].find(([, , inner]) =>
      inner!.includes(tt('stool.askDoctor')),
    );
    expect(line).toBeDefined();
    const radio = (id: string) => html.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))![0];
    for (const id of STOOL_GROUPS.doctor)
      expect(radio(id)).toContain(`aria-describedby="${line![1]}"`);
    for (const id of STOOL_GROUPS.usual) expect(radio(id)).not.toContain('aria-describedby');
  });
});

describe('OtherList', () => {
  it('lists the four types with their captions, the latest medicine first', () => {
    const at = Date.now() - 60 * 60_000;
    const html = render(<OtherList recent={{ name: 'Vitamin D', at }} onPick={() => {}} />);
    for (const text of [
      tt('other.chip.medication'),
      tt('other.chip.growth'),
      tt('other.chip.temperature'),
      tt('other.chip.healthNote'),
      tt('other.caption.growth'),
    ])
      expect(html).toContain(text);
    expect(html).toContain(
      tt('other.caption.medication', { name: 'Vitamin D', ago: formatAgo(tt, Date.now() - at) }),
    );
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).not.toContain(tt('sheet.pump.title'));
  });
  it('shows no caption for medication without a recent one', () => {
    // "·" only ever appears inside the medication caption (other.caption.medication); its absence means
    // the row rendered with no caption at all, not an interpolated-but-empty one.
    const html = render(<OtherList recent={null} onPick={() => {}} />);
    expect(html).toContain(tt('other.chip.medication'));
    expect(html).not.toContain('·');
  });
});

describe('PumpButton', () => {
  it('is one labelled droplets button that asks for a baby-less pump sheet', () => {
    const html = render(<PumpButton onOpen={() => {}} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(tt('home.pump'));
    expect(html).toContain('<svg');
  });
});

describe('BottleForm', () => {
  it('says the last amount when there is one', () => {
    const html = render(
      <BottleForm
        value={{ ml: 90, contents: 'formula' }}
        last={{ ml: 90, contents: 'formula' }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain(tt('bottle.last', { ml: 90 }));
    expect(html).toContain(`aria-label="${tt('sheet.amount')}"`);
    expect(html).toContain('value="90"');
  });
});
