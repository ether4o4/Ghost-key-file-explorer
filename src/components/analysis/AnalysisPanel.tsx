import React from 'react';
import { Brain, User, Phone, Mail, Globe, Link, Calendar, Zap } from 'lucide-react';
import { useGKStore } from '../../store';
import { Button, Badge, Spinner } from '../common/UI';
import { riskScoreColor, riskLabel } from '../../core/analyzer';
import type { AnalysisResult } from '../../core/db';
import { formatDate } from '../../utils/format';

// ─── Risk Gauge ───────────────────────────────────────────────────────────────

const RiskGauge: React.FC<{ score: number }> = ({ score }) => {
  const color = riskScoreColor(score);
  const pct = (score / 10) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ghost-muted">Risk Score</span>
        <span style={{ color }} className="font-bold font-mono">
          {score.toFixed(1)}/10 <span className="text-[9px]">{riskLabel(score)}</span>
        </span>
      </div>
      <div className="h-1.5 bg-ghost-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}60` }}
        />
      </div>
    </div>
  );
};

// ─── Entity Section ───────────────────────────────────────────────────────────

const EntitySection: React.FC<{
  icon: React.ReactNode;
  title: string;
  items: string[];
  color?: string;
}> = ({ icon, title, items, color = '#64748b' }) => {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-ghost-muted uppercase tracking-wider">{title}</span>
        <Badge color={color} size="xs">{items.length}</Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.slice(0, 8).map((item, i) => (
          <span
            key={i}
            className="text-[10px] px-1.5 py-0.5 rounded border"
            style={{ background: `${color}10`, color, borderColor: `${color}30` }}
          >
            {item}
          </span>
        ))}
        {items.length > 8 && (
          <span className="text-[9px] text-ghost-muted px-1 py-0.5">+{items.length - 8}</span>
        )}
      </div>
    </div>
  );
};

// ─── Analysis Result View ─────────────────────────────────────────────────────

export const AnalysisResultView: React.FC<{ result: AnalysisResult }> = ({ result }) => (
  <div className="space-y-4">
    {/* Summary */}
    <div className="bg-ghost-bg rounded-lg border border-ghost-border p-3">
      <p className="text-xs text-ghost-text leading-relaxed">{result.summary}</p>
      <span className="text-[9px] text-ghost-muted mt-1 block">
        Analyzed {formatDate(result.analyzedAt)}
      </span>
    </div>

    {/* Risk gauge */}
    <RiskGauge score={result.riskScore} />

    {/* Entities */}
    <div className="space-y-3">
      <EntitySection icon={<User size={11} />} title="Names / People" items={result.entities.names} color="#00d4ff" />
      <EntitySection icon={<Phone size={11} />} title="Phone Numbers" items={result.entities.phones} color="#ff6b35" />
      <EntitySection icon={<Mail size={11} />} title="Email Addresses" items={result.entities.emails} color="#6c63ff" />
      <EntitySection icon={<Globe size={11} />} title="Platforms / Domains" items={result.entities.domains} color="#00ff88" />
      <EntitySection icon={<Link size={11} />} title="URLs" items={result.entities.urls} color="#64748b" />
      <EntitySection icon={<Calendar size={11} />} title="Dates" items={result.entities.dates} color="#ffd700" />
      <EntitySection icon={<Zap size={11} />} title="Keywords" items={result.entities.keywords} color="#ff3355" />
    </div>

    {/* Patterns */}
    {result.patterns.length > 0 && (
      <div>
        <div className="text-[10px] text-ghost-muted uppercase tracking-wider mb-1.5">Detected Patterns</div>
        <div className="space-y-1">
          {result.patterns.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-ghost-text">
              <span className="w-1.5 h-1.5 rounded-full bg-ghost-accent shrink-0" />
              {p}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

// ─── Analysis Panel ───────────────────────────────────────────────────────────

export const AnalysisPanel: React.FC = () => {
  const { selectedFileIds, files, analyzeFileAction } = useGKStore();
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<Array<{ name: string; result: AnalysisResult }>>([]);
  const [activeIdx, setActiveIdx] = React.useState(0);

  const selectedFiles = files.filter(f => f.id && selectedFileIds.includes(f.id));

  // Show existing analysis results
  const filesWithAnalysis = selectedFiles.filter(f => f.analysisResult);

  const handleAnalyzeAll = async () => {
    setLoading(true);
    const newResults: Array<{ name: string; result: AnalysisResult }> = [];
    for (const file of selectedFiles) {
      if (file.id) {
        const r = await analyzeFileAction(file.id);
        if (r) newResults.push({ name: file.name, result: r });
      }
    }
    setResults(newResults);
    setActiveIdx(0);
    setLoading(false);
  };

  const displayResults = results.length > 0
    ? results
    : filesWithAnalysis.map(f => ({ name: f.name, result: f.analysisResult! }));

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-ghost-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-ghost-yellow" />
            <span className="text-xs font-medium text-ghost-text">Analysis Engine</span>
          </div>
          {selectedFiles.length > 0 && (
            <Button
              variant="primary"
              size="xs"
              onClick={handleAnalyzeAll}
              disabled={loading}
              icon={loading ? <Spinner size={12} /> : <Brain size={12} />}
            >
              {loading ? 'Analyzing…' : `Analyze ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
        {selectedFiles.length === 0 && (
          <p className="text-[10px] text-ghost-muted mt-1">
            Select files in the right pane to analyze
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {displayResults.length > 0 ? (
          <div>
            {/* Tab bar for multiple files */}
            {displayResults.length > 1 && (
              <div className="flex gap-1 px-4 py-2 border-b border-ghost-border overflow-x-auto">
                {displayResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveIdx(i)}
                    className={`text-[10px] px-2 py-1 rounded whitespace-nowrap transition-colors ${
                      activeIdx === i
                        ? 'bg-ghost-accent/20 text-ghost-accent border border-ghost-accent/30'
                        : 'text-ghost-muted hover:text-ghost-text'
                    }`}
                  >
                    {r.name.slice(0, 20)}{r.name.length > 20 ? '…' : ''}
                  </button>
                ))}
              </div>
            )}
            <div className="p-4">
              <AnalysisResultView result={displayResults[activeIdx].result} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Brain size={32} className="text-ghost-muted opacity-30 mb-3" />
            <p className="text-xs text-ghost-muted">Select files and click Analyze</p>
            <p className="text-[9px] text-ghost-dim mt-1">
              Extracts names, phones, emails, domains, patterns — no AI required
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
