import type { TagAxis } from '../../store/explorerStore';

/** Per-axis display metadata for the who/what/when/where filing dimensions. */
export const AXIS_META: Record<TagAxis, { label: string; hint: string; color: string }> = {
  who: { label: 'Who', hint: 'people, owners…', color: '#00d4ff' },
  what: { label: 'What', hint: 'topic, type, project…', color: '#6c63ff' },
  when: { label: 'When', hint: 'year, event, period…', color: '#ffd700' },
  where: { label: 'Where', hint: 'place, source…', color: '#00ff88' },
};
