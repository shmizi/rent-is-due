export const SET_ICONS: Record<string, string> = {
  circle: 'M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14z',
  triangle: 'M12 4l8 15H4z',
  square: 'M5 5h14v14H5z',
  diamond: 'M12 3l9 9-9 9-9-9z',
  plus: 'M12 4v16M4 12h16',
  hexagon: 'M7 4h10l5 8-5 8H7l-5-8z',
  cross: 'M5 5l14 14M19 5L5 19',
  bars: 'M4 8h16M4 16h16'
};

export const SPACE_ICONS: Record<string, string> = {
  transit: 'M21 15.5v-2L13 9V4a1.5 1.5 0 0 0-3 0v5l-8 4.5v2l8-2.5v4.5l-2.5 1.8V21l4-1 4 1v-1.7L13 17.5V13z',
  power: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  water: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  wildcard: 'M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z',
  dispatch: 'M3 6h18v12H3zM3 6l9 7 9-7',
  tax: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16zM12 8v8M15 10h-4a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-4',
  start: 'M20 12H4M10 6l-6 6 6 6',
  jail: 'M5 4v16M10 4v16M15 4v16M20 4v16M3 4h19M3 20h19',
  free: 'M12 3v18M3 12h18M12 7a5 5 0 1 1 0 10a5 5 0 1 1 0-10z',
  goToJail: 'M12 3v3M5 6l2 2M19 6l-2 2M6 20v-6a6 6 0 0 1 12 0v6zM4 20h16'
};

export const TOKEN_PATHS: Record<string, string> = {
  circle: 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20z',
  square: 'M3 3h18v18H3z',
  diamond: 'M12 1l11 11-11 11L1 12z',
  hex: 'M6.5 2h11L23 12l-5.5 10h-11L1 12z'
};

export function Icon({ path, size = 18, stroke = 'currentColor', width = 2, className }: { path: string; size?: number | string; stroke?: string; width?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={path} />
    </svg>
  );
}

export const UI_ICONS = {
  send: 'M4 12h15M13 6l6 6-6 6',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  trade: 'M7 7h13l-4-4M17 17H4l4 4',
  wifiOff: 'M3 3l18 18M8.5 12.5a5 5 0 0 1 7 0M5 9a10 10 0 0 1 3-2M12 18h.01'
};
