import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '../../src/ui/shared/Button';
import { Chip } from '../../src/ui/shared/Chip';
import { Card } from '../../src/ui/shared/Card';
import { Field } from '../../src/ui/shared/Field';
import { VisuallyHidden } from '../../src/ui/shared/VisuallyHidden';

describe('Button', () => {
  it('defaults to a secondary type=button and exposes the variant, size and armed state as classes/data', () => {
    const html = renderToStaticMarkup(<Button>Cancel</Button>);
    expect(html).toMatch(/type="button"/);
    expect(html).toMatch(/class="[^"]*\bsecondary\b/);
    const primary = renderToStaticMarkup(
      <Button variant="primary" size="lg" block icon="check">
        Save
      </Button>,
    );
    expect(primary).toMatch(/\bprimary\b/);
    expect(primary).toMatch(/\blg\b/);
    expect(primary).toMatch(/\bblock\b/);
    expect(primary).toMatch(/<svg/);
    expect(
      renderToStaticMarkup(
        <Button variant="danger" armed>
          Delete
        </Button>,
      ),
    ).toMatch(/data-armed="true"/);
    expect(renderToStaticMarkup(<Button type="submit">Save</Button>)).toMatch(/type="submit"/);
  });
});

describe('Chip', () => {
  it('is a toggle by default and a radio on request', () => {
    expect(renderToStaticMarkup(<Chip selected>Ada</Chip>)).toMatch(/aria-pressed="true"/);
    const radio = renderToStaticMarkup(
      <Chip selected={false} mode="radio">
        15 min
      </Chip>,
    );
    expect(radio).toMatch(/role="radio"/);
    expect(radio).toMatch(/aria-checked="false"/);
    expect(radio).not.toMatch(/aria-pressed/);
  });
});

describe('Card', () => {
  it('draws the accent stripe through the style prop and the tone as a class', () => {
    const html = renderToStaticMarkup(
      <Card as="article" accent="#f08ab5" tone="info" aria-label="Ada">
        x
      </Card>,
    );
    expect(html).toMatch(/^<article/);
    expect(html).toMatch(/border-left-color:#f08ab5/);
    expect(html).toMatch(/\binfo\b/);
    expect(html).toMatch(/aria-label="Ada"/);
  });
});

describe('Field', () => {
  it('wraps the label text and control in a <label>, and announces an error outside it', () => {
    const html = renderToStaticMarkup(
      <Field label="Amount (ml)" hint="1–1000" error="Enter a valid amount.">
        <input />
      </Field>,
    );
    expect(html).toMatch(/^<div/);
    expect(html).toMatch(/<label[^>]*>.*Amount \(ml\).*<input[^>]*>.*<\/label>/);
    expect(html).toMatch(/role="alert"[^>]*>Enter a valid amount\./);
    // The error markup sits after the closing </label>, not inside it.
    expect(html.indexOf('</label>')).toBeLessThan(html.indexOf('role="alert"'));
    const [describedBy] = /aria-describedby="([^"]+)"/.exec(html) ?? [];
    expect(describedBy).toBeTruthy();
  });

  it('skips aria-describedby when neither hint nor error is given', () => {
    const html = renderToStaticMarkup(
      <Field label="Name">
        <input />
      </Field>,
    );
    expect(html).not.toMatch(/aria-describedby/);
  });
});

describe('VisuallyHidden', () => {
  it('renders the requested element', () => {
    expect(renderToStaticMarkup(<VisuallyHidden as="h1">Settings</VisuallyHidden>)).toMatch(
      /^<h1 class="[^"]*">Settings<\/h1>$/,
    );
  });
});
