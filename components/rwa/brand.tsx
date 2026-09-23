import styles from './brand.module.css';

export function LensMark({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <svg className={className} width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="16" stroke={light ? '#f2f2e9' : '#101211'} strokeWidth="2.5" />
      <ellipse cx="20" cy="20" rx="9" ry="16" transform="rotate(38 20 20)" stroke={light ? '#f2f2e9' : '#101211'} strokeWidth="2.5" />
      <circle cx="31.3" cy="8.7" r="3.6" fill={light ? '#d9ff65' : '#101211'} stroke={light ? '#101211' : '#f2f2e9'} strokeWidth="1.5" />
    </svg>
  );
}

export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`${styles.brand} ${light ? styles.light : ''}`}><LensMark light={light} /><span>RWA Lens</span></span>;
}
