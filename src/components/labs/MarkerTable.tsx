"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeUp, staggerContainer } from "@/lib/motion";
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
      <div className="sticky top-0 z-10 pb-2" style={{ background: "var(--bg-base)" }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search markers..."
          className="w-full rounded-xl px-3 py-2 text-sm"
          style={{
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-active)",
          }}
        />

        {/* Filter pills */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-hide">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const statusColor = f.key !== "all" ? STATUS_CONFIG[f.key as BiomarkerStatus].color : undefined;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-all"
                style={{
                  background: active ? (statusColor ?? "var(--accent)") : "var(--bg-elevated)",
                  color: active ? "#fff" : "var(--text-muted)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="space-y-1.5 mt-1"
      >
        <AnimatePresence mode="popLayout">
          {visible.map((s) => (
            <MarkerRow key={s.biomarkerId} snapshot={s} onSelect={() => onSelect(s.biomarkerId)} />
          ))}
        </AnimatePresence>
      </motion.div>

      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-3 py-2 text-xs font-bold rounded-xl transition-all hover:scale-[1.01]"
          style={{ background: "var(--bg-elevated)", color: "var(--accent)" }}
        >
          Show all {filtered.length} markers
        </button>
      )}

      {visible.length === 0 && (
        <p className="text-center text-sm py-6" style={{ color: "var(--text-muted)" }}>
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
  const trendColor = trend === "improving" ? "#22c55e" : trend === "declining" ? "#ef4444" : "var(--text-muted)";

  return (
    <motion.button
      variants={fadeUp}
      layout
      onClick={onSelect}
      className="w-full rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: "var(--bg-card)", boxShadow: "var(--shadow-sm)" }}
    >
      {/* Status dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: STATUS_CONFIG[latest.status].color }}
      />

      {/* Name */}
      <div className="flex-1 text-left min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
          {meta.shortName ?? meta.name}
        </p>
      </div>

      {/* Sparkline */}
      {history.length >= 2 && (
        <Sparkline readings={history} status={latest.status} />
      )}

      {/* Value */}
      <div className="text-right flex items-center gap-1.5 shrink-0">
        <span className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {latest.value}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{latest.unit}</span>
        {trendIcon && (
          <span className="text-[10px] font-black" style={{ color: trendColor }}>{trendIcon}</span>
        )}
      </div>
    </motion.button>
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
