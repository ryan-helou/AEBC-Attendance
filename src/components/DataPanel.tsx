import { useNavigate } from 'react-router-dom';
import './DataPanel.css';

export default function DataPanel() {
  const navigate = useNavigate();

  return (
    <div className="fab-group">
      <button className="data-fab" onClick={() => navigate('/data')}>
        Data
      </button>
      <button className="ideas-fab" onClick={() => navigate('/ideas')}>
        Ideas
      </button>
    </div>
  );
}
