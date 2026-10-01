import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsSection } from '../../src/ui/settings/SettingsSection';

describe('SettingsSection', () => {
  it('renders a heading then its children, inside a section', () => {
    const html = renderToStaticMarkup(
      <SettingsSection label="Group label">
        <p>content</p>
      </SettingsSection>,
    );
    expect(html).toMatch(/<section[^>]*><h2[^>]*>Group label<\/h2><p>content<\/p><\/section>/);
  });
});
