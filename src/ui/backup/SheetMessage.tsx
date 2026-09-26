import { useT } from '../I18nProvider';

/** A sheet's failure: the message and a button that closes the sheet. */
export function SheetMessage({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return (
    <>
      <p role="alert" className="status-warn">
        {message}
      </p>
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.dismiss')}
        </button>
      </div>
    </>
  );
}
