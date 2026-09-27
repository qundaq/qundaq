import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { nextToast, type ToastItem, type ToastRequest } from './toast';
import styles from './ToastBanner.module.css';

const ToastContext = createContext<(request: ToastRequest) => void>(() => {});

/** Feedback above the tab bar: "kaydedildi · Geri al". The region exists while empty so the first message is announced. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const show = useCallback(
    (request: ToastRequest) => setItem((current) => nextToast(current, request)),
    [],
  );
  useEffect(() => {
    if (!item) return;
    const handle = window.setTimeout(
      () => setItem((current) => (current?.id === item.id ? null : current)),
      item.durationMs,
    );
    return () => window.clearTimeout(handle);
  }, [item]);
  const act = () => {
    item?.action?.onAction();
    setItem(null);
  };
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {item && (
          <div key={item.id} className={styles.toast}>
            <Icon name="check" size={16} className={styles.check} />
            <span className={styles.message}>{item.message}</span>
            {item.action && (
              <Button variant="tertiary" onClick={act}>
                {item.action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
