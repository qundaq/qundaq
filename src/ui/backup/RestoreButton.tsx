import { useT } from '../app/I18nProvider';
import styles from './Backup.module.css';

/**
 * import.title ("restore from backup"): a label styled as a button around a transparent file input, because iOS opens its
 * picker only on a real tap on the input. No `accept`: iOS greys out files whose type it cannot map, and
 * the validator decides anyway. The value is reset after each pick, so the same file can be picked again.
 */
export function RestoreButton({ onFile }: { onFile: (file: File) => void }) {
  const t = useT();
  return (
    <label className={styles.fileButton}>
      {t('backup.import')}
      <input
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
