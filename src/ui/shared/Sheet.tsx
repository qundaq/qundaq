import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Bottom sheet built on the native modal <dialog> (focus trap, Esc and top layer for free). */
export function Sheet({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Children stay mounted until the dialog has really closed, so a closing sheet never shows an empty frame.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={() => {
        setMounted(false);
        onClose();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {mounted && children}
    </dialog>
  );
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
