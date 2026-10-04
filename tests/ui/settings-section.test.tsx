import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsSection } from '../../src/ui/settings/SettingsSection';
import { Card, CardTitle } from '../../src/ui/shared/Card';

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

describe('card titles in a section', () => {
  it('sit one level under the section label: h2 label, h3 title', () => {
    const html = renderToStaticMarkup(
      <SettingsSection label="Group label">
        <Card>
          <CardTitle>Card title</CardTitle>
        </Card>
      </SettingsSection>,
    );
    expect(html).toMatch(/<h2[^>]*>Group label<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Card title<\/h3>/);
    expect(html).not.toMatch(/<h2[^>]*>Card title/);
  });
});
