import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import {
  dismissTimer,
  nextToast,
  type DismissTimer,
  type ToastItem,
  type ToastRequest,
} from './toast';
import styles from './ToastBanner.module.css';

const ToastContext = createContext<(request: ToastRequest) => void>(() => {});

/** Feedback above the tab bar: a saved message with an undo action (common.undo). The region exists while empty so the first message is announced. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const show = useCallback(
    (request: ToastRequest) => setItem((current) => nextToast(current, request)),
    [],
  );
  // Each toast has its own clock; it stands still while the toast has focus or the pointer is over it,
  // so a keyboard or screen-reader user can reach the undo action (WCAG 2.2.1). A new toast starts unheld.
  const timer = useRef<DismissTimer | null>(null);
  useEffect(() => {
    if (!item) return;
    const current = dismissTimer(item.durationMs, () =>
      setItem((shown) => (shown?.id === item.id ? null : shown)),
    );
    timer.current = current;
    return () => {
      current.cancel();
      timer.current = null;
    };
  }, [item]);
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) timer.current?.release('focus');
  };
  const act = () => {
    item?.action?.onAction();
    setItem(null);
  };
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {item && (
          <div
            key={item.id}
            className={styles.toast}
            onFocus={() => timer.current?.hold('focus')}
            onBlur={onBlur}
            onPointerEnter={() => timer.current?.hold('pointer')}
            onPointerLeave={() => timer.current?.release('pointer')}
          >
            <Icon
              name={item.tone === 'info' ? 'info' : 'check'}
              size={16}
              className={item.tone === 'info' ? styles.info : styles.check}
            />
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
