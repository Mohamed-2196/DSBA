import { useEffect, useMemo, useRef, useState } from 'react';
import { ForumContext } from './context';
import { useForumStore } from './useForumStore';

/**
 * Runs the classmates' replies scheduled when the student posts a thread: each pending reply
 * shows a "typing" state, then lands. Timers are created once per pending item (not restarted
 * on re-render), so this also works when the film freezes Date.now(). Overdue items land at once.
 */
function usePendingReplies(pending, landPending) {
  const [typing, setTyping] = useState({}); // { [pendingId]: true }
  const timers = useRef(new Map());
  const landRef = useRef(landPending);
  useEffect(() => {
    landRef.current = landPending;
  });

  useEffect(() => {
    const live = new Set(pending.map((p) => p.id));
    for (const [id, handles] of timers.current) {
      if (!live.has(id)) {
        handles.forEach(clearTimeout);
        timers.current.delete(id);
      }
    }
    for (const p of pending) {
      if (timers.current.has(p.id)) continue;
      const now = Date.now();
      const handles = [];
      const land = () => {
        timers.current.delete(p.id);
        setTyping((t) => {
          if (!t[p.id]) return t;
          const next = { ...t };
          delete next[p.id];
          return next;
        });
        landRef.current(p.id);
      };
      if (p.dueAt - now <= 0) {
        handles.push(setTimeout(land, 0));
      } else {
        handles.push(setTimeout(() => setTyping((t) => ({ ...t, [p.id]: true })), Math.max(0, p.typingAt - now)));
        handles.push(setTimeout(land, p.dueAt - now));
      }
      timers.current.set(p.id, handles);
    }
  }, [pending]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const handles of map.values()) handles.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  return typing;
}

/** Provides the forum store to a page or widget. Cheap: all instances share one localStorage key. */
export function ForumProvider({ children }) {
  const forum = useForumStore();
  const typingIds = usePendingReplies(forum.state.pending, forum.landPending);
  const typing = useMemo(() => {
    // { [threadId]: [authorId] } for the pending replies currently "typing".
    const map = {};
    for (const p of forum.state.pending) {
      if (!typingIds[p.id]) continue;
      (map[p.threadId] ||= []).push(p.authorId);
    }
    return map;
  }, [forum.state.pending, typingIds]);
  const value = useMemo(() => ({ ...forum, typing }), [forum, typing]);
  return <ForumContext.Provider value={value}>{children}</ForumContext.Provider>;
}
