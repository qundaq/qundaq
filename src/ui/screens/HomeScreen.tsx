import type { Settings } from '../../db/settings';
import { useT } from '../I18nProvider';

interface Props {
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => Promise<void>;
}

export function HomeScreen(_props: Props) {
  const t = useT();
  return (
    <section>
      <h1>{t('tab.home')}</h1>
    </section>
  );
}
