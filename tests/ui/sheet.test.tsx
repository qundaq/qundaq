import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { Sheet, SheetFooter } from '../../src/ui/shared/Sheet';
import { SWIPE_CLOSE_PX, swipeCloses } from '../../src/ui/shared/swipe';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);

describe('Sheet', () => {
  it('has a titled header with a close button, and a back button only on request', () => {
    const plain = render(
      <Sheet open title="Bottle" onClose={() => {}}>
        <p>x</p>
      </Sheet>,
    );
    expect(plain).toMatch(/<h2[^>]*>Bottle<\/h2>/);
    expect(plain).toMatch(new RegExp(`aria-label="${t('common.dismiss')}"`));
    expect(plain).not.toMatch(new RegExp(`aria-label="${t('common.back')}"`));
    const withBack = render(
      <Sheet open title="Medication" onClose={() => {}} onBack={() => {}}>
        <p>x</p>
      </Sheet>,
    );
    expect(withBack).toMatch(new RegExp(`aria-label="${t('common.back')}"`));
  });

  it('renders a footer as the sheet content asks', () => {
    const html = render(
      <Sheet open title="Diaper" onClose={() => {}}>
        <form>
          <SheetFooter>
            <button type="submit">Save</button>
          </SheetFooter>
        </form>
      </Sheet>,
    );
    expect(html).toMatch(/<form><div class="[^"]*footer[^"]*"><button type="submit">Save/);
  });
});

describe('swipeCloses', () => {
  it('closes past the distance, or on a quick flick, never on a tap or an upward move', () => {
    expect(SWIPE_CLOSE_PX).toBe(96);
    expect(swipeCloses(97, 600)).toBe(true);
    expect(swipeCloses(40, 60)).toBe(true); // 0.67 px/ms
    expect(swipeCloses(40, 200)).toBe(false);
    expect(swipeCloses(10, 5)).toBe(false); // a tap that jittered
    expect(swipeCloses(-50, 50)).toBe(false);
  });
});
