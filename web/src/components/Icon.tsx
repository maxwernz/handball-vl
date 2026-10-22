export type IconName = 'calendar' | 'live' | 'leagues' | 'stats' | 'search' | 'arrow' | 'chevron-left' | 'chevron-right' | 'star' | 'close' | 'check' | 'settings' | 'share';
const paths: Record<IconName, string> = {
  calendar: 'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 9h2m4 0h2m-8 3h2',
  live: 'M5 6a9 9 0 0 0 0 12M8 9a5 5 0 0 0 0 6m8-6a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12M12 10v4',
  leagues: 'M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8m-6-3h4v3',
  stats: 'M5 20V11m7 9V4m7 16v-7',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  'chevron-left': 'm14 6-6 6 6 6',
  'chevron-right': 'm10 6 6 6-6 6',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  share: 'M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7',
};
export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
