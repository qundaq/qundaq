import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ICONS, ICON_NAMES } from '../../src/ui/shared/icons';
import { Icon } from '../../src/ui/shared/Icon';

describe('icons', () => {
  it('has every name the shell and the screens use, with path data only', () => {
    for (const name of [
      'house',
      'list',
      'chart-column',
      'audio-lines',
      'sliders-horizontal',
      'heart',
      'milk',
      'moon',
      'baby',
      'ellipsis',
      'triangle-alert',
      'pencil',
      'undo-2',
      'arrow-left-right',
    ] as const)
      expect(ICON_NAMES).toContain(name);
    for (const name of ICON_NAMES) {
      const markup = ICONS[name];
      expect(markup, name).toMatch(/^(<(path|circle|rect|line|polyline|polygon)\b[^>]*\/>\s*)+$/);
      expect(markup, name).not.toMatch(/<svg|<script|href=|url\(/);
    }
  });
  it('renders an aria-hidden svg by default and a labelled image on request', () => {
    expect(renderToStaticMarkup(createElement(Icon, { name: 'house' }))).toMatch(
      /<svg[^>]*aria-hidden="true"/,
    );
    const labelled = renderToStaticMarkup(
      createElement(Icon, { name: 'triangle-alert', label: 'Warning' }),
    );
    expect(labelled).toMatch(/role="img"/);
    expect(labelled).toMatch(/aria-label="Warning"/);
    expect(labelled).toMatch(/width="20"/);
  });
});
