export interface ToastRequest {
  message: string;
  action?: { label: string; onAction: () => void };
  durationMs?: number;
}
export interface ToastItem extends ToastRequest {
  id: number;
  durationMs: number;
}
export const TOAST_DEFAULT_MS = 5000;

/** One toast at a time: a new request replaces the current one and restarts the clock. */
export function nextToast(current: ToastItem | null, request: ToastRequest): ToastItem {
  return {
    ...request,
    id: (current?.id ?? 0) + 1,
    durationMs: request.durationMs ?? TOAST_DEFAULT_MS,
  };
}
