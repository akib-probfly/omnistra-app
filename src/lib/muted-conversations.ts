import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zurvis-muted-conversation-ids';

let cache: Set<string> | null = null;
let loadPromise: Promise<Set<string>> | null = null;

async function loadMutedIds(): Promise<Set<string>> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        const parsed = value ? (JSON.parse(value) as unknown) : [];
        cache = new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
        return cache;
      })
      .catch(() => {
        cache = new Set();
        return cache;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

async function persist(ids: Set<string>) {
  cache = ids;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export async function isConversationNotificationsMuted(conversationId: string) {
  const ids = await loadMutedIds();
  return ids.has(conversationId);
}

export async function muteConversationNotifications(conversationId: string) {
  const ids = new Set(await loadMutedIds());
  ids.add(conversationId);
  await persist(ids);
}

export async function unmuteConversationNotifications(conversationId: string) {
  const ids = new Set(await loadMutedIds());
  if (!ids.has(conversationId)) return;
  ids.delete(conversationId);
  await persist(ids);
}
