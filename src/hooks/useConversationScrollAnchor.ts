import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { type FlatList, type ViewInstance, type ListViewToken } from 'react-native';

type Anchor = { key: string; y: number };

// Preserve a real message's screen position rather than the total content
// height: virtualized lists estimate offscreen heights, and those estimates
// change when a page with differently sized bubbles is added.
export function useConversationScrollAnchor<T>(
  listRef: RefObject<FlatList<T> | null>,
  offsetRef: RefObject<number>,
  entries: T[],
  conversationId: string,
) {
  const nodes = useRef(new Map<string, ViewInstance>());
  const visibleKeys = useRef<string[]>([]);
  const anchor = useRef<Anchor | null>(null);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);

  const cancel = useCallback(() => {
    generation.current += 1;
    anchor.current = null;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    visibleKeys.current = [];
    cancel();
    return cancel;
  }, [conversationId, cancel]);

  const register = useCallback((key: string, node: ViewInstance | null) => {
    if (node) nodes.current.set(key, node);
    else nodes.current.delete(key);
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    visibleKeys.current = viewableItems.filter((item) => item.isViewable).map((item) => item.key);
  }).current;

  const capture = useCallback(async () => {
    cancel();
    const version = generation.current;
    const key = visibleKeys.current.find((candidate) => nodes.current.has(candidate));
    const node = key ? nodes.current.get(key) : null;
    if (!node || !key) return;
    // A disappearing native view must not prevent a page from being committed.
    await new Promise<void>((resolve) => {
      let finished = false;
      const timeout = setTimeout(() => { finished = true; resolve(); }, 120);
      node.measureInWindow((_x, y, width, height) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        if (version === generation.current && width > 0 && height > 0) anchor.current = { key, y };
        resolve();
      });
    });
  }, [cancel]);

  const restore = useCallback(() => {
    if (!anchor.current || frame.current != null) return;
    const version = generation.current;
    const measure = (remaining: number) => {
      frame.current = requestAnimationFrame(() => {
        const saved = anchor.current;
        const node = saved && nodes.current.get(saved.key);
        if (version !== generation.current) return;
        if (!saved || !node) { frame.current = null; anchor.current = null; return; }
        node.measureInWindow((_x, y, width, height) => {
          if (version !== generation.current) return;
          frame.current = null;
          if (width <= 0 || height <= 0) { anchor.current = null; return; }
          // In an inverted list, increasing offset moves the row DOWN on screen.
          const delta = saved.y - y;
          if (Math.abs(delta) > 1) {
            const offset = Math.max(0, offsetRef.current + delta);
            offsetRef.current = offset;
            listRef.current?.scrollToOffset({ offset, animated: false });
          }
          if (remaining > 0) measure(remaining - 1);
          else anchor.current = null;
        });
      });
    };
    measure(2);
  }, [listRef, offsetRef]);

  useLayoutEffect(() => { restore(); }, [entries, restore]);

  const isRestoring = useCallback(() => anchor.current != null, []);
  return { register, onViewableItemsChanged, capture, restore, cancel, isRestoring };
}
