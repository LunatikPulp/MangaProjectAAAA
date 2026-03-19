import { useRef, useEffect, useCallback } from 'react';

type IntersectionObserverCallback = (entry: IntersectionObserverEntry) => void;

export const useIntersection = (
  onIntersect: () => void,
  options?: IntersectionObserverInit
) => {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      // FIX: Safely access the first entry to prevent errors on empty arrays.
      const entry = entries[0];
      if (entry && entry.isIntersecting) {
        onIntersect();
      }
    },
    [onIntersect]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(callback, options);
    const element = ref.current;
    if (element) {
      observer.observe(element);
    }
    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [ref, options, callback]);

  return ref;
};
