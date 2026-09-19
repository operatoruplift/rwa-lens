export function LensMark({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <svg className={className} width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M20 3 36 12.2v15.6L20 37 4 27.8V12.2L20 3Z" fill={light ? '#ffffff' : '#101a3a'} />
      <path d="m20 8 11.8 6.8-11.8 7-11.8-7L20 8Z" fill="#9e9ff8" />
      <path d="M8.2 19.6 20 26.5l11.8-6.9M8.2 24.7 20 31.6l11.8-6.9" stroke={light ? '#101a3a' : '#fff'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 21.8v9.8" stroke={light ? '#101a3a' : '#fff'} strokeWidth="1.5" />
    </svg>
  );
}

export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`brand ${light ? 'brand-light' : ''}`}><LensMark light={light} /><span>RWA <em>Lens</em><span className="brand-period">.</span></span></span>;
}
