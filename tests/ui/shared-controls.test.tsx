import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { cx } from '../../src/ui/shared/cx';
import { formatClock } from '../../src/ui/shared/format';
import { LiveDuration } from '../../src/ui/shared/LiveDuration';
import { radioKeyTarget } from '../../src/ui/shared/radio';
import { Segmented } from '../../src/ui/shared/Segmented';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);

describe('cx', () => {
  it('joins the truthy class names', () => {
    expect(cx('a', false, undefined, 'b', null, '')).toBe('a b');
  });
});

describe('radioKeyTarget', () => {
  it('moves with the arrow keys, wraps, and jumps with Home/End', () => {
    expect(radioKeyTarget('ArrowRight', 0, 3)).toBe(1);
    expect(radioKeyTarget('ArrowDown', 2, 3)).toBe(0);
    expect(radioKeyTarget('ArrowLeft', 0, 3)).toBe(2);
    expect(radioKeyTarget('ArrowUp', 1, 3)).toBe(0);
    expect(radioKeyTarget('Home', 2, 3)).toBe(0);
    expect(radioKeyTarget('End', 0, 3)).toBe(2);
    expect(radioKeyTarget('Enter', 0, 3)).toBeNull();
  });
});

describe('formatClock', () => {
  it('ticks as m:ss under an hour, h:mm:ss under a day, then days and hours', () => {
    expect(formatClock(t, 0)).toBe('0:00');
    expect(formatClock(t, 65_000)).toBe('1:05');
    expect(formatClock(t, 3_600_000 + 62_000)).toBe('1:01:02');
    expect(formatClock(t, -5_000)).toBe('0:00');
    expect(formatClock(t, 25 * 3_600_000)).toBe(translate('tr', 'time.daysHours', { d: 1, h: 1 }));
  });
});

describe('Segmented', () => {
  it('is a labelled radio group with one tab stop on the checked segment', () => {
    const html = renderToStaticMarkup(
      <Segmented
        label={t('bottle.contents')}
        options={[
          { value: 'breastmilk', label: t('bottle.breastmilk') },
          { value: 'formula', label: t('bottle.formula') },
          { value: 'mixed', label: t('bottle.mixed') },
        ]}
        value="formula"
        onChange={() => {}}
      />,
    );
    expect(html).toMatch(/role="radiogroup"/);
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(
      new RegExp(`aria-checked="true"[^>]*tabindex="0"[^>]*>${t('bottle.formula')}<`),
    );
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html).toContain(t('bottle.contents'));
  });
});

describe('LiveDuration', () => {
  it('shows a ticking clock to the eye and minutes to assistive tech', () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="tr">
        <LiveDuration since={Date.now() - 65_000} />
      </I18nProvider>,
    );
    expect(html).toMatch(/data-testid="live-text"/);
    expect(html).toMatch(/<span aria-hidden="true">1:0[56]<\/span>/);
    expect(html).toContain(translate('tr', 'time.minutes', { m: 1 }));
  });
});
