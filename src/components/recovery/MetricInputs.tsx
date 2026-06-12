"use client";

let nextId = 0;

export function MetricInput({ label, value, onChange, unit, placeholder, min, max }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void;
  unit?: string; placeholder?: string; min?: number; max?: number;
}) {
  const id = `metric-${label.replace(/\s+/g, "-").toLowerCase()}-${nextId++}`;
  return (
    <div className="flex items-center justify-between py-2">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input id={id} type="number" value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          placeholder={placeholder || "-"} min={min} max={max} aria-label={label}
          className="flex-1 min-w-0 max-w-24 text-right px-2 py-1.5 rounded-lg border text-sm font-mono outline-none transition-all inline-touch"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
        {unit && <span className="text-xs w-8" style={{ color: "var(--text-muted)" }}>{unit}</span>}
      </div>
    </div>
  );
}

export function TextMetricInput({ label, value, onChange, placeholder }: {
  label: string; value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string;
}) {
  const id = `text-metric-${label.replace(/\s+/g, "-").toLowerCase()}-${nextId++}`;
  return (
    <div className="flex items-center justify-between py-2">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <input id={id} type="text" value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder || "-"} aria-label={label}
        className="flex-1 min-w-0 max-w-24 text-right px-2 py-1.5 rounded-lg border text-sm font-mono outline-none transition-all inline-touch"
        style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
    </div>
  );
}

export function SelectMetricInput({ label, value, onChange, options }: {
  label: string; value: string | undefined; onChange: (v: string | undefined) => void; options: string[];
}) {
  const id = `select-metric-${label.replace(/\s+/g, "-").toLowerCase()}-${nextId++}`;
  return (
    <div className="flex items-center justify-between py-2">
      <label htmlFor={id} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{label}</label>
      <select id={id} value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-label={label}
        className="text-right px-2 py-1.5 rounded-lg border text-sm outline-none transition-all appearance-none inline-touch"
        style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
        <option value="">-</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
