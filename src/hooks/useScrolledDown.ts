import { useState, useEffect, useRef } from 'react';

export function useScrolledDown(threshold = 30) {
  const [scrolled, setScrolled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleScroll() {
      const shouldBeScrolled = window.scrollY > threshold;
      // Only schedule a change if the value is actually different
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setScrolled(shouldBeScrolled);
      }, 80);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [threshold]);

  return scrolled;
}
