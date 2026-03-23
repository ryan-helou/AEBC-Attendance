import { useState, useEffect } from 'react';

export function useScrolledDown(threshold = 30) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      if (window.scrollY > threshold) {
        setScrolled(true);
      } else if (window.scrollY < 5) {
        setScrolled(false);
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return scrolled;
}
