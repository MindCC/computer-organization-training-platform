import { useEffect, useRef } from 'react';

// A new owner gets a new token even if an earlier request is still running.
export function useSessionScope(owner, enabled) {
  const current = useRef(null);
  const mounted = useRef(true);
  const key = enabled && owner ? owner : null;
  if (current.current?.key !== key) current.current = { key };
  const scope = current.current;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return { scope, isCurrent: () => mounted.current && scope.key !== null && current.current === scope };
}
