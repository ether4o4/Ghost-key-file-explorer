/** Minimal self-contained icon set (lucide-style strokes) for the explorer. */
/* eslint-disable react-refresh/only-export-components -- icon component + colocated
   mapping helper; this module is pure and never hot-reloads on its own. */
import React from 'react';

type IconName =
  | 'folder'
  | 'folderOpen'
  | 'file'
  | 'fileText'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'code'
  | 'arrowUp'
  | 'refresh'
  | 'folderPlus'
  | 'grid'
  | 'list'
  | 'minus'
  | 'square'
  | 'restore'
  | 'x'
  | 'collapse'
  | 'expand'
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'trash'
  | 'pencil'
  | 'open'
  | 'drive'
  | 'documents'
  | 'download'
  | 'plus'
  | 'home'
  | 'copy'
  | 'move'
  | 'tag'
  | 'filter'
  | 'more'
  | 'settings'
  | 'info'
  | 'search';

const PATHS: Record<IconName, React.ReactNode> = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  folderOpen: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2" />
      <path d="m3 9 2.5 9a1 1 0 0 0 1 1h13l2.2-8a1 1 0 0 0-1-1.2H4" />
    </>
  ),
  file: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6" />,
  fileText: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6" />
      <path d="M8 13h8M8 17h6" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m4 17 5-5 4 4 3-3 4 4" />
    </>
  ),
  audio: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="m17 9 4-2v10l-4-2z" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16M10 8h4M10 12h4" />
    </>
  ),
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" />,
  folderPlus: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 11v6M9 14h6" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  minus: <path d="M5 12h14" />,
  square: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  restore: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M5 16V6a1 1 0 0 1 1-1h10" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  collapse: <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />,
  expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7M10 11v6M14 11v6" />,
  pencil: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  open: <path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />,
  drive: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h.01M7 15h10" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="m3 11 9-8 9 8M5 10v10h14V10" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>
  ),
  move: <path d="M12 3v18M3 12h18M8 7l-5 5 5 5M16 7l5 5-5 5M7 8l5-5 5 5M7 16l5 5 5-5" />,
  tag: (
    <>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H11a2 2 0 0 1 1.4.6l8 8a2 2 0 0 1 0 2.8l-5.6 5.6a2 2 0 0 1-2.8 0l-8-8A2 2 0 0 1 3 10.5z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </>
  ),
  filter: <path d="M22 4H2l8 9v7l4-2v-5z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5h.01" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
};

export type { IconName };

export const Icon: React.FC<{ name: IconName; size?: number; className?: string }> = ({
  name,
  size = 16,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {PATHS[name]}
  </svg>
);

/** Map a file entry to an icon + accent colour. */
export function entryIcon(kind: 'file' | 'directory', ext: string): { name: IconName; color: string } {
  if (kind === 'directory') return { name: 'folder', color: '#6c63ff' };
  const e = ext.toLowerCase();
  const groups: Array<[IconName, string, string[]]> = [
    ['image', '#00d4ff', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'avif']],
    ['video', '#ff6b35', ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']],
    ['audio', '#ffd700', ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a']],
    ['archive', '#ff3355', ['zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz']],
    ['code', '#00ff88', ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'sh', 'html', 'css', 'json', 'xml', 'yml', 'yaml']],
    ['fileText', '#cbd5e1', ['txt', 'md', 'log', 'csv', 'rtf', 'pdf', 'doc', 'docx']],
  ];
  for (const [name, color, exts] of groups) {
    if (exts.includes(e)) return { name, color };
  }
  return { name: 'file', color: '#64748b' };
}
