import { useScrolledDown } from '../hooks/useScrolledDown';
import './ScrollToTop.css';

export default function ScrollToTop() {
  const visible = useScrolledDown(200);

  if (!visible) return null;

  return (
    <button
      className="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Scroll to top"
    >
      &uarr;
    </button>
  );
}
