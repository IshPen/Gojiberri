import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const USER_ID_KEY = "gojiberri.userId";

type Listener = (userId: string | null) => void;

let cached: string | null | undefined;
const listeners = new Set<Listener>();

function emit(userId: string | null) {
  cached = userId;
  listeners.forEach((listener) => listener(userId));
}

export async function getUserId(): Promise<string | null> {
  if (cached !== undefined) return cached;
  const stored = await AsyncStorage.getItem(USER_ID_KEY);
  if (stored && !/^[a-z0-9]{20,40}$/.test(stored)) {
    await AsyncStorage.removeItem(USER_ID_KEY);
    cached = null;
    return null;
  }
  cached = stored;
  return stored;
}

export async function setUserId(userId: string): Promise<void> {
  await AsyncStorage.setItem(USER_ID_KEY, userId);
  emit(userId);
}

export async function clearUserId(): Promise<void> {
  await AsyncStorage.removeItem(USER_ID_KEY);
  emit(null);
}

export function useUserId(): { userId: string | null; loading: boolean } {
  const [userId, setState] = useState<string | null | undefined>(cached);

  useEffect(() => {
    const listener: Listener = (next) => setState(next);
    listeners.add(listener);
    if (cached === undefined) {
      getUserId().then(setState, () => setState(null));
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { userId: userId ?? null, loading: userId === undefined };
}
