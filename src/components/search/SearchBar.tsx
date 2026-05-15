import React, { useEffect, useRef } from 'react';
import { Search, X, Filter, SlidersHorizontal } from 'lucide-react';
import { useGKStore } from '../../store';
import { Spinner } from '../common/UI';

export const SearchBar: React.FC = () => {
  const {
    searchQuery, setSearch, performSearch, clearSearch,
    isSearching, searchResults, files,
  } = useGKStore();
  const [showFilters, setShowFilters] = React.useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) performSearch();
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') clearSearch();
    if (e.key === 'Enter') performSearch();
  };

  const isActive = searchQuery.trim().length > 0;
  const resultCount = isActive ? searchResults.length : files.length;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 bg-ghost-card border border-ghost-border rounded-lg px-3 py-2 focus-within:border-ghost-accent/60 transition-colors">
        <Search size={14} className="text-ghost-muted shrink-0" />
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Search files… (try "John + Snapchat + March")`}
          className="flex-1 bg-transparent text-sm text-ghost-text placeholder-ghost-muted/50 focus:outline-none"
        />
        <div className="flex items-center gap-1 shrink-0">
          {isSearching && <Spinner size={12} />}
          {isActive && (
            <span className="text-[10px] text-ghost-muted">
              {resultCount} result{resultCount !== 1 ? 's' : ''}
            </span>
          )}
          {isActive && (
            <button onClick={clearSearch} className="text-ghost-muted hover:text-ghost-text">
              <X size={14} />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`text-ghost-muted hover:text-ghost-text transition-colors ${showFilters ? 'text-ghost-accent' : ''}`}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Search hints */}
      {isActive && (
        <div className="text-[9px] text-ghost-muted px-1 flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Filter size={8} />
            Semantic search: terms joined by <kbd className="bg-ghost-border px-0.5 rounded font-mono">+</kbd>
          </span>
          {isSearching && <span className="text-ghost-accent">Searching…</span>}
        </div>
      )}

      {/* Quick filter pills */}
      {showFilters && (
        <SearchFilters />
      )}
    </div>
  );
};

const QUICK_SOURCES = ['Downloads', 'Desktop', 'iCloud', 'Snapchat', 'Instagram', 'WhatsApp'];
const QUICK_TYPES = ['Image', 'Video', 'Document', 'Archive', 'Code', 'Log'];

const SearchFilters: React.FC = () => {
  const { searchFilters, setSearch, performSearch, searchQuery } = useGKStore();

  const toggleWhere = (source: string) => {
    const current = searchFilters.where ?? [];
    const updated = current.includes(source)
      ? current.filter(s => s !== source)
      : [...current, source];
    setSearch(searchQuery, { ...searchFilters, where: updated.length ? updated : undefined });
    setTimeout(performSearch, 0);
  };

  const toggleWhat = (type: string) => {
    const current = searchFilters.what ?? [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setSearch(searchQuery, { ...searchFilters, what: updated.length ? updated : undefined });
    setTimeout(performSearch, 0);
  };

  return (
    <div className="bg-ghost-card border border-ghost-border rounded-lg p-3 space-y-3">
      <div>
        <div className="text-[9px] text-ghost-muted uppercase tracking-wider mb-1.5">Source (Where)</div>
        <div className="flex flex-wrap gap-1">
          {QUICK_SOURCES.map(source => (
            <button
              key={source}
              onClick={() => toggleWhere(source)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                searchFilters.where?.includes(source)
                  ? 'bg-ghost-green/20 border-ghost-green/40 text-ghost-green'
                  : 'border-ghost-border text-ghost-muted hover:border-ghost-accent/40'
              }`}
            >
              {source}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[9px] text-ghost-muted uppercase tracking-wider mb-1.5">Type (What)</div>
        <div className="flex flex-wrap gap-1">
          {QUICK_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleWhat(type)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                searchFilters.what?.includes(type)
                  ? 'bg-ghost-accent/20 border-ghost-accent/40 text-ghost-accent'
                  : 'border-ghost-border text-ghost-muted hover:border-ghost-accent/40'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
