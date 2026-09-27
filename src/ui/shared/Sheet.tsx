import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useT } from '../app/I18nProvider';
import { Button } from './Button';
import { cx } from './cx';
import { swipeCloses } from './swipe';
import styles from './Sheet.module.css';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Shows a back button before the title (a sheet with a second step, such as the "Other" sheet, quick.other). */
  onBack?: () => void;
  children: ReactNode;
}

interface Drag {
  pointerId: number;
  startY: number;
  startedAt: number;
  distance: number;
}

/**
 * Bottom sheet on the native modal <dialog> (focus trap, Esc, focus return and top layer for free). Closes
 * from the header's button, a tap on the backdrop, or a downward swipe on the handle and header; the body's
 * scrolling never starts a swipe. Closing never saves anything.
 */
export function Sheet({ open, title, onClose, onBack, children }: Props) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Children stay mounted until the dialog has really closed, so a closing sheet never shows an empty frame.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const pressedBackdrop = useRef(false);

  const close = () => ref.current?.close();

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the drag still works while the finger stays on the header.
    }
    setDrag({
      pointerId: event.pointerId,
      startY: event.clientY,
      startedAt: event.timeStamp,
      distance: 0,
    });
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    setDrag({ ...drag, distance: Math.max(0, event.clientY - drag.startY) });
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    const closes = swipeCloses(drag.distance, event.timeStamp - drag.startedAt);
    setDrag(null);
    if (closes) close();
  };

  return (
    <dialog
      ref={ref}
      className={cx(styles.sheet, drag !== null && styles.dragging)}
      aria-labelledby={titleId}
      // The swipe offset is the one inline style: a React style prop, allowed by the CSP.
      style={
        drag && drag.distance > 0 ? { transform: `translateY(${drag.distance}px)` } : undefined
      }
      // A press and a release on the ::backdrop reach the dialog itself, at points outside its box. Both
      // must: a text selection that starts in a field and ends on the backdrop also clicks the dialog.
      onPointerDown={(event) => {
        pressedBackdrop.current = onBackdrop(event);
      }}
      onClick={(event) => {
        const pressed = pressedBackdrop.current;
        pressedBackdrop.current = false;
        if (pressed && onBackdrop(event)) close();
      }}
      onClose={() => {
        setMounted(false);
        setDrag(null);
        pressedBackdrop.current = false;
        onClose();
      }}
    >
      <div
        className={styles.grab}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={() => setDrag(null)}
      >
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          {onBack && (
            <Button
              variant="tertiary"
              icon="chevron-left"
              className={styles.headerButton}
              aria-label={t('common.back')}
              onClick={onBack}
            />
          )}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <Button
            variant="tertiary"
            icon="x"
            className={styles.headerButton}
            aria-label={t('common.dismiss')}
            onClick={close}
          />
        </div>
      </div>
      {mounted && children}
    </dialog>
  );
}

/** Whether a pointer event on the dialog landed on its ::backdrop: the dialog itself, outside its box. */
function onBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  );
}

/** A sheet's primary action, pinned to the bottom of the sheet while its body scrolls. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

export interface SheetSession<T> {
  value: T;
  id: number;
}

/**
 * For a sheet opened with a value (a kind, an entry): keeps the last non-null value while the sheet
 * closes, so its title and form never go blank, and numbers each opening, so a form keyed by `id` starts
 * fresh every time.
 */
export function useSheetSession<T>(value: T | null): SheetSession<T> | null {
  const [session, setSession] = useState<SheetSession<T> | null>(
    value === null ? null : { value, id: 1 },
  );
  const [previous, setPrevious] = useState<T | null>(value);
  if (value !== previous) {
    setPrevious(value);
    if (value !== null) setSession({ value, id: (session?.id ?? 0) + 1 });
  }
  return session;
}
