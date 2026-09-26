import type { SheetKind } from '../log/drafts';
import { useT } from '../app/I18nProvider';

const KINDS: readonly SheetKind[] = ['breastfeed', 'bottle', 'sleep', 'diaper', 'other'];

export function QuickActions({ onPick }: { onPick: (kind: SheetKind) => void }) {
  const t = useT();
  return (
    <div className="quick-actions" role="group" aria-label={t('quick.label')}>
      {KINDS.map((kind) => (
        <button key={kind} type="button" className="btn" onClick={() => onPick(kind)}>
          {t(`quick.${kind}`)}
        </button>
      ))}
    </div>
  );
}
