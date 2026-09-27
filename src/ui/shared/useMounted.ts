import { useCallback, useEffect, useRef } from 'react';

/** Whether the component is still mounted: a save that settles after its sheet was dismissed reports elsewhere. */
export function useMounted(): () => boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
