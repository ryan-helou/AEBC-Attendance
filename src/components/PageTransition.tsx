import { useState, useEffect } from 'react';
import './PageTransition.css';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);
  return (
    <div className={`page-transition ${visible ? 'page-enter-active' : 'page-enter'}`}>
      {children}
    </div>
  );
}
