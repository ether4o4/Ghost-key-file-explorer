export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatFullDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}

export function getExtColor(ext: string): string {
  const map: Record<string, string> = {
    jpg: '#00d4ff', jpeg: '#00d4ff', png: '#00d4ff', gif: '#00d4ff', webp: '#00d4ff',
    mp4: '#ff6b35', mov: '#ff6b35', avi: '#ff6b35',
    mp3: '#ffd700', wav: '#ffd700', flac: '#ffd700',
    zip: '#ff3355', tar: '#ff3355', gz: '#ff3355', rar: '#ff3355',
    js: '#00ff88', ts: '#00ff88', py: '#00ff88',
    pdf: '#6c63ff', doc: '#6c63ff', docx: '#6c63ff',
    txt: '#64748b', md: '#64748b', log: '#64748b',
  };
  return map[ext.toLowerCase()] ?? '#64748b';
}

export function randomColor(): string {
  const colors = ['#6c63ff', '#00d4ff', '#00ff88', '#ffd700', '#ff6b35', '#ff3355'];
  return colors[Math.floor(Math.random() * colors.length)];
}
