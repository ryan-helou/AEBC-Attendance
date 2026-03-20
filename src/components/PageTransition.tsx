import { useLocation } from 'react-router-dom';
import { useRef, useLayoutEffect, useState } from 'react';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(location.key);

  useLayoutEffect(() => {
    if (location.key !== prevKey.current) {
      setVisible(false);
      prevKey.current = location.key;
    }
    // Trigger fade-in on next frame
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [location.key]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 250ms ease-out, transform 250ms ease-out',
      }}
    >
      {children}
    </div>
  );
}
