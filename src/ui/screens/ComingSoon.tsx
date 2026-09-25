import type { Tab } from '../TabBar';
import { useT } from '../I18nProvider';

export function ComingSoon({ tab }: { tab: Exclude<Tab, 'settings' | 'home' | 'log'> }) {
  const t = useT();
  return (
    <section>
      <h1>{t(`tab.${tab}`)}</h1>
      <p className="muted">{t('common.comingSoon')}</p>
    </section>
  );
}
