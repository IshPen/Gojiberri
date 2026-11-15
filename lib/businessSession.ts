import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

// The business a device is signed in as. A business user acts for this one account only.
export type BusinessAccount = { name: string; sponsorId: string | null; businessId: string | null };

const BUSINESS_KEY = "gojiberri.business";

type Listener = (account: BusinessAccount | null) => void;

let cached: BusinessAccount | null | undefined;
const listeners = new Set<Listener>();

function emit(account: BusinessAccount | null) {
  cached = account;
  listeners.forEach((listener) => listener(account));
}

export async function getBusinessAccount(): Promise<BusinessAccount | null> {
  if (cached !== undefined) return cached;
  try {
    const stored = await AsyncStorage.getItem(BUSINESS_KEY);
    const parsed = stored ? (JSON.parse(stored) as BusinessAccount) : null;
    cached = parsed && typeof parsed.name === "string" && (parsed.sponsorId || parsed.businessId) ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function setBusinessAccount(account: BusinessAccount): Promise<void> {
  await AsyncStorage.setItem(BUSINESS_KEY, JSON.stringify(account));
  emit(account);
}

export async function clearBusinessAccount(): Promise<void> {
  await AsyncStorage.removeItem(BUSINESS_KEY);
  emit(null);
}

export function useBusinessAccount(): { account: BusinessAccount | null; loading: boolean } {
  const [account, setState] = useState<BusinessAccount | null | undefined>(cached);

  useEffect(() => {
    const listener: Listener = (next) => setState(next);
    listeners.add(listener);
    if (cached === undefined) getBusinessAccount().then(setState, () => setState(null));
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { account: account ?? null, loading: account === undefined };
}
