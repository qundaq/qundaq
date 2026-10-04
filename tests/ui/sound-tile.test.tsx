import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { SoundTile } from '../../src/ui/sounds/SoundTile';

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="en">{node}</I18nProvider>);

describe('SoundTile', () => {
  it.each([
    ['off', 'White noise: Play'],
    ['loading', 'White noise: Pause'],
    ['playing', 'White noise: Pause'],
    ['paused', 'White noise: Resume'],
  ] as const)('a %s tile is named "%s"', (state, label) => {
    const html = render(<SoundTile name="White noise" state={state} onSelect={() => {}} />);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toContain('aria-disabled="true"');
  });

  it('a loading tile says it is preparing', () => {
    expect(render(<SoundTile name="Train" state="loading" onSelect={() => {}} />)).toContain(
      'Preparing…',
    );
  });

  it('an unavailable tile says so, in its name too, and is aria-disabled', () => {
    const html = render(<SoundTile name="Train" state="unavailable" onSelect={() => {}} />);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('This sound isn’t available right now.');
    expect(html).toContain('aria-label="Train: This sound isn’t available right now."');
    // Only the name is dimmed: the note is not inside it, so it keeps full contrast.
    expect(html).toContain('<span class="tileName">Train</span><span class="tileNote">');
  });

  it.each([
    ['off', 'tile'],
    ['loading', 'tile tileOn'],
    ['playing', 'tile tileOn'],
    ['paused', 'tile tilePaused'],
    ['unavailable', 'tile tileUnavailable'],
  ] as const)('a %s tile has the classes "%s", with no stray spaces', (state, classes) => {
    const html = render(<SoundTile name="Waves" state={state} onSelect={() => {}} />);
    expect(html).toContain(`class="${classes}"`);
    expect(html).toContain(`data-state="${state}"`);
  });
});
