import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Baby } from '../../src/domain/types';
import { translate, type MessageKey } from '../../src/i18n';
import { I18nProvider } from '../../src/ui/app/I18nProvider';
import { BabyFormDialog } from '../../src/ui/babies/BabyFormDialog';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate('tr', key, vars);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="tr">{node}</I18nProvider>);

const ADA: Baby = {
  id: 'baby-1',
  name: 'Ada',
  color: '#f08ab5',
  archived: false,
  createdAt: 0,
  updatedAt: 0,
};

describe('BabyFormDialog', () => {
  it('shows the two-step delete button and its always-visible hint only when editing', () => {
    const editing = render(<BabyFormDialog open baby={ADA} usedColors={[]} onClose={() => {}} />);
    expect(editing).toContain(t('babies.deleteHint'));
    expect(editing).toMatch(
      new RegExp(`class="editDelete"><p class="hint">${t('babies.deleteHint')}`),
    );
    expect(editing).toMatch(new RegExp(`>${t('babies.delete')}</button>`));
    // Freshly opened: not yet armed, so it carries no armed marker and shows the plain label, not the confirm one.
    expect(editing).not.toMatch(/data-armed="true"/);
    expect(editing).not.toContain(t('babies.deleteConfirm'));

    const adding = render(<BabyFormDialog open usedColors={[]} onClose={() => {}} />);
    expect(adding).not.toContain('editDelete');
    expect(adding).not.toContain(t('babies.deleteHint'));
    expect(adding).not.toContain(t('babies.delete'));
  });
});
