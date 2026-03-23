import { useState, useEffect } from 'react';

export function useScrolledDown(threshold = 30, hysteresis = 10) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(prev => {
        if (prev) {
          // Already compact — only expand back when scrolled well above threshold
          return window.scrollY > threshold - hysteresis;
        }
        // Not compact — only collapse when scrolled past threshold
        return window.scrollY > threshold;
      });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold, hysteresis]);

  return scrolled;
}
