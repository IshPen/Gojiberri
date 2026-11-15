export const BACKEND_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {}

export function withTimeout<T>(promise: Promise<T>, message: string, ms: number = BACKEND_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
