const FLAGS = import.meta.glob<string>('../../../node_modules/flag-icons/flags/1x1/*.svg', { query: '?url&no-inline', import: 'default', eager: true });

export function flagUrl(code: string): string | undefined {
  return FLAGS[`../../../node_modules/flag-icons/flags/1x1/${code.toLowerCase()}.svg`];
}

export function Flag({ code, className = '', size }: { code: string; className?: string; size?: number }) {
  const src = flagUrl(code);
  if (!src) return null;
  return <img src={src} alt="" draggable={false} className={`flag ${className}`} style={size ? { width: size, height: size } : undefined} />;
}
