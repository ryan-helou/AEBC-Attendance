import './Skeleton.css';

function Bone({ width = '100%', height = 16, style, className = '' }: {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
  className?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ width, height, ...style }} />;
}

export function LandingSkeleton() {
  return (
    <div className="skeleton-page">
      <div className="skeleton-header">
        <Bone width={40} height={40} className="skeleton-circle" />
        <div style={{ flex: 1 }}>
          <Bone width="60%" height={22} />
          <Bone width="35%" height={14} style={{ marginTop: 6 }} />
        </div>
      </div>
      <div className="skeleton-landing-cards">
        <Bone className="skeleton-card" />
        <Bone className="skeleton-card" />
        <Bone className="skeleton-card" />
      </div>
      <Bone height={44} style={{ marginTop: 24, borderRadius: 10 }} />
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="skeleton-page">
      <div className="skeleton-header">
        <Bone width={32} height={32} className="skeleton-circle" />
        <Bone width="50%" height={24} />
      </div>
      <Bone height={70} style={{ borderRadius: 12, marginBottom: 12 }} />
      <Bone height={40} style={{ borderRadius: 8, marginBottom: 16 }} />
      <Bone className="skeleton-profile-meeting" />
      <Bone className="skeleton-profile-meeting" />
    </div>
  );
}

export function DataSkeleton() {
  return (
    <div className="skeleton-page">
      <div className="skeleton-header">
        <Bone width={32} height={32} className="skeleton-circle" />
        <Bone width="45%" height={24} />
      </div>
      <Bone className="skeleton-search" />
      {Array.from({ length: 8 }, (_, i) => (
        <Bone key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

export function HistorySkeleton() {
  return (
    <div className="skeleton-page">
      <div className="skeleton-header">
        <Bone width={32} height={32} className="skeleton-circle" />
        <Bone width="55%" height={24} />
      </div>
      <Bone className="skeleton-chart" />
      <Bone className="skeleton-table-header" />
      {Array.from({ length: 6 }, (_, i) => (
        <Bone key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

export function AttendanceSkeleton() {
  return (
    <div className="skeleton-page">
      <div className="skeleton-header">
        <Bone width={32} height={32} className="skeleton-circle" />
        <Bone width="50%" height={24} />
      </div>
      <Bone className="skeleton-search" />
      <Bone width="30%" height={18} style={{ marginBottom: 12 }} />
      {Array.from({ length: 5 }, (_, i) => (
        <Bone key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
