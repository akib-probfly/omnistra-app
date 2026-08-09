import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_INBOX_PATTERN,
  parseInboxPattern,
  type InboxPatternId,
} from '../lib/inbox-patterns';

const STORAGE_KEYS = {
  pattern: 'osaas-inbox-pattern',
  channelSpecific: 'osaas-inbox-channel-specific-background',
  colorfulAvatars: 'osaas-colorful-avatars',
} as const;

type AppearanceState = {
  pattern: InboxPatternId;
  channelSpecific: boolean;
  colorfulAvatars: boolean;
  hydrated: boolean;
};

const DEFAULT_STATE: AppearanceState = {
  pattern: DEFAULT_INBOX_PATTERN,
  // Match frontend thread behavior: selected pattern shows unless the user opts in.
  channelSpecific: false,
  colorfulAvatars: true,
  hydrated: false,
};

let state: AppearanceState = { ...DEFAULT_STATE };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

async function hydrate() {
  try {
    const [pattern, channelSpecific, colorfulAvatars] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.pattern),
      AsyncStorage.getItem(STORAGE_KEYS.channelSpecific),
      AsyncStorage.getItem(STORAGE_KEYS.colorfulAvatars),
    ]);
    state = {
      pattern: parseInboxPattern(pattern),
      channelSpecific: channelSpecific === null ? false : channelSpecific === 'true',
      colorfulAvatars: colorfulAvatars === null ? true : colorfulAvatars === 'true',
      hydrated: true,
    };
  } catch {
    state = { ...DEFAULT_STATE, hydrated: true };
  }
  emit();
}

void hydrate();

async function setPattern(next: InboxPatternId) {
  state = { ...state, pattern: next };
  emit();
  await AsyncStorage.setItem(STORAGE_KEYS.pattern, next);
}

async function setChannelSpecific(next: boolean) {
  state = { ...state, channelSpecific: next };
  emit();
  await AsyncStorage.setItem(STORAGE_KEYS.channelSpecific, next ? 'true' : 'false');
}

async function setColorfulAvatars(next: boolean) {
  state = { ...state, colorfulAvatars: next };
  emit();
  await AsyncStorage.setItem(STORAGE_KEYS.colorfulAvatars, next ? 'true' : 'false');
}

export function useInboxAppearance() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    pattern: snapshot.pattern,
    channelSpecific: snapshot.channelSpecific,
    colorfulAvatars: snapshot.colorfulAvatars,
    hydrated: snapshot.hydrated,
    setPattern: useCallback((next: InboxPatternId) => {
      void setPattern(next);
    }, []),
    setChannelSpecific: useCallback((next: boolean) => {
      void setChannelSpecific(next);
    }, []),
    setColorfulAvatars: useCallback((next: boolean) => {
      void setColorfulAvatars(next);
    }, []),
  };
}

/** Lightweight selectors used by list/thread screens. */
export function useInboxPattern() {
  const { pattern, setPattern } = useInboxAppearance();
  return { pattern, setPattern };
}

export function useChannelSpecificInboxBackground() {
  const { channelSpecific, setChannelSpecific } = useInboxAppearance();
  return { enabled: channelSpecific, setEnabled: setChannelSpecific };
}

export function useColorfulAvatars() {
  const { colorfulAvatars, setColorfulAvatars } = useInboxAppearance();
  return {
    enabled: colorfulAvatars,
    setEnabled: setColorfulAvatars,
  };
}
