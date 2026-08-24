"use client";

import { useState, useMemo } from "react";
import { STATUS_CONFIG, type BiomarkerStatus } from "@/types/biomarker";
import type { BiomarkerSnapshot } from "@/types/biomarker";

interface Props {
  markers: BiomarkerSnapshot[];
  onSelect: (biomarkerId: string) => void;
  /** Pre-filter to a specific status. */
  initialFilter?: BiomarkerStatus | null;
  /** Max markers to show before "show more". */
  limit?: number;
}

type Filter = "all" | BiomarkerStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "optimal", label: "Optimal" },
  { key: "normal", label: "Normal" },
  { key: "attention", label: "Attention" },
  { key: "out_of_range", label: "Out of Range" },
];

export function MarkerTable({ markers, onSelect, initialFilter, limit }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    let list = markers;
    if (filter !== "all") {
      list = list.filter((s) => s.latest.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.meta.name.toLowerCase().includes(q) ||
          (s.meta.shortName?.toLowerCase().includes(q) ?? false) ||
          s.biomarkerId.includes(q),
      );
    }
    return list;
  }, [markers, filter, search]);

  const cap = limit ?? 20;
  const visible = showAll ? filtered : filtered.slice(0, cap);
  const hasMore = filtered.length > cap && !showAll;

  return (
    <div>
      {/* Search */}
      <div className="sticky top-0 z-10 pb-2 bg-surface-base">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search markers..."
          className="input-field w-full h-11 rounded-button px-3 text-sm bg-surface-input text-content-primary placeholder:text-content-muted border border-active"
        />

        {/* Filter pills */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const statusColor = f.key !== "all" ? STATUS_CONFIG[f.key as BiomarkerStatus].color : undefined;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="pressable shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-colors"
                style={{
                  background: active ? (statusColor ?? "var(--accent)") : "var(--bg-elevated)",
                  color: active ? (statusColor ? "#fff" : "var(--accent-contrast)") : "var(--text-muted)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div className="anim-stagger space-y-2 mt-1">
        {visible.map((s, i) => (
          <div
            key={s.biomarkerId}
            className="anim-fade-up"
            style={{ "--stagger-i": i } as React.CSSProperties}
          >
            <MarkerRow snapshot={s} onSelect={() => onSelect(s.biomarkerId)} />
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="pressable w-full mt-3 h-11 text-xs font-bold rounded-button bg-surface-elevated text-accent"
        >
          Show all {filtered.length} markers
        </button>
      )}

      {visible.length === 0 && (
        <p className="text-center text-sm py-6 text-content-muted">
          No markers found
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marker row with inline sparkline
// ---------------------------------------------------------------------------

function MarkerRow({ snapshot, onSelect }: { snapshot: BiomarkerSnapshot; onSelect: () => void }) {
  const { meta, latest, trend, history } = snapshot;
  const trendIcon = trend === "improving" ? "+" : trend === "declining" ? "-" : trend === "stable" ? "=" : "";
  const trendColor = trend === "improving" ? "var(--accent)" : trend === "declining" ? "var(--danger)" : "var(--text-muted)";

  return (
    <button
      onClick={onSelect}
      className="pressable glass-card w-full rounded-card px-3 py-2.5 flex items-center gap-2.5"
    >
      {/* Status dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: STATUS_CONFIG[latest.status].color }}
      />

      {/* Name */}
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-bold truncate text-content-primary">
          {meta.shortName ?? meta.name}
        </p>
      </div>

      {/* Sparkline */}
      {history.length >= 2 && (
        <Sparkline readings={history} status={latest.status} />
      )}

      {/* Value */}
      <div className="text-right flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-bold tabular-nums text-content-primary">
          {latest.value}
        </span>
        <span className="text-[10px] text-content-muted">{latest.unit}</span>
        {trendIcon && (
          <span className="text-[10px] font-black" style={{ color: trendColor }}>{trendIcon}</span>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tiny sparkline SVG
// ---------------------------------------------------------------------------

function Sparkline({ readings, status }: { readings: { value: number; date: string }[]; status: BiomarkerStatus }) {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 56;
  const h = 22;
  const pad = 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={STATUS_CONFIG[status].color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
    </svg>
  );
}
