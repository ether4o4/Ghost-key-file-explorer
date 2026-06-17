import React, { useState } from 'react';
import { TAG_AXES, emptyTags } from '../../store/explorerStore';
import type { FolderTags, TagAxis } from '../../store/explorerStore';
import { Icon } from './Icons';
import { AXIS_META } from './tagMeta';

function addUnique(list: string[], values: string[]): string[] {
  const out = [...list];
  for (const raw of values) {
    const v = raw.trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

interface Props {
  title: string;
  initial: FolderTags;
  vocab: FolderTags; // previously-used values per axis, offered as quick picks
  saveLabel: string;
  skipLabel: string;
  onSave: (tags: FolderTags) => void;
  onSkip: () => void;
}

export const TagPrompt: React.FC<Props> = ({ title, initial, vocab, saveLabel, skipLabel, onSave, onSkip }) => {
  const [tags, setTags] = useState<FolderTags>(() => ({
    who: [...initial.who],
    what: [...initial.what],
    when: [...initial.when],
    where: [...initial.where],
  }));
  const [drafts, setDrafts] = useState<Record<TagAxis, string>>(() => ({ ...emptyDrafts() }));

  const commit = (axis: TagAxis) => {
    const parts = drafts[axis].split(',');
    setTags((t) => ({ ...t, [axis]: addUnique(t[axis], parts) }));
    setDrafts((d) => ({ ...d, [axis]: '' }));
  };

  const removeValue = (axis: TagAxis, value: string) =>
    setTags((t) => ({ ...t, [axis]: t[axis].filter((v) => v !== value) }));

  const addValue = (axis: TagAxis, value: string) => setTags((t) => ({ ...t, [axis]: addUnique(t[axis], [value]) }));

  const save = () => {
    // Fold any unsubmitted draft text in before saving.
    const merged: FolderTags = emptyTags();
    for (const axis of TAG_AXES) merged[axis] = addUnique(tags[axis], drafts[axis].split(','));
    onSave(merged);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onSkip}>
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="relative w-full max-w-[380px] rounded-2xl border border-ghost-border bg-ghost-surface shadow-2xl glass animate-fade-in flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ghost-border">
          <Icon name="tag" size={16} className="text-ghost-accent shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ghost-text truncate">Categorize folder</div>
            <div className="text-[11px] text-ghost-muted truncate">{title}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {TAG_AXES.map((axis) => {
            const meta = AXIS_META[axis];
            const suggestions = vocab[axis].filter((v) => !tags[axis].some((x) => x.toLowerCase() === v.toLowerCase()));
            return (
              <div key={axis}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                  <span className="text-[12px] font-medium text-ghost-text">{meta.label}</span>
                  <span className="text-[10px] text-ghost-muted">{meta.hint}</span>
                </div>

                {tags[axis].length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {tags[axis].map((v) => (
                      <span
                        key={v}
                        className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] border"
                        style={{ borderColor: `${meta.color}66`, background: `${meta.color}1f`, color: '#e2e8f0' }}
                      >
                        {v}
                        <button
                          onClick={() => removeValue(axis, v)}
                          className="w-3.5 h-3.5 grid place-items-center rounded-full hover:bg-ghost-red/70 hover:text-white text-ghost-dim"
                        >
                          <Icon name="x" size={9} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <input
                    value={drafts[axis]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [axis]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        commit(axis);
                      }
                    }}
                    placeholder={`Add ${meta.label.toLowerCase()}…`}
                    className="flex-1 min-w-0 bg-ghost-card border border-ghost-border rounded-lg px-2.5 py-1.5 text-[12px] text-ghost-text outline-none focus:border-ghost-accent"
                  />
                  <button
                    onClick={() => commit(axis)}
                    title="Add"
                    className="shrink-0 w-8 h-8 grid place-items-center rounded-lg bg-ghost-card border border-ghost-border text-ghost-muted hover:text-ghost-text hover:border-ghost-accent/50"
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </div>

                {suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {suggestions.slice(0, 8).map((v) => (
                      <button
                        key={v}
                        onClick={() => addValue(axis, v)}
                        className="px-2 py-0.5 rounded-full text-[11px] border border-ghost-border text-ghost-muted hover:text-ghost-text hover:border-ghost-accent/50"
                      >
                        + {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-ghost-border">
          <button
            onClick={onSkip}
            className="px-3 py-1.5 rounded-lg text-[12px] text-ghost-muted hover:text-ghost-text hover:bg-ghost-card transition-colors"
          >
            {skipLabel}
          </button>
          <button
            onClick={save}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-ghost-accent/25 border border-ghost-accent/50 text-ghost-text hover:bg-ghost-accent/35 transition-colors"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

function emptyDrafts(): Record<TagAxis, string> {
  return { who: '', what: '', when: '', where: '' };
}
