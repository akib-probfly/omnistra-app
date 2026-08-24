import { useEffect, useState } from 'react';

type Listener = (reason: string | null) => void;

let lockedReason: string | null = null;
const listeners = new Set<Listener>();

export function isBillingLocked() {
  return Boolean(lockedReason);
}

export function getBillingLockReason() {
  return lockedReason;
}

export function setBillingLocked(reason: string | null) {
  const next = reason?.trim() || null;
  if (lockedReason === next) return;
  lockedReason = next;
  listeners.forEach((listener) => listener(lockedReason));
}

export function clearBillingLock() {
  setBillingLocked(null);
}

export function subscribeBillingLock(listener: Listener) {
  listeners.add(listener);
  listener(lockedReason);
  return () => {
    listeners.delete(listener);
  };
}

export function useBillingLockReason() {
  const [reason, setReason] = useState(getBillingLockReason);
  useEffect(() => subscribeBillingLock(setReason), []);
  return reason;
}

export function pollingWhileUnlocked<T extends number | false>(interval: T | ((...args: never[]) => T)) {
  return ((...args: never[]) => {
    if (isBillingLocked()) return false as const;
    return typeof interval === 'function' ? interval(...args) : interval;
  }) as T extends number ? () => T | false : typeof interval;
}

export function isPaymentRequiredError(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error && (error as { status: number }).status === 402;
}
