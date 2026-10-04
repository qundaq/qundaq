import type { RecentMedication } from '../../../db/events';
import type { MessageKey } from '../../../i18n';
import { useT } from '../../app/I18nProvider';
import { typeIcon } from '../../history/describe';
import { Icon } from '../../shared/Icon';
import { formatAgo } from '../../shared/format';
import { useNow } from '../../shared/useNow';
import { OTHER_TYPES, type OtherType } from '../drafts';
import styles from '../LogSheet.module.css';

/** The fixed captions (other.caption.*): medication's is built from `recent` instead; temperature and healthNote have none. */
const CAPTION_KEY: Partial<Record<OtherType, MessageKey>> = {
  growth: 'other.caption.growth',
};

export interface OtherListProps {
  /** The most recently used medicine (recentMedicationNames' first row); null shows the medication row with no caption. */
  recent: RecentMedication | null;
  onPick: (type: OtherType) => void;
}

/** The "Other" sheet's first step (other.title): one 56 px row per type, opening its form. */
export function OtherList({ recent, onPick }: OtherListProps) {
  const t = useT();
  const now = useNow();
  const caption = (type: OtherType): string | null => {
    if (type === 'medication')
      return recent
        ? t('other.caption.medication', {
            name: recent.name,
            ago: formatAgo(t, now - recent.at),
          })
        : null;
    const key = CAPTION_KEY[type];
    return key ? t(key) : null;
  };
  return (
    <div>
      {OTHER_TYPES.map((type) => {
        const text = caption(type);
        return (
          <button key={type} type="button" className={styles.otherRow} onClick={() => onPick(type)}>
            <Icon name={typeIcon(type)} className={styles.otherIcon} />
            <span className={styles.otherLabel}>
              <span>{t(`other.chip.${type}`)}</span>
              {text && <span className={styles.otherCaption}>{text}</span>}
            </span>
            <Icon name="chevron-right" className={styles.otherChevron} />
          </button>
        );
      })}
    </div>
  );
}
