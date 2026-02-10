import { useNavigate } from 'react-router-dom';
import './DataPanel.css';

export default function DataPanel() {
  const navigate = useNavigate();

  return (
    <button className="data-fab" onClick={() => navigate('/data')}>
      Data
    </button>
  );
}
