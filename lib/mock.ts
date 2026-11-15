import { useEffect, useState } from "react";

export function mockDelay<T>(value: T, ms = 600): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function useMockQuery<T>(value: T, enabled: boolean, ms = 600): T | undefined {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [enabled, ms]);

  return enabled && ready ? value : undefined;
}
